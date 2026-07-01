/**
 * Top Stocks — Neon + exported JSON loader (build time / server only).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { sql } from './db';
import { holderFilingKeySql, stockListingKeySql } from './holdings-dedupe';
import { DII_FII_TYPES, SUPER_INVESTOR_FLOW_TYPES } from './tracked-entities';
import {
  buildBuckets,
  emptyTopStocksPayload,
  type RawFlowRow,
  type TopStocksPayload,
} from './top-stocks-shared';

const STOCK_LISTING_KEY = stockListingKeySql('s');
const HOLDER_FILING_KEY = holderFilingKeySql('sph.holder_name');

const EQUITY_FUND_CATEGORIES = [
  'Large Cap',
  'Large & Mid Cap',
  'Mid Cap',
  'Multi Cap',
  'Flexi Cap',
  'Small Cap',
  'Value',
  'Focused',
  'Sectoral/Thematic',
  'Sectoral',
  'Contra',
  'Dividend Yield',
  'Index',
];

function diskPaths(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, 'public', 'data', 'top-stocks.json'),
    join(cwd, 'finverseui', 'public', 'data', 'top-stocks.json'),
  ];
}

export function readTopStocksPayloadFromDisk(): TopStocksPayload | null {
  for (const path of diskPaths()) {
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as TopStocksPayload;
      if (data?.periods && data?.buckets) {
        return {
          ...data,
          hasData: Boolean(
            data.hasData ?? Object.values(data.buckets).some((rows) => rows?.length > 0),
          ),
        };
      }
    } catch {
      /* try next path */
    }
  }
  return null;
}

async function loadMutualFundFlows(): Promise<{ period: string; rows: RawFlowRow[] }> {
  if (!sql) return { period: '', rows: [] };

  const monthRow = (await sql`SELECT MAX(month) AS m FROM holdings_changes`) as { m: string | null }[];
  const month = monthRow[0]?.m;
  if (!month) return { period: '', rows: [] };

  const periodRows = (await sql`
    SELECT TRIM(TO_CHAR(${month}::date, 'FMMonth YYYY')) AS label
  `) as { label: string }[];
  const period = periodRows[0]?.label?.trim() || String(month);

  const rows = (await sql`
    WITH hc AS (
      SELECT hc.stock_id, hc.change_type,
        COALESCE(fh_curr.market_value, 0) / 100.0 AS curr_cr,
        COALESCE(fh_prev.market_value, 0) / 100.0 AS prev_cr
      FROM holdings_changes hc
      JOIN funds f ON f.id = hc.fund_id AND f.is_active = true
      JOIN stocks s ON s.id = hc.stock_id
      LEFT JOIN sectors sec ON sec.id = s.sector_id
      LEFT JOIN fund_holdings fh_curr
        ON fh_curr.fund_id = hc.fund_id AND fh_curr.stock_id = hc.stock_id AND fh_curr.month = hc.month
      LEFT JOIN fund_holdings fh_prev
        ON fh_prev.fund_id = hc.fund_id AND fh_prev.stock_id = hc.stock_id AND fh_prev.month = hc.prev_month
      WHERE hc.month = ${month}::date
        AND f.category = ANY(${EQUITY_FUND_CATEGORIES})
        AND hc.change_type <> 'unchanged'
        AND COALESCE(sec.name, '') NOT ILIKE '%debt%'
    ),
    per_fund AS (
      SELECT stock_id,
        CASE WHEN change_type = 'fresh_entry' THEN curr_cr
             WHEN change_type = 'increased' THEN GREATEST(curr_cr - prev_cr, 0) ELSE 0 END AS buy_cr,
        CASE WHEN change_type = 'complete_exit' THEN prev_cr
             WHEN change_type = 'decreased' THEN GREATEST(prev_cr - curr_cr, 0) ELSE 0 END AS sell_cr
      FROM hc
    ),
    by_stock AS (
      SELECT stock_id, SUM(buy_cr) AS bought_cr, SUM(sell_cr) AS sold_cr
      FROM per_fund WHERE buy_cr > 0 OR sell_cr > 0 GROUP BY stock_id
    )
    SELECT s.slug AS stock_slug, s.name AS stock_name, COALESCE(sec.name, '') AS sector,
           s.market_cap_category, b.bought_cr, b.sold_cr
    FROM by_stock b
    JOIN stocks s ON s.id = b.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE s.market_cap_category IN ('large', 'mid', 'small', 'micro')
      AND (b.bought_cr > 0 OR b.sold_cr > 0)
  `) as RawFlowRow[];

  return { period, rows };
}

async function loadSuperInvestorFlows(): Promise<{ period: string; rows: RawFlowRow[] }> {
  if (!sql) return { period: '', rows: [] };

  const qRow = (await sql`
    SELECT MAX(ec.quarter) AS q FROM entity_changes ec
    JOIN tracked_entities te ON te.id = ec.entity_id
    WHERE te.type = ANY(${SUPER_INVESTOR_FLOW_TYPES}) AND ec.strategy_id IS NULL
  `) as { q: string | null }[];
  const quarter = qRow[0]?.q;
  if (!quarter) return { period: '', rows: [] };

  const periodRows = (await sql`
    SELECT TRIM(TO_CHAR(${quarter}::date, 'FMMonth YYYY')) AS label
  `) as { label: string }[];
  const period = periodRows[0]?.label ? `Q ${periodRows[0].label}` : String(quarter);

  const rows = (await sql`
    WITH by_stock AS (
      SELECT ec.stock_id,
        SUM(GREATEST(ec.value_change_cr, 0)) AS bought_cr,
        SUM(GREATEST(-ec.value_change_cr, 0)) AS sold_cr
      FROM entity_changes ec
      JOIN tracked_entities te ON te.id = ec.entity_id
      WHERE ec.quarter = ${quarter}::date
        AND ec.strategy_id IS NULL
        AND te.type = ANY(${SUPER_INVESTOR_FLOW_TYPES})
        AND ec.change_type <> 'unchanged'
      GROUP BY ec.stock_id
    )
    SELECT s.slug AS stock_slug, s.name AS stock_name, COALESCE(sec.name, '') AS sector,
           s.market_cap_category, b.bought_cr, b.sold_cr
    FROM by_stock b
    JOIN stocks s ON s.id = b.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE s.market_cap_category IN ('large', 'mid', 'small', 'micro')
      AND (b.bought_cr > 0 OR b.sold_cr > 0)
  `) as RawFlowRow[];

  return { period, rows };
}

async function loadDiiFiiFlows(): Promise<{ period: string; rows: RawFlowRow[] }> {
  if (!sql) return { period: '', rows: [] };

  const qRow = (await sql`
    SELECT MAX(ec.quarter) AS q FROM entity_changes ec
    JOIN tracked_entities te ON te.id = ec.entity_id
    WHERE te.type = ANY(${DII_FII_TYPES}) AND ec.strategy_id IS NULL
  `) as { q: string | null }[];
  const quarter = qRow[0]?.q;
  if (!quarter) return { period: '', rows: [] };

  const periodRows = (await sql`
    SELECT TRIM(TO_CHAR(${quarter}::date, 'FMMonth YYYY')) AS label
  `) as { label: string }[];
  const period = periodRows[0]?.label ? `Q ${periodRows[0].label}` : String(quarter);

  const rows = (await sql`
    WITH by_stock AS (
      SELECT ec.stock_id,
        SUM(GREATEST(ec.value_change_cr, 0)) AS bought_cr,
        SUM(GREATEST(-ec.value_change_cr, 0)) AS sold_cr
      FROM entity_changes ec
      JOIN tracked_entities te ON te.id = ec.entity_id
      WHERE ec.quarter = ${quarter}::date
        AND ec.strategy_id IS NULL
        AND te.type = ANY(${DII_FII_TYPES})
        AND ec.change_type <> 'unchanged'
      GROUP BY ec.stock_id
    )
    SELECT s.slug AS stock_slug, s.name AS stock_name, COALESCE(sec.name, '') AS sector,
           s.market_cap_category, b.bought_cr, b.sold_cr
    FROM by_stock b
    JOIN stocks s ON s.id = b.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE s.market_cap_category IN ('large', 'mid', 'small', 'micro')
      AND (b.bought_cr > 0 OR b.sold_cr > 0)
  `) as RawFlowRow[];

  return { period, rows };
}

async function loadOnePercentClubFlows(): Promise<{ period: string; rows: RawFlowRow[] }> {
  if (!sql) return { period: '', rows: [] };

  const qRows = (await sql`
    SELECT DISTINCT quarter FROM shareholding_pattern_holders
    WHERE is_promoter = FALSE ORDER BY quarter DESC LIMIT 2
  `) as { quarter: string }[];
  if (qRows.length < 2) return { period: '', rows: [] };

  const currQ = qRows[0]!.quarter;
  const prevQ = qRows[1]!.quarter;

  const periodRows = (await sql`
    SELECT TRIM(TO_CHAR(${currQ}::date, 'FMMonth YYYY')) AS label
  `) as { label: string }[];
  const period = periodRows[0]?.label ? `Q ${periodRows[0].label}` : String(currQ);

  const rows = (await sql`
    WITH curr AS (
      SELECT ${sql.unsafe(STOCK_LISTING_KEY)} AS listing_key,
        ${sql.unsafe(HOLDER_FILING_KEY)} AS filing_key, sph.stock_id,
        CASE WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
          THEN (sph.shares::numeric * sqp.close_price) / 1e7 ELSE 0 END AS value_cr
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      LEFT JOIN stock_quarter_prices sqp ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
      WHERE sph.quarter = ${currQ}::date AND sph.is_promoter = FALSE AND sph.pct_of_company >= 1.0
    ),
    prev AS (
      SELECT ${sql.unsafe(STOCK_LISTING_KEY)} AS listing_key,
        ${sql.unsafe(HOLDER_FILING_KEY)} AS filing_key, sph.stock_id,
        CASE WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
          THEN (sph.shares::numeric * sqp.close_price) / 1e7 ELSE 0 END AS value_cr
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      LEFT JOIN stock_quarter_prices sqp ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
      WHERE sph.quarter = ${prevQ}::date AND sph.is_promoter = FALSE AND sph.pct_of_company >= 1.0
    ),
    deltas AS (
      SELECT COALESCE(c.stock_id, p.stock_id) AS stock_id,
        GREATEST(COALESCE(c.value_cr, 0) - COALESCE(p.value_cr, 0), 0) AS buy_cr,
        GREATEST(COALESCE(p.value_cr, 0) - COALESCE(c.value_cr, 0), 0) AS sell_cr
      FROM curr c
      FULL OUTER JOIN prev p ON c.listing_key = p.listing_key AND c.filing_key = p.filing_key
    ),
    by_stock AS (
      SELECT stock_id, SUM(buy_cr) AS bought_cr, SUM(sell_cr) AS sold_cr
      FROM deltas WHERE buy_cr > 0 OR sell_cr > 0 GROUP BY stock_id
    )
    SELECT s.slug AS stock_slug, s.name AS stock_name, COALESCE(sec.name, '') AS sector,
           s.market_cap_category, b.bought_cr, b.sold_cr
    FROM by_stock b
    JOIN stocks s ON s.id = b.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE s.market_cap_category IN ('large', 'mid', 'small', 'micro')
      AND (b.bought_cr > 0 OR b.sold_cr > 0)
  `) as RawFlowRow[];

  return { period, rows };
}

async function loadTopStocksPayloadFromDb(): Promise<TopStocksPayload> {
  const [mf, si, diiFii, opc] = await Promise.all([
    loadMutualFundFlows(),
    loadSuperInvestorFlows(),
    loadDiiFiiFlows(),
    loadOnePercentClubFlows(),
  ]);
  const buckets = {
    ...buildBuckets('mutual_funds', mf.rows),
    ...buildBuckets('super_investors', si.rows),
    ...buildBuckets('dii_fii', diiFii.rows),
    ...buildBuckets('one_percent_club', opc.rows),
  };
  return {
    periods: {
      mutual_funds: mf.period,
      super_investors: si.period,
      dii_fii: diiFii.period,
      one_percent_club: opc.period,
    },
    buckets,
    hasData: Object.values(buckets).some((rows) => rows.length > 0),
  };
}

export async function loadTopStocksPayload(): Promise<TopStocksPayload> {
  const empty = emptyTopStocksPayload();
  const disk = readTopStocksPayloadFromDisk();
  if (disk?.hasData) return disk;

  if (!sql) return disk ?? empty;

  try {
    const fromDb = await loadTopStocksPayloadFromDb();
    if (fromDb.hasData) return fromDb;
    return disk ?? fromDb;
  } catch (err) {
    console.warn('[top-stocks] load failed:', (err as Error).message);
    return disk ?? empty;
  }
}
