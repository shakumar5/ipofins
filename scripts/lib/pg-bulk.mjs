/**
 * Fast bulk writes via direct Postgres (Neon TCP) — much faster than HTTP per-row/batch.
 */

import pg from 'pg';
import { normalizeStockListingRow } from './listing-codes.mjs';

const { Pool } = pg;

let pool = null;

export function getPgPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: true },
    max: 3,
  });
  return pool;
}

export async function closePgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Bulk upsert fund_holdings using UNNEST (one round-trip per chunk).
 */
export async function bulkUpsertFundHoldings(rows, chunkSize = 3000) {
  const pool = getPgPool();
  let inserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const fundIds = chunk.map((r) => r.fund_id);
    const stockIds = chunk.map((r) => r.stock_id);
    const months = chunk.map((r) => r.month);
    const quantities = chunk.map((r) => r.quantity);
    const marketValues = chunk.map((r) => r.market_value);
    const pcts = chunk.map((r) => r.pct_to_nav);

    await pool.query(
      `INSERT INTO fund_holdings (fund_id, stock_id, month, quantity, market_value, pct_to_nav)
       SELECT u.fund_id, u.stock_id, u.month::date, u.quantity, u.market_value, u.pct_to_nav
       FROM UNNEST(
         $1::int[], $2::int[], $3::text[],
         $4::double precision[], $5::double precision[], $6::double precision[]
       ) AS u(fund_id, stock_id, month, quantity, market_value, pct_to_nav)
       ON CONFLICT (fund_id, stock_id, month) DO UPDATE SET
         quantity = EXCLUDED.quantity,
         market_value = EXCLUDED.market_value,
         pct_to_nav = EXCLUDED.pct_to_nav`,
      [fundIds, stockIds, months, quantities, marketValues, pcts]
    );
    inserted += chunk.length;
  }

  return inserted;
}

/**
 * Bulk upsert sectors from holdings disclosures.
 */
export async function bulkUpsertSectors(rows, chunkSize = 200) {
  if (!rows.length) return 0;
  const pool = getPgPool();
  let upserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const names = chunk.map((r) => r.name);
    const slugs = chunk.map((r) => r.slug);

    await pool.query(
      `INSERT INTO sectors (name, slug)
       SELECT u.name, u.slug
       FROM UNNEST($1::text[], $2::text[]) AS u(name, slug)
       ON CONFLICT (slug) DO NOTHING`,
      [names, slugs],
    );
    upserted += chunk.length;
  }

  return upserted;
}

/**
 * Bulk upsert stocks from holdings disclosures.
 */
export async function bulkUpsertStocks(rows, chunkSize = 500) {
  const validRows = rows
    .map((r) => {
      if (!r?.name || !r?.slug) return null;
      const normalized = normalizeStockListingRow(r);
      if (!normalized) return null;
      // Tiered natural keys — empty → NULL for partial unique indexes.
      normalized.isin = normalized.isin
        ? String(normalized.isin).trim().toUpperCase()
        : null;
      normalized.nse_symbol = normalized.nse_symbol
        ? String(normalized.nse_symbol).trim().toUpperCase()
        : null;
      normalized.bse_code = normalized.bse_code
        ? String(normalized.bse_code).trim()
        : null;
      return normalized;
    })
    .filter(Boolean);
  if (!validRows.length) return 0;
  const pool = getPgPool();
  let upserted = 0;

  for (let i = 0; i < validRows.length; i += chunkSize) {
    const chunk = validRows.slice(i, i + chunkSize);
    const isins = chunk.map((r) => r.isin);
    const names = chunk.map((r) => r.name);
    const slugs = chunk.map((r) => r.slug);
    const sectorIds = chunk.map((r) => r.sector_id ?? null);
    const nseSymbols = chunk.map((r) => r.nse_symbol);
    const bseCodes = chunk.map((r) => r.bse_code);

    // 1a) Enrich by ISIN (canonical when present).
    await pool.query(
      `UPDATE stocks s SET
         nse_symbol = COALESCE(s.nse_symbol, u.nse_symbol),
         bse_code = COALESCE(s.bse_code, u.bse_code),
         sector_id = COALESCE(u.sector_id, s.sector_id)
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::int[], $5::text[], $6::text[])
         AS u(isin, name, slug, sector_id, nse_symbol, bse_code)
       WHERE u.isin IS NOT NULL AND s.isin = u.isin`,
      [isins, names, slugs, sectorIds, nseSymbols, bseCodes],
    );

    // 1b) Enrich by NSE when incoming has no ISIN (target also has no ISIN).
    await pool.query(
      `UPDATE stocks s SET
         bse_code = COALESCE(s.bse_code, u.bse_code),
         sector_id = COALESCE(u.sector_id, s.sector_id)
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::int[], $5::text[], $6::text[])
         AS u(isin, name, slug, sector_id, nse_symbol, bse_code)
       WHERE u.isin IS NULL
         AND u.nse_symbol IS NOT NULL
         AND s.isin IS NULL
         AND s.nse_symbol = u.nse_symbol`,
      [isins, names, slugs, sectorIds, nseSymbols, bseCodes],
    );

    // 1c) Enrich by BSE when incoming has neither ISIN nor NSE.
    await pool.query(
      `UPDATE stocks s SET
         sector_id = COALESCE(u.sector_id, s.sector_id)
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::int[], $5::text[], $6::text[])
         AS u(isin, name, slug, sector_id, nse_symbol, bse_code)
       WHERE u.isin IS NULL
         AND u.nse_symbol IS NULL
         AND u.bse_code IS NOT NULL
         AND s.isin IS NULL
         AND s.nse_symbol IS NULL
         AND s.bse_code = u.bse_code`,
      [isins, names, slugs, sectorIds, nseSymbols, bseCodes],
    );

    // 2) Insert only when no listing-key twin exists.
    await pool.query(
      `INSERT INTO stocks (isin, name, slug, sector_id, nse_symbol, bse_code)
       SELECT u.isin, u.name, u.slug, u.sector_id, u.nse_symbol, u.bse_code
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::int[], $5::text[], $6::text[])
         AS u(isin, name, slug, sector_id, nse_symbol, bse_code)
       WHERE NOT (
           (u.isin IS NOT NULL AND EXISTS (SELECT 1 FROM stocks s WHERE s.isin = u.isin))
           OR (
             u.isin IS NULL AND u.nse_symbol IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM stocks s
               WHERE s.isin IS NULL AND s.nse_symbol = u.nse_symbol
             )
           )
           OR (
             u.isin IS NULL AND u.nse_symbol IS NULL AND u.bse_code IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM stocks s
               WHERE s.isin IS NULL AND s.nse_symbol IS NULL AND s.bse_code = u.bse_code
             )
           )
         )
       ON CONFLICT (slug) DO UPDATE SET
         isin = CASE
           WHEN stocks.isin IS NULL THEN EXCLUDED.isin
           ELSE stocks.isin
         END,
         nse_symbol = COALESCE(stocks.nse_symbol, EXCLUDED.nse_symbol),
         bse_code = COALESCE(stocks.bse_code, EXCLUDED.bse_code),
         sector_id = COALESCE(EXCLUDED.sector_id, stocks.sector_id)
       WHERE stocks.isin IS NULL
          OR stocks.isin = EXCLUDED.isin
          OR EXCLUDED.isin IS NULL`,
      [isins, names, slugs, sectorIds, nseSymbols, bseCodes],
    );
    upserted += chunk.length;
  }

  return upserted;
}

/**
 * Apply AMFI cap buckets to existing stocks only.
 * Match: ISIN first (same as stockListingKey), then NSE symbol when stock has no ISIN.
 * Does not write nse_symbol / bse_code — those come from NSE/BSE seed scripts.
 */
export async function bulkApplyAmfiMarketCapCategories(rows, chunkSize = 500) {
  const valid = rows.filter((r) => r?.market_cap_category);
  if (!valid.length) return { byIsin: 0, byNseFallback: 0 };

  const pool = getPgPool();
  let byIsin = 0;
  let byNseFallback = 0;

  for (let i = 0; i < valid.length; i += chunkSize) {
    const chunk = valid.slice(i, i + chunkSize);
    const isins = chunk.map((r) => r.isin || null);
    const nseSymbols = chunk.map((r) => r.nse_symbol || null);
    const categories = chunk.map((r) => r.market_cap_category);

    const isinResult = await pool.query(
      `UPDATE stocks s
       SET market_cap_category = u.market_cap_category, updated_at = NOW()
       FROM UNNEST($1::text[], $2::text[]) AS u(isin, market_cap_category)
       WHERE NULLIF(TRIM(u.isin), '') IS NOT NULL
         AND UPPER(TRIM(s.isin)) = UPPER(TRIM(u.isin))
         AND s.market_cap_category IS DISTINCT FROM u.market_cap_category`,
      [isins, categories],
    );
    byIsin += isinResult.rowCount ?? 0;

    const nseResult = await pool.query(
      `UPDATE stocks s
       SET market_cap_category = u.market_cap_category, updated_at = NOW()
       FROM UNNEST($1::text[], $2::text[], $3::text[])
         AS u(isin, nse_symbol, market_cap_category)
       WHERE NULLIF(TRIM(u.nse_symbol), '') IS NOT NULL
         AND (s.isin IS NULL OR TRIM(s.isin) = '')
         AND UPPER(TRIM(s.nse_symbol)) = UPPER(TRIM(u.nse_symbol))
         AND s.market_cap_category IS DISTINCT FROM u.market_cap_category
         AND NOT EXISTS (
           SELECT 1 FROM stocks s2
           WHERE NULLIF(TRIM(u.isin), '') IS NOT NULL
             AND UPPER(TRIM(s2.isin)) = UPPER(TRIM(u.isin))
         )`,
      [isins, nseSymbols, categories],
    );
    byNseFallback += nseResult.rowCount ?? 0;
  }

  return { byIsin, byNseFallback };
}

/**
 * Bulk upsert NSE listed equities (name, slug, isin, nse_symbol).
 * Used by Super Investors / 1% Club — independent of MF holdings universe.
 */
/**
 * Bulk upsert NSE listed equities (name, slug, isin, nse_symbol).
 * ISIN is the natural key — never insert a second row for an existing ISIN.
 */
export async function bulkUpsertListedEquities(rows, chunkSize = 500) {
  if (!rows.length) return 0;
  const pool = getPgPool();
  let upserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((r) => ({
      isin: r.isin ? String(r.isin).trim().toUpperCase() : null,
      name: r.name,
      slug: r.slug,
      nse_symbol: r.nse_symbol ? String(r.nse_symbol).trim().toUpperCase() : null,
    })).filter((r) => r.isin && r.name && r.slug);

    if (!chunk.length) continue;

    const isins = chunk.map((r) => r.isin);
    const names = chunk.map((r) => r.name);
    const slugs = chunk.map((r) => r.slug);
    const symbols = chunk.map((r) => r.nse_symbol);

    // 1) Enrich existing ISIN row (authoritative path after stocks_isin_unique).
    await pool.query(
      `UPDATE stocks s SET
         nse_symbol = COALESCE(u.nse_symbol, s.nse_symbol),
         updated_at = NOW()
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])
         AS u(isin, name, slug, nse_symbol)
       WHERE s.isin = u.isin`,
      [isins, names, slugs, symbols],
    );

    // 2) Insert only brand-new ISINs. If slug is taken by another stock, use symbol suffix.
    await pool.query(
      `INSERT INTO stocks (isin, name, slug, nse_symbol)
       SELECT
         u.isin,
         u.name,
         CASE
           WHEN EXISTS (SELECT 1 FROM stocks s2 WHERE s2.slug = u.slug)
             THEN u.slug || '-' || LOWER(RIGHT(u.isin, 6))
           ELSE u.slug
         END,
         u.nse_symbol
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])
         AS u(isin, name, slug, nse_symbol)
       WHERE NOT EXISTS (SELECT 1 FROM stocks s WHERE s.isin = u.isin)
       ON CONFLICT (slug) DO UPDATE SET
         isin = CASE WHEN stocks.isin IS NULL THEN EXCLUDED.isin ELSE stocks.isin END,
         nse_symbol = COALESCE(EXCLUDED.nse_symbol, stocks.nse_symbol),
         updated_at = NOW()
       WHERE stocks.isin IS NULL OR stocks.isin = EXCLUDED.isin`,
      [isins, names, slugs, symbols],
    );
    upserted += chunk.length;
  }

  return upserted;
}

/**
 * Bulk upsert BSE-only listed equities (name, slug, isin, bse_code).
 * Skips rows whose ISIN already has an NSE symbol (dual-listed stay on NSE path).
 * ISIN is the natural key — never insert a twin row.
 */
export async function bulkUpsertBseOnlyEquities(rows, chunkSize = 500) {
  if (!rows.length) return 0;
  const pool = getPgPool();
  let upserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((r) => ({
      isin: r.isin ? String(r.isin).trim().toUpperCase() : null,
      name: r.name,
      slug: r.slug,
      bse_code: r.bse_code ? String(r.bse_code).trim() : null,
    })).filter((r) => r.isin && r.name && r.slug);

    if (!chunk.length) continue;

    const isins = chunk.map((r) => r.isin);
    const names = chunk.map((r) => r.name);
    const slugs = chunk.map((r) => r.slug);
    const codes = chunk.map((r) => r.bse_code);

    // 1) Enrich existing ISIN row (don't overwrite NSE-listed duals' primary identity).
    await pool.query(
      `UPDATE stocks s SET
         bse_code = COALESCE(s.bse_code, u.bse_code),
         updated_at = NOW()
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])
         AS u(isin, name, slug, bse_code)
       WHERE s.isin = u.isin`,
      [isins, names, slugs, codes],
    );

    // 2) Insert only brand-new ISINs that aren't already NSE-listed.
    await pool.query(
      `INSERT INTO stocks (isin, name, slug, bse_code)
       SELECT
         u.isin,
         u.name,
         CASE
           WHEN EXISTS (SELECT 1 FROM stocks s2 WHERE s2.slug = u.slug)
             THEN u.slug || '-' || LOWER(RIGHT(u.isin, 6))
           ELSE u.slug
         END,
         u.bse_code
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])
         AS u(isin, name, slug, bse_code)
       WHERE NOT EXISTS (SELECT 1 FROM stocks s WHERE s.isin = u.isin)
       ON CONFLICT (slug) DO UPDATE SET
         isin = CASE WHEN stocks.isin IS NULL THEN EXCLUDED.isin ELSE stocks.isin END,
         bse_code = COALESCE(EXCLUDED.bse_code, stocks.bse_code),
         updated_at = NOW()
       WHERE stocks.isin IS NULL OR stocks.isin = EXCLUDED.isin`,
      [isins, names, slugs, codes],
    );
    upserted += chunk.length;
  }

  return upserted;
}

/**
 * Bulk upsert full portfolio stock counts (parsed before top-N trim).
 */
export async function bulkUpsertFundPortfolioStats(rows, chunkSize = 2000) {
  if (!rows.length) return 0;
  const pool = getPgPool();
  let upserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const fundIds = chunk.map((r) => r.fund_id);
    const months = chunk.map((r) => r.month);
    const totals = chunk.map((r) => r.total_stocks);

    await pool.query(
      `INSERT INTO fund_portfolio_stats (fund_id, month, total_stocks)
       SELECT u.fund_id, u.month::date, u.total_stocks
       FROM UNNEST($1::int[], $2::text[], $3::int[]) AS u(fund_id, month, total_stocks)
       ON CONFLICT (fund_id, month) DO UPDATE SET
         total_stocks = EXCLUDED.total_stocks`,
      [fundIds, months, totals],
    );
    upserted += chunk.length;
  }

  return upserted;
}

/**
 * Batch-update fund AMC assignments in one query per AMC group.
 */
export async function batchUpdateFundAmcs(updates) {
  if (!updates.length) return 0;
  const pool = getPgPool();
  const fundIds = updates.map((u) => u.fundId);
  const amcIds = updates.map((u) => u.amcId);
  const r = await pool.query(
    `UPDATE funds f SET amc_id = u.amc_id
     FROM UNNEST($1::int[], $2::int[]) AS u(fund_id, amc_id)
     WHERE f.id = u.fund_id`,
    [fundIds, amcIds]
  );
  return r.rowCount ?? 0;
}

/**
 * Bulk upsert fund_navs — one round-trip per chunk (vs thousands of HTTP calls).
 */
export async function bulkUpsertFundNavs(rows, chunkSize = 800) {
  if (!rows.length) return 0;
  const pool = getPgPool();
  let written = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const fundIds = chunk.map((r) => r.fund_id);
    const dates = chunk.map((r) => r.date);
    const navs = chunk.map((r) => r.nav);

    await pool.query(
      `INSERT INTO fund_navs (fund_id, date, nav)
       SELECT u.fund_id, u.date::date, u.nav
       FROM UNNEST($1::int[], $2::text[], $3::double precision[]) AS u(fund_id, date, nav)
       ON CONFLICT (fund_id, date) DO UPDATE SET nav = EXCLUDED.nav`,
      [fundIds, dates, navs]
    );
    written += chunk.length;
  }

  return written;
}

/**
 * Compute 1Y/3Y/5Y CAGR for all funds in one SQL statement.
 */
export async function computeFundReturnsBulk() {
  const pool = getPgPool();
  const result = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (fund_id) fund_id, nav::double precision AS nav, date
      FROM fund_navs
      ORDER BY fund_id, date DESC
    ),
    cagr AS (
      SELECT
        l.fund_id,
        l.nav AS nav_now,
        (
          SELECT fn.nav::double precision FROM fund_navs fn
          WHERE fn.fund_id = l.fund_id AND fn.date <= l.date - INTERVAL '1 year'
          ORDER BY fn.date DESC LIMIT 1
        ) AS nav_1y,
        (
          SELECT fn.nav::double precision FROM fund_navs fn
          WHERE fn.fund_id = l.fund_id AND fn.date <= l.date - INTERVAL '3 years'
          ORDER BY fn.date DESC LIMIT 1
        ) AS nav_3y,
        (
          SELECT fn.nav::double precision FROM fund_navs fn
          WHERE fn.fund_id = l.fund_id AND fn.date <= l.date - INTERVAL '5 years'
          ORDER BY fn.date DESC LIMIT 1
        ) AS nav_5y
      FROM latest l
    )
    INSERT INTO fund_returns (fund_id, returns_1y, returns_3y, returns_5y, last_computed)
    SELECT
      fund_id,
      CASE WHEN nav_1y > 0 THEN ROUND(((POWER(nav_now / nav_1y, 1.0) - 1) * 100)::numeric, 2) END,
      CASE WHEN nav_3y > 0 THEN ROUND(((POWER(nav_now / nav_3y, 1.0 / 3) - 1) * 100)::numeric, 2) END,
      CASE WHEN nav_5y > 0 THEN ROUND(((POWER(nav_now / nav_5y, 1.0 / 5) - 1) * 100)::numeric, 2) END,
      NOW()
    FROM cagr
    WHERE nav_now IS NOT NULL
    ON CONFLICT (fund_id) DO UPDATE SET
      returns_1y = COALESCE(EXCLUDED.returns_1y, fund_returns.returns_1y),
      returns_3y = COALESCE(EXCLUDED.returns_3y, fund_returns.returns_3y),
      returns_5y = COALESCE(EXCLUDED.returns_5y, fund_returns.returns_5y),
      last_computed = NOW()
  `);
  return result.rowCount ?? 0;
}

/**
 * Batch insert new funds from AMFI (scheme_code conflict → update).
 */
export async function bulkUpsertAmfiFunds(rows, chunkSize = 100) {
  if (!rows.length) return new Map();
  const pool = getPgPool();
  const codeToId = new Map();

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const schemeCodes = chunk.map((r) => r.schemeCode);
    const names = chunk.map((r) => r.name);
    const slugs = chunk.map((r) => r.slug);
    const categories = chunk.map((r) => r.category);

    const { rows: inserted } = await pool.query(
      `INSERT INTO funds (scheme_code, name, slug, category, is_active)
       SELECT u.scheme_code, u.name, u.slug, u.category, true
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[]) AS u(scheme_code, name, slug, category)
       ON CONFLICT (scheme_code) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         category = EXCLUDED.category,
         updated_at = NOW()
       RETURNING id, scheme_code`,
      [schemeCodes, names, slugs, categories]
    );
    for (const row of inserted) {
      codeToId.set(row.scheme_code, row.id);
    }
  }

  return codeToId;
}

/**
 * Batch assign scheme_code where slug-matched fund has none and code is free.
 */
export async function bulkAssignSchemeCodes(updates) {
  if (!updates.length) return 0;
  const pool = getPgPool();
  const fundIds = updates.map((u) => u.fundId);
  const codes = updates.map((u) => u.schemeCode);
  const r = await pool.query(
    `UPDATE funds f SET scheme_code = u.scheme_code, updated_at = NOW()
     FROM UNNEST($1::int[], $2::text[]) AS u(fund_id, scheme_code)
     WHERE f.id = u.fund_id AND (f.scheme_code IS NULL OR f.scheme_code = '')`,
    [fundIds, codes]
  );
  return r.rowCount ?? 0;
}
