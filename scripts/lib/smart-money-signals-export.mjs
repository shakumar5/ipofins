/**
 * Build smart-money-signals.json — stock-level aggregation, percentile scoring
 * within each stock's market-cap bucket (Large / Mid / Small / Micro).
 */
import { isDebtInstrument, isValidEquitySector } from './stock-utils.mjs';
import { loadRawHoldingsChanges } from './smart-money-export.mjs';
import {
  buildSignalRowFromMetrics,
  computeCategoryMaxes,
  consecutiveAggregatedNetWeightTrend,
  inferStockCapFromFundVotes,
  normalizeStockCapCategory,
  STOCK_CAP_CATEGORIES,
} from './smart-money-signals-core.mjs';

const EQUITY_FUND_CATEGORIES = new Set([
  'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap',
  'Value', 'Focused', 'ELSS', 'Sectoral/Thematic', 'Sectoral', 'Contra', 'Dividend Yield', 'Index',
]);

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

function sortMonths(months) {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split(' ');
    const [mb, yb] = b.split(' ');
    if (ya !== yb) return Number(ya) - Number(yb);
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
  });
}

function monthIndex(label) {
  const [m, y] = label.split(' ');
  return Number(y) * 12 + MONTH_ORDER.indexOf(m);
}

function isEquityFundCategory(category) {
  return EQUITY_FUND_CATEGORIES.has(category);
}

function shortFundDisplayName(name) {
  const shortened = String(name)
    .replace(/\s*-\s*Direct\s+Plan.*$/i, '')
    .replace(/\s*FUND\s*-\s*DIRECT\s+PLAN.*$/i, '')
    .replace(/\s*Direct\s+Plan.*$/i, '')
    .replace(/\s+Growth\s+Option.*$/i, '')
    .replace(/\s+Growth\s*$/i, '')
    .trim();
  return shortened || name;
}

/** Top fund holders and fund count — aggregated across all equity funds per stock. */
async function loadStockHolderMeta(sql) {
  const rows = await sql`
    WITH ranked AS (
      SELECT
        s.slug AS stock_slug,
        TRIM(TO_CHAR(fh.month, 'FMMonth YYYY')) AS month_label,
        f.name AS fund_name,
        ROW_NUMBER() OVER (
          PARTITION BY s.slug, fh.month
          ORDER BY fh.pct_to_nav DESC NULLS LAST, f.name
        ) AS rn
      FROM fund_holdings fh
      JOIN funds f ON f.id = fh.fund_id AND f.is_active = true
      JOIN stocks s ON s.id = fh.stock_id
      WHERE fh.month >= (SELECT MAX(month) - INTERVAL '12 months' FROM fund_holdings)
    ),
    counts AS (
      SELECT stock_slug, month_label, COUNT(*)::int AS funds_holding
      FROM ranked
      GROUP BY stock_slug, month_label
    )
    SELECT
      r.stock_slug,
      r.month_label,
      c.funds_holding,
      r.fund_name,
      r.rn
    FROM ranked r
    JOIN counts c
      ON c.stock_slug = r.stock_slug
     AND c.month_label = r.month_label
    WHERE r.rn <= 3
    ORDER BY r.month_label DESC, r.stock_slug, r.rn
  `;

  const meta = new Map();
  for (const r of rows) {
    const key = `${r.stock_slug}|${r.month_label}`;
    if (!meta.has(key)) {
      meta.set(key, { fundsHolding: Number(r.funds_holding) || 0, topFundHolders: [] });
    }
    meta.get(key).topFundHolders.push(shortFundDisplayName(String(r.fund_name)));
  }
  return meta;
}

export async function buildSmartMoneySignalsExport(sql) {
  const rawRows = await loadRawHoldingsChanges(sql);
  const byKey = new Map();
  const monthsSet = new Set();
  const capsPresent = new Set();

  for (const row of rawRows) {
    if (!isEquityFundCategory(row.fundCategory)) continue;
    if (isDebtInstrument(row.stockName, row.sector)) continue;
    if (!isValidEquitySector(row.sector)) continue;

    const month = row.monthLabel;
    const groupKey = stockGroupKey(row.isin, row.stockName);
    const key = `${groupKey}|${month}`;
    monthsSet.add(month);

    if (!byKey.has(key)) {
      byKey.set(key, {
        stockGroupKey: groupKey,
        stockName: row.stockName,
        stockSlug: row.stockSlug,
        sector: row.sector || 'Unknown',
        category: 'Unknown',
        month,
        increasedCount: 0,
        decreasedCount: 0,
        freshEntries: 0,
        completeExits: 0,
        netWeightChangePct: 0,
        amcIdsAll: new Set(),
        amcIdsBuying: new Set(),
        fundCapVotes: {},
      });
    }

    const m = byKey.get(key);
    if (row.stockName.length >= m.stockName.length) {
      m.stockName = row.stockName;
      m.stockSlug = row.stockSlug;
    }

    const dbCap = normalizeStockCapCategory(row.stockCapCategory);
    if (dbCap !== 'Unknown') {
      m.category = dbCap;
    }

    if (row.fundCategory) {
      m.fundCapVotes[row.fundCategory] = (m.fundCapVotes[row.fundCategory] || 0) + 1;
    }

    const type = row.changeType;
    if (type === 'increased') {
      m.increasedCount++;
      if (row.amcId) m.amcIdsBuying.add(row.amcId);
    } else if (type === 'decreased') {
      m.decreasedCount++;
    } else if (type === 'fresh_entry') {
      m.freshEntries++;
      if (row.amcId) m.amcIdsBuying.add(row.amcId);
    } else if (type === 'complete_exit') {
      m.completeExits++;
    }

    m.netWeightChangePct += row.pctChange;
    if (row.amcId) m.amcIdsAll.add(row.amcId);
  }

  const sortedMonths = sortMonths([...monthsSet]);
  const enriched = [];

  for (const raw of byKey.values()) {
    if (
      raw.increasedCount + raw.freshEntries + raw.decreasedCount + raw.completeExits ===
      0
    ) {
      continue;
    }

    if (raw.category === 'Unknown') {
      raw.category = inferStockCapFromFundVotes(raw.fundCapVotes);
    }
    capsPresent.add(raw.category);

    const trend = consecutiveAggregatedNetWeightTrend(sortedMonths, raw.stockGroupKey, byKey);

    enriched.push({
      ...raw,
      netWeightChangePct: Math.round(raw.netWeightChangePct * 100) / 100,
      consecutivePositiveMonths: trend,
      amcsBuying: raw.amcIdsBuying.size,
      buyingFunds: raw.increasedCount + raw.freshEntries,
    });
  }

  const bucketMap = new Map();
  for (const item of enriched) {
    const bucketKey = `${item.month}|${item.category}`;
    if (!bucketMap.has(bucketKey)) bucketMap.set(bucketKey, []);
    bucketMap.get(bucketKey).push(item);
  }

  const signalRows = [];
  for (const items of bucketMap.values()) {
    const maxes = computeCategoryMaxes(items);
    for (const item of items) {
      signalRows.push(buildSignalRowFromMetrics(item, maxes));
    }
  }

  const holderMeta = await loadStockHolderMeta(sql);
  for (const row of signalRows) {
    const key = `${row.stockSlug}|${row.month}`;
    const meta = holderMeta.get(key);
    if (meta) {
      row.fundsHolding = meta.fundsHolding;
      row.topFundHolders = meta.topFundHolders;
    }
  }

  signalRows.sort((a, b) => {
    const cmp = monthIndex(b.month) - monthIndex(a.month);
    if (cmp !== 0) return cmp;
    const ai = STOCK_CAP_CATEGORIES.indexOf(a.category);
    const bi = STOCK_CAP_CATEGORIES.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return b.convictionScore - a.convictionScore;
  });

  const categories = STOCK_CAP_CATEGORIES.filter(
    (c) => c !== 'Unknown' && capsPresent.has(c),
  );
  if (capsPresent.has('Unknown')) categories.push('Unknown');

  return {
    months: [...sortedMonths].reverse(),
    categories,
    rows: signalRows,
  };
}
