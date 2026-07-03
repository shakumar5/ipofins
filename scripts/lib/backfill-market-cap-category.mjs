/**
 * Derive stocks.market_cap_category from AMFI Excel (preferred) or SHP + entity holdings.
 * Buckets: see scripts/lib/market-cap-buckets.mjs (mid 101-250, micro 1501+).
 */

import {
  findLatestAmfiMarketCapFile,
  parseAmfiMarketCapFile,
} from './amfi-market-cap.mjs';
import { rankToMarketCapCategory, MARKET_CAP_BUCKETS } from './market-cap-buckets.mjs';
import { bulkApplyAmfiMarketCapCategories } from './pg-bulk.mjs';

const MIN_MCAP_CR = 100;
const MAX_MCAP_CR = 50_000_000;
const MIN_HOLDER_PCT = 0.25;
const MAX_HOLDER_PCT = 90;

/**
 * @param {import('@neondatabase/serverless').NeonQueryFunction} sql
 * @param {Array<{ isin: string, nseSymbol: string | null, marketCapCategory: string | null }>} amfiRows
 */
async function backfillMarketCapCategoryFromAmfi(_sql, amfiRows) {
  const rows = amfiRows
    .filter((r) => r.marketCapCategory)
    .map((r) => ({
      isin: r.isin || null,
      nse_symbol: r.nseSymbol || null,
      market_cap_category: r.marketCapCategory,
    }));

  const { byIsin, byNseFallback } = await bulkApplyAmfiMarketCapCategories(rows);
  const updated = byIsin + byNseFallback;

  const caps = rows.reduce(
    (acc, r) => {
      acc[r.market_cap_category] = (acc[r.market_cap_category] || 0) + 1;
      return acc;
    },
    { large: 0, mid: 0, small: 0, micro: 0 },
  );

  return {
    source: 'amfi',
    updated,
    large: caps.large,
    mid: caps.mid,
    small: caps.small,
    micro: caps.micro,
  };
}

/**
 * SHP-derived fallback for stocks not covered by AMFI file.
 * @param {import('@neondatabase/serverless').NeonQueryFunction} sql
 */
async function backfillMarketCapCategoryFromShp(sql) {
  const stats = await sql`
    WITH latest_sph_quarter AS (
      SELECT stock_id, MAX(quarter) AS quarter
      FROM shareholding_pattern_holders
      WHERE shares > 0 AND pct_of_company > 0
      GROUP BY stock_id
    ),
    latest_eh_quarter AS (
      SELECT stock_id, MAX(quarter) AS quarter
      FROM entity_holdings
      WHERE strategy_id IS NULL
        AND market_value_cr > 0
        AND pct_of_company > 0
      GROUP BY stock_id
    ),
    stock_mcap AS (
      SELECT stock_id, MAX(mcap_cr) AS mcap_cr
      FROM (
        SELECT sph.stock_id,
          (sph.shares::numeric * sqp.close_price * 100.0 / NULLIF(sph.pct_of_company, 0)) / 1e7 AS mcap_cr
        FROM shareholding_pattern_holders sph
        JOIN latest_sph_quarter lq ON lq.stock_id = sph.stock_id AND lq.quarter = sph.quarter
        JOIN stock_quarter_prices sqp
          ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
        WHERE sph.shares > 0
          AND sph.pct_of_company BETWEEN ${MIN_HOLDER_PCT} AND ${MAX_HOLDER_PCT}

        UNION ALL

        SELECT eh.stock_id,
          eh.market_value_cr * 100.0 / NULLIF(eh.pct_of_company, 0) AS mcap_cr
        FROM entity_holdings eh
        JOIN latest_eh_quarter leq ON leq.stock_id = eh.stock_id AND leq.quarter = eh.quarter
        WHERE eh.strategy_id IS NULL
          AND eh.market_value_cr > 0
          AND eh.pct_of_company BETWEEN ${MIN_HOLDER_PCT} AND ${MAX_HOLDER_PCT}
      ) raw
      WHERE mcap_cr > ${MIN_MCAP_CR} AND mcap_cr < ${MAX_MCAP_CR}
      GROUP BY stock_id
    ),
    ranked AS (
      SELECT
        stock_id,
        mcap_cr,
        ROW_NUMBER() OVER (ORDER BY mcap_cr DESC) AS rnk
      FROM stock_mcap
    ),
    classified AS (
      SELECT
        stock_id,
        CASE
          WHEN rnk <= 100 THEN 'large'
          WHEN rnk <= ${MARKET_CAP_BUCKETS.mid.rankTo} THEN 'mid'
          WHEN rnk <= ${MARKET_CAP_BUCKETS.small.rankTo} THEN 'small'
          ELSE 'micro'
        END AS category
      FROM ranked
    ),
    upd AS (
      UPDATE stocks s
      SET market_cap_category = c.category
      FROM classified c
      WHERE s.id = c.stock_id
        AND s.market_cap_category IS NULL
        AND (s.market_cap_category IS DISTINCT FROM c.category)
      RETURNING c.category
    )
    SELECT
      COUNT(*)::int AS updated,
      COUNT(*) FILTER (WHERE category = 'large')::int AS large,
      COUNT(*) FILTER (WHERE category = 'mid')::int AS mid,
      COUNT(*) FILTER (WHERE category = 'small')::int AS small,
      COUNT(*) FILTER (WHERE category = 'micro')::int AS micro
    FROM upd
  `;

  const row = stats[0] ?? { updated: 0, large: 0, mid: 0, small: 0, micro: 0 };
  return {
    source: 'shp',
    updated: Number(row.updated) || 0,
    large: Number(row.large) || 0,
    mid: Number(row.mid) || 0,
    small: Number(row.small) || 0,
    micro: Number(row.micro) || 0,
  };
}

/**
 * @param {import('@neondatabase/serverless').NeonQueryFunction} sql
 * @returns {Promise<{ updated: number, large: number, mid: number, small: number, micro: number, source?: string }>}
 */
export async function backfillMarketCapCategory(sql) {
  const amfiFile = findLatestAmfiMarketCapFile();
  if (amfiFile) {
    const amfiRows = parseAmfiMarketCapFile(amfiFile);
    const amfiResult = await backfillMarketCapCategoryFromAmfi(sql, amfiRows);
    const shpResult = await backfillMarketCapCategoryFromShp(sql);
    return {
      source: 'amfi+shp-fallback',
      updated: amfiResult.updated + shpResult.updated,
      large: amfiResult.large + shpResult.large,
      mid: amfiResult.mid + shpResult.mid,
      small: amfiResult.small + shpResult.small,
      micro: amfiResult.micro + shpResult.micro,
    };
  }

  return backfillMarketCapCategoryFromShp(sql);
}

/**
 * Re-rank cap buckets on every Top Stocks export (do not skip after first 100).
 * @param {import('@neondatabase/serverless').NeonQueryFunction} sql
 */
export async function ensureMarketCapCategories(sql) {
  const result = await backfillMarketCapCategory(sql);
  const [{ count: after }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM stocks
    WHERE market_cap_category IN ('large', 'mid', 'small', 'micro')
  `;
  return { skipped: false, classified: after, ...result };
}

export { rankToMarketCapCategory };
