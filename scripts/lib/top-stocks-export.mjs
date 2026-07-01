/**
 * Export Top Stocks payload to public/data/top-stocks.json
 */
import {
  stockListingKeySql,
  holderFilingKeySql,
} from './stock-listing-key.mjs';

const STOCK_LISTING_KEY = stockListingKeySql('s');
const HOLDER_FILING_KEY = holderFilingKeySql('sph.holder_name');
const SUPER_INVESTOR_TYPES = ['individual', 'family_office', 'fii', 'dii'];

const TOP_STOCKS_CAP_OPTIONS = [
  { id: 'large' },
  { id: 'mid' },
  { id: 'small' },
  { id: 'micro' },
];

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

function bucketKey(source, cap, flow) {
  return `${source}:${cap}:${flow}`;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRawRow(r) {
  const boughtCr = Math.round(toNum(r.bought_cr) * 100) / 100;
  const soldCr = Math.round(toNum(r.sold_cr) * 100) / 100;
  const cap = r.market_cap_category;
  const validCap = TOP_STOCKS_CAP_OPTIONS.some((c) => c.id === cap) ? cap : null;
  return {
    stockSlug: String(r.stock_slug),
    stockName: String(r.stock_name),
    sector: r.sector ? String(r.sector) : '',
    boughtCr,
    soldCr,
    netCr: Math.round((boughtCr - soldCr) * 100) / 100,
    cap: validCap,
  };
}

function buildBuckets(source, rows) {
  const byCap = new Map(TOP_STOCKS_CAP_OPTIONS.map((o) => [o.id, []]));
  for (const raw of rows) {
    const row = mapRawRow(raw);
    if (!row.cap) continue;
    byCap.get(row.cap).push({
      stockSlug: row.stockSlug,
      stockName: row.stockName,
      sector: row.sector,
      boughtCr: row.boughtCr,
      soldCr: row.soldCr,
      netCr: row.netCr,
    });
  }

  const out = {};
  for (const opt of TOP_STOCKS_CAP_OPTIONS) {
    const list = byCap.get(opt.id);
    out[bucketKey(source, opt.id, 'accumulation')] = [...list]
      .filter((r) => r.netCr > 0)
      .sort((a, b) => b.netCr - a.netCr)
      .slice(0, 50);
    out[bucketKey(source, opt.id, 'distribution')] = [...list]
      .filter((r) => r.netCr < 0)
      .sort((a, b) => a.netCr - b.netCr)
      .slice(0, 50);
  }
  return out;
}

async function loadMutualFundFlows(sql) {
  const monthRow = await sql`SELECT MAX(month) AS m FROM holdings_changes`;
  const month = monthRow[0]?.m;
  if (!month) return { period: '', rows: [] };

  const periodRows = await sql`
    SELECT TRIM(TO_CHAR(${month}::date, 'FMMonth YYYY')) AS label
  `;
  const period = periodRows[0]?.label?.trim() || String(month);

  const rows = await sql`
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
  `;

  return { period, rows };
}

async function loadSuperInvestorFlows(sql) {
  const qRow = await sql`
    SELECT MAX(ec.quarter) AS q FROM entity_changes ec
    JOIN tracked_entities te ON te.id = ec.entity_id
    WHERE te.type = ANY(${SUPER_INVESTOR_TYPES}) AND ec.strategy_id IS NULL
  `;
  const quarter = qRow[0]?.q;
  if (!quarter) return { period: '', rows: [] };

  const periodRows = await sql`
    SELECT TRIM(TO_CHAR(${quarter}::date, 'FMMonth YYYY')) AS label
  `;
  const period = periodRows[0]?.label ? `Q ${periodRows[0].label}` : String(quarter);

  const rows = await sql`
    WITH by_stock AS (
      SELECT ec.stock_id,
        SUM(GREATEST(ec.value_change_cr, 0)) AS bought_cr,
        SUM(GREATEST(-ec.value_change_cr, 0)) AS sold_cr
      FROM entity_changes ec
      JOIN tracked_entities te ON te.id = ec.entity_id
      WHERE ec.quarter = ${quarter}::date
        AND ec.strategy_id IS NULL
        AND te.type = ANY(${SUPER_INVESTOR_TYPES})
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
  `;

  return { period, rows };
}

async function loadOnePercentClubFlows(sql) {
  const qRows = await sql`
    SELECT DISTINCT quarter FROM shareholding_pattern_holders
    WHERE is_promoter = FALSE ORDER BY quarter DESC LIMIT 2
  `;
  if (qRows.length < 2) return { period: '', rows: [] };

  const currQ = qRows[0].quarter;
  const prevQ = qRows[1].quarter;

  const periodRows = await sql`
    SELECT TRIM(TO_CHAR(${currQ}::date, 'FMMonth YYYY')) AS label
  `;
  const period = periodRows[0]?.label ? `Q ${periodRows[0].label}` : String(currQ);

  const rows = await sql`
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
  `;

  return { period, rows };
}

export async function buildTopStocksExport(sql) {
  const [mf, si, opc] = await Promise.all([
    loadMutualFundFlows(sql),
    loadSuperInvestorFlows(sql),
    loadOnePercentClubFlows(sql),
  ]);
  const buckets = {
    ...buildBuckets('mutual_funds', mf.rows),
    ...buildBuckets('super_investors', si.rows),
    ...buildBuckets('one_percent_club', opc.rows),
  };
  return {
    periods: {
      mutual_funds: mf.period,
      super_investors: si.period,
      one_percent_club: opc.period,
    },
    buckets,
    hasData: Object.values(buckets).some((rows) => rows.length > 0),
  };
}
