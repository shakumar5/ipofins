/**
 * Build smart-money JSON exports (mirrors src/lib/data/holdings.ts aggregation).
 */
import { isDebtInstrument, isValidEquitySector, filterTrackerSectorOptions } from './stock-utils.mjs';

const TRACKER_CATEGORIES = [
  'All', 'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap', 'Others',
];

const EQUITY_FUND_CATEGORIES = new Set([
  'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap',
  'Value', 'Focused', 'ELSS', 'Sectoral/Thematic', 'Sectoral', 'Contra', 'Dividend Yield', 'Index',
]);

const CAP_CATEGORIES = new Set(['Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap']);

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function mapFundCategory(category) {
  return CAP_CATEGORIES.has(category) ? category : 'Others';
}

function isEquityFundCategory(category) {
  return EQUITY_FUND_CATEGORIES.has(category);
}

function normalizeStockName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\s+\d{2}\/\d{2}\/\d{4}\s*$/g, '')
    .replace(/\blimited\b/g, 'ltd')
    .replace(/\bltd\.?\b/g, 'ltd')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bltd\s*$/g, '')
    .trim();
}

function stockGroupKey(isin, stockName) {
  const code = String(isin || '').trim().toUpperCase();
  if (code) return code;
  return `name:${normalizeStockName(stockName)}`;
}

function roundPct(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const WEIGHT_CHANGE_THRESHOLD = 0.01;

function computeTrackerStockWeights(funds, changeType) {
  if (!funds.length) return { weightAvg: 0, weightTotal: 0 };
  if (changeType === 'increased') {
    const sum = funds.reduce((s, f) => s + f.pctChange, 0);
    return { weightTotal: roundPct(sum), weightAvg: roundPct(sum / funds.length) };
  }
  if (changeType === 'decreased') {
    const sum = funds.reduce((s, f) => s + (f.prevPct - f.newPct), 0);
    return { weightTotal: roundPct(sum), weightAvg: roundPct(sum / funds.length) };
  }
  if (changeType === 'fresh_entry') {
    const sum = funds.reduce((s, f) => s + f.newPct, 0);
    return { weightTotal: roundPct(sum), weightAvg: roundPct(sum / funds.length) };
  }
  const sum = funds.reduce((s, f) => s + f.prevPct, 0);
  return { weightTotal: roundPct(sum), weightAvg: roundPct(sum / funds.length) };
}

function pickBetterStockMeta(current, candidate) {
  const betterName = candidate.stockName.length >= current.stockName.length ? candidate.stockName : current.stockName;
  const betterSlug = candidate.stockName.length >= current.stockName.length ? candidate.stockSlug : current.stockSlug;
  const sector =
    !isValidEquitySector(current.sector) && isValidEquitySector(candidate.sector)
      ? candidate.sector
      : current.sector;
  return { stockName: betterName, stockSlug: betterSlug, sector };
}

function aggregateChanges(rows) {
  const sectorsSet = new Set();
  const monthMeta = new Map();
  const buckets = new Map();

  for (const row of rows) {
    if (!isEquityFundCategory(row.fundCategory)) continue;
    if (isDebtInstrument(row.stockName, row.sector)) continue;
    if (!isValidEquitySector(row.sector)) continue;
    if (!['increased', 'decreased', 'fresh_entry', 'complete_exit'].includes(row.changeType)) continue;

    if (row.sector && row.sector !== 'Unknown') sectorsSet.add(row.sector);
    if (row.prevMonthLabel) monthMeta.set(row.monthLabel, row.prevMonthLabel);

    if (!buckets.has(row.monthLabel)) buckets.set(row.monthLabel, new Map());
    const monthBucket = buckets.get(row.monthLabel);
    if (!monthBucket.has(row.changeType)) monthBucket.set(row.changeType, new Map());
    const typeBucket = monthBucket.get(row.changeType);

    const key = stockGroupKey(row.isin, row.stockName);
    if (!typeBucket.has(key)) {
      typeBucket.set(key, {
        stockName: row.stockName,
        stockSlug: row.stockSlug,
        sector: row.sector || 'Unknown',
        funds: [],
      });
    } else {
      const bucket = typeBucket.get(key);
      const better = pickBetterStockMeta(bucket, {
        stockName: row.stockName,
        stockSlug: row.stockSlug,
        sector: row.sector || 'Unknown',
      });
      bucket.stockName = better.stockName;
      bucket.stockSlug = better.stockSlug;
      bucket.sector = better.sector;
    }
    typeBucket.get(key).funds.push({
      fundName: row.fundName,
      fundCategory: mapFundCategory(row.fundCategory),
      prevPct: roundPct(row.prevPct),
      newPct: roundPct(row.newPct),
      pctChange: roundPct(row.pctChange),
    });
  }

  const byMonth = {};
  const monthList = [];

  for (const [monthLabel, typeMap] of buckets) {
    const prevLabel = monthMeta.get(monthLabel) || '';
    monthList.push({ label: monthLabel, prevLabel });

    const buildRows = (changeType) => {
      const stockMap = typeMap.get(changeType);
      if (!stockMap) return [];
      const result = [];
      for (const bucket of stockMap.values()) {
        const allFunds = bucket.funds.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
        const funds =
          changeType === 'increased'
            ? allFunds.filter((f) => f.pctChange > WEIGHT_CHANGE_THRESHOLD)
            : changeType === 'decreased'
              ? allFunds.filter((f) => f.pctChange < -WEIGHT_CHANGE_THRESHOLD)
              : allFunds;
        if (changeType === 'increased' || changeType === 'decreased') {
          if (funds.length === 0) continue;
        }
        const weights = computeTrackerStockWeights(funds, changeType);
        result.push({
          stockName: bucket.stockName,
          stockSlug: bucket.stockSlug,
          sector: bucket.sector,
          fundCount: funds.length,
          weightAvg: weights.weightAvg,
          weightTotal: weights.weightTotal,
          funds,
        });
      }
      return result;
    };

    byMonth[monthLabel] = {
      month: monthLabel,
      prevMonth: prevLabel,
      increased: buildRows('increased'),
      decreased: buildRows('decreased'),
      fresh_entry: buildRows('fresh_entry'),
      complete_exit: buildRows('complete_exit'),
    };
  }

  monthList.sort((a, b) => {
    const parse = (s) => {
      const [m, y] = s.split(' ');
      return Number(y) * 12 + MONTH_ORDER.indexOf(m);
    };
    return parse(b.label) - parse(a.label);
  });

  return {
    months: monthList,
    categories: [...TRACKER_CATEGORIES],
    sectors: filterTrackerSectorOptions(['All', ...[...sectorsSet].sort()]),
    byMonth,
    dataSource: 'holdings_changes',
  };
}

export async function loadRawHoldingsChanges(sql) {
  const rows = await sql`
    SELECT
      TRIM(TO_CHAR(hc.month, 'FMMonth YYYY')) AS month_label,
      TRIM(TO_CHAR(hc.prev_month, 'FMMonth YYYY')) AS prev_month_label,
      hc.change_type,
      s.name AS stock_name,
      s.slug AS stock_slug,
      COALESCE(s.isin, '') AS isin,
      COALESCE(sec.name, 'Unknown') AS sector,
      COALESCE(s.market_cap_category, '') AS market_cap_category,
      COALESCE(s.nse_symbol, '') AS nse_symbol,
      f.name AS fund_name,
      f.category AS fund_category,
      a.id AS amc_id,
      COALESCE(hc.prev_pct, 0)::float AS prev_pct,
      COALESCE(hc.new_pct, 0)::float AS new_pct,
      COALESCE(hc.pct_change, 0)::float AS pct_change
    FROM holdings_changes hc
    JOIN funds f ON f.id = hc.fund_id AND f.is_active = true
    JOIN amcs a ON a.id = f.amc_id
    JOIN stocks s ON s.id = hc.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE hc.change_type IN ('increased', 'decreased', 'fresh_entry', 'complete_exit')
      AND hc.month >= (SELECT MAX(month) - INTERVAL '12 months' FROM holdings_changes)
      AND EXISTS (SELECT 1 FROM fund_holdings fh WHERE fh.fund_id = f.id LIMIT 1)
    ORDER BY hc.month DESC
  `;

  return rows.map((r) => ({
    monthLabel: String(r.month_label).trim(),
    prevMonthLabel: String(r.prev_month_label || '').trim(),
    changeType: String(r.change_type),
    stockName: String(r.stock_name),
    stockSlug: String(r.stock_slug),
    isin: String(r.isin || ''),
    sector: String(r.sector),
    stockCapCategory: String(r.market_cap_category || ''),
    nseSymbol: String(r.nse_symbol || '').trim(),
    fundName: String(r.fund_name),
    fundCategory: String(r.fund_category),
    amcId: r.amc_id != null ? Number(r.amc_id) : null,
    prevPct: Number(r.prev_pct),
    newPct: Number(r.new_pct),
    pctChange: Number(r.pct_change),
  }));
}

async function loadConvictionScoreData(sql) {
  const monthRows = await sql`
    SELECT DISTINCT TRIM(TO_CHAR(month, 'FMMonth YYYY')) AS month_label, month
    FROM stock_signals ORDER BY month DESC LIMIT 12
  `;
  const months = monthRows.map((r) => String(r.month_label).trim());
  if (!months.length) return { months: [], categories: ['ALL'], rows: [] };

  const catRows = await sql`SELECT DISTINCT category FROM stock_signals ORDER BY category`;
  const categories = catRows.map((r) => String(r.category));

  const rows = await sql`
    SELECT
      s.name AS stock_name, s.slug AS stock_slug,
      COALESCE(sec.name, 'Unknown') AS sector,
      sig.category, sig.conviction_score, sig.fresh_entries,
      sig.increased_count, sig.decreased_count, sig.complete_exits,
      sig.total_funds_holding,
      TRIM(TO_CHAR(sig.month, 'FMMonth YYYY')) AS month_label
    FROM stock_signals sig
    JOIN stocks s ON s.id = sig.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE sig.month >= (SELECT MAX(month) - INTERVAL '12 months' FROM stock_signals)
    ORDER BY sig.month DESC, sig.category, sig.conviction_score DESC NULLS LAST
    LIMIT 5000
  `;

  return {
    months,
    categories,
    rows: rows.map((r) => ({
      stockName: String(r.stock_name),
      stockSlug: String(r.stock_slug),
      sector: String(r.sector),
      category: String(r.category),
      convictionScore: r.conviction_score != null ? Number(r.conviction_score) : 0,
      freshEntries: Number(r.fresh_entries ?? 0),
      increasedCount: Number(r.increased_count ?? 0),
      decreasedCount: Number(r.decreased_count ?? 0),
      completeExits: Number(r.complete_exits ?? 0),
      totalFundsHolding: Number(r.total_funds_holding ?? 0),
      month: String(r.month_label).trim(),
    })),
  };
}

export async function buildSmartMoneyExports(sql) {
  const rawRows = await loadRawHoldingsChanges(sql);
  const tracker = aggregateChanges(rawRows);
  const conviction = await loadConvictionScoreData(sql);
  return { tracker, conviction };
}
