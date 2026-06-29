/**
 * Shared holder positions query for 1% Club search + holder pages export.
 * Must stay aligned with getOnePercentHolderPositionsMap() in tracked-entities.ts.
 */
import { sql } from './db.mjs';
import { stockListingKeySql, holderFilingKeySql } from './stock-listing-key.mjs';

const STOCK_LISTING_KEY = stockListingKeySql('s');

export function normalizeHolderSearchKey(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function listingKey(row) {
  const isin = String(row.isin ?? '').trim().toUpperCase();
  if (isin) return `isin:${isin}`;
  const nse = String(row.nse_symbol ?? '').trim().toUpperCase();
  if (nse) return `nse:${nse}`;
  const bse = String(row.bse_code ?? '').trim();
  if (bse) return `bse:${bse}`;
  return `slug:${row.stock_slug}`;
}

function dedupePositions(list) {
  const byKey = new Map();
  for (const p of list) {
    const key = listingKey(p);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...p });
      continue;
    }
    byKey.set(key, {
      ...prev,
      pct: (prev.pct ?? 0) + (p.pct ?? 0) || null,
      shares: (prev.shares ?? 0) + (p.shares ?? 0) || null,
      marketValueCr: (prev.marketValueCr ?? 0) + (p.marketValueCr ?? 0) || null,
    });
  }
  return [...byKey.values()];
}

export async function fetchHolderPositionsRows() {
  return sql`
    WITH latest AS (
      SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
    ),
    raw AS (
      SELECT
        sph.entity_id,
        te.slug AS entity_slug,
        sph.holder_name,
        ${sql.unsafe(STOCK_LISTING_KEY)} AS listing_key,
        ${sql.unsafe(holderFilingKeySql('sph.holder_name'))} AS filing_key,
        s.id AS stock_id,
        s.slug AS stock_slug,
        s.name AS stock_name,
        s.nse_symbol,
        s.isin,
        s.bse_code,
        sph.pct_of_company,
        sph.shares,
        sph.holder_type,
        CASE
          WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
            THEN ROUND((sph.shares::numeric * sqp.close_price) / 1e7, 2)
          ELSE NULL
        END AS row_value_cr
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      LEFT JOIN tracked_entities te ON te.id = sph.entity_id
      LEFT JOIN stock_quarter_prices sqp
        ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
      WHERE sph.quarter = (SELECT q FROM latest)
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
    ),
    deduped AS (
      SELECT DISTINCT ON (listing_key, filing_key)
        entity_id,
        entity_slug,
        holder_name,
        listing_key,
        filing_key,
        stock_id,
        stock_slug,
        stock_name,
        nse_symbol,
        isin,
        bse_code,
        pct_of_company,
        shares,
        holder_type,
        row_value_cr
      FROM raw
      ORDER BY listing_key, filing_key, pct_of_company DESC NULLS LAST, stock_id ASC
    ),
    entity_keys AS (
      SELECT DISTINCT te.slug AS entity_slug, d.filing_key
      FROM deduped d
      JOIN tracked_entities te ON te.id = d.entity_id
      WHERE d.entity_id IS NOT NULL
    ),
    rolled AS (
      SELECT
        d.*,
        COALESCE(d.entity_slug, ek.entity_slug) AS roll_entity_slug
      FROM deduped d
      LEFT JOIN entity_keys ek ON ek.filing_key = d.filing_key
    ),
    curated AS (
      SELECT
        roll_entity_slug AS entity_slug,
        NULL::text AS holder_name,
        listing_key,
        (array_agg(stock_slug ORDER BY stock_id))[1] AS stock_slug,
        (array_agg(stock_name ORDER BY stock_id))[1] AS stock_name,
        (array_agg(nse_symbol ORDER BY stock_id))[1] AS nse_symbol,
        (array_agg(isin ORDER BY stock_id))[1] AS isin,
        (array_agg(bse_code ORDER BY stock_id))[1] AS bse_code,
        ROUND(SUM(pct_of_company)::numeric, 3) AS pct_of_company,
        SUM(shares)::bigint AS shares,
        ROUND(SUM(row_value_cr), 2) AS market_value_cr,
        MAX(holder_type) AS holder_type
      FROM rolled
      WHERE roll_entity_slug IS NOT NULL
      GROUP BY roll_entity_slug, listing_key
    ),
    mystery AS (
      SELECT
        entity_slug,
        holder_name,
        listing_key,
        stock_slug,
        stock_name,
        nse_symbol,
        isin,
        bse_code,
        pct_of_company,
        shares,
        row_value_cr AS market_value_cr,
        holder_type
      FROM rolled
      WHERE roll_entity_slug IS NULL
    )
    SELECT * FROM curated
    UNION ALL
    SELECT * FROM mystery
    ORDER BY pct_of_company DESC
  `;
}

export async function buildHolderPositionsRecord() {
  const rows = await fetchHolderPositionsRows();
  const record = {};
  for (const r of rows) {
    const key = r.entity_slug
      ? `entity:${r.entity_slug}`
      : `name:${normalizeHolderSearchKey(r.holder_name ?? '')}`;
    const pos = {
      stockSlug: r.stock_slug,
      stockName: r.stock_name,
      nse_symbol: r.nse_symbol ?? null,
      isin: r.isin ?? null,
      bse_code: r.bse_code ?? null,
      pct: r.pct_of_company == null ? null : Number(r.pct_of_company),
      shares: r.shares == null ? null : Number(r.shares),
      marketValueCr: r.market_value_cr == null ? null : Number(r.market_value_cr),
      holderType: r.holder_type ?? null,
    };
    if (!record[key]) record[key] = [];
    record[key].push(pos);
    record[key] = dedupePositions(record[key]);
  }
  return record;
}
