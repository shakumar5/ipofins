/**
 * Holdings & smart-money data access — reads from Neon at Astro build time.
 */

import { requireDb } from '../db';
import { buildFundOverlapPageSlugResolver } from '../fund-overlap-slug';
import {
  monthsFromIndex,
  readFundHoldingsMetaFromDisk,
  readFundHoldingsRowsFromDisk,
  readFundHoldingsBySlugFromDisk,
  readFundPortfolioStockCountFromDisk,
  readFundOverlapIndexFromDisk,
  readFundOverlapsByFundFromDisk,
  fundSlugCandidates,
  readHoldingsCompareIndexFromDisk,
  readPortfolioOverlapFromDisk,
} from '../holdings-compare-server';
import {
  computeTrackerStockWeights,
  filterTrackerSectorOptions,
  isDebtHolding,
  isEquityFundCategory,
  isValidEquitySector,
  LISTABLE_EQUITY_CATEGORIES,
  mapFundCategory,
  pickBetterStockMeta,
  roundPct,
  stockGroupKey,
  TRACKER_CATEGORIES,
  WEIGHT_CHANGE_THRESHOLD,
} from '../holdings-utils';

export interface AMCInfo {
  name: string;
  slug: string;
  fundCount: number;
}

export interface HoldingsChangeRow {
  stockName: string;
  stockSlug: string;
  changeType: string;
  fundName: string;
  prevPct: number | null;
  newPct: number | null;
  month: string;
}

export async function getAMCsWithHoldings(): Promise<AMCInfo[]> {
  const index = readHoldingsCompareIndexFromDisk();
  if (index?.amcs?.length) {
    return index.amcs.map((a) => ({
      name: a.name,
      slug: a.slug,
      fundCount: a.fundCount,
    }));
  }

  try {
    const sql = requireDb();
    const rows = await sql`
      SELECT a.name, a.slug, COUNT(DISTINCT fh.fund_id)::int AS fund_count
      FROM fund_holdings fh
      JOIN funds f ON f.id = fh.fund_id
      JOIN amcs a ON a.id = f.amc_id
      WHERE fh.month = (SELECT MAX(month) FROM fund_holdings)
      GROUP BY a.id, a.name, a.slug
      HAVING COUNT(DISTINCT fh.fund_id) > 0
      ORDER BY a.name
    `;
    return (rows as Record<string, unknown>[]).map((r) => ({
      name: String(r.name),
      slug: String(r.slug),
      fundCount: Number(r.fund_count),
    }));
  } catch {
    throw new Error('Holdings AMC list unavailable — run npm run export:client-data');
  }
}

/** All AMCs with active funds — prefers exported holdings index, then Neon. */
export async function getAMCList(): Promise<AMCInfo[]> {
  return getAMCsWithHoldings();
}

/** Recent months for static AMC×month pages (fewer pages = faster builds). */
export async function getBuildMonths(maxMonths = 4): Promise<string[]> {
  const months = await getAvailableMonths();
  return months.slice(0, maxMonths);
}

export async function getAvailableMonths(): Promise<string[]> {
  const index = readHoldingsCompareIndexFromDisk();
  if (index?.months?.length) return monthsFromIndex(index);

  try {
    const sql = requireDb();
    const rows = await sql`
      SELECT DISTINCT TO_CHAR(month, 'FMMonth YYYY') AS month_label, month
      FROM holdings_changes
      ORDER BY month DESC
      LIMIT 12
    `;
    return (rows as Record<string, unknown>[]).map((r) => String(r.month_label).trim());
  } catch {
    throw new Error('Holdings months unavailable — run npm run export:client-data');
  }
}

export async function getHoldingsChangesByAMCMonth(
  amcSlug: string,
  monthLabel: string
): Promise<HoldingsChangeRow[]> {
  const sql = requireDb();
  const rows = await sql`
    SELECT
      s.name AS stock_name, s.slug AS stock_slug,
      hc.change_type, f.name AS fund_name,
      hc.prev_pct, hc.new_pct,
      TO_CHAR(hc.month, 'FMMonth YYYY') AS month_label
    FROM holdings_changes hc
    JOIN funds f ON f.id = hc.fund_id
    JOIN amcs a ON a.id = f.amc_id
    JOIN stocks s ON s.id = hc.stock_id
    WHERE a.slug = ${amcSlug}
      AND TRIM(TO_CHAR(hc.month, 'FMMonth YYYY')) = ${monthLabel}
      AND hc.change_type NOT IN ('unchanged')
    ORDER BY ABS(COALESCE(hc.new_pct, 0) - COALESCE(hc.prev_pct, 0)) DESC
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    stockName: String(r.stock_name),
    stockSlug: String(r.stock_slug),
    changeType: String(r.change_type),
    fundName: String(r.fund_name),
    prevPct: r.prev_pct != null ? Number(r.prev_pct) : null,
    newPct: r.new_pct != null ? Number(r.new_pct) : null,
    month: String(r.month_label).trim(),
  }));
}

export async function getSmartMoneySignals(category = 'ALL', limit = 50): Promise<Record<string, unknown>[]> {
  const sql = requireDb();
  const rows = await sql`
    SELECT s.name, s.slug, sig.conviction_score, sig.fresh_entries,
           sig.increased_count, sig.total_funds_holding, sig.month,
           COALESCE(sec.name, 'Unknown') AS sector
    FROM stock_signals sig
    JOIN stocks s ON s.id = sig.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE sig.category = ${category}
      AND sig.month = (SELECT MAX(month) FROM stock_signals WHERE category = ${category})
    ORDER BY sig.conviction_score DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows as Record<string, unknown>[];
}

export interface ConvictionScoreRow {
  stockName: string;
  stockSlug: string;
  sector: string;
  category: string;
  convictionScore: number;
  freshEntries: number;
  increasedCount: number;
  decreasedCount: number;
  completeExits: number;
  totalFundsHolding: number;
  month: string;
}

let smartMoneyCache: Promise<SmartMoneyTrackerData> | null = null;
let convictionCache: Promise<Awaited<ReturnType<typeof loadConvictionScoreData>>> | null = null;

async function loadConvictionScoreData(): Promise<{
  months: string[];
  categories: string[];
  rows: ConvictionScoreRow[];
}> {
  const sql = requireDb();

  const monthRows = await sql`
    SELECT DISTINCT TRIM(TO_CHAR(month, 'FMMonth YYYY')) AS month_label, month
    FROM stock_signals
    ORDER BY month DESC
    LIMIT 12
  `;
  const months = (monthRows as Record<string, unknown>[]).map((r) => String(r.month_label).trim());
  if (months.length === 0) return { months: [], categories: ['ALL'], rows: [] };

  const catRows = await sql`
    SELECT DISTINCT category FROM stock_signals ORDER BY category
  `;
  const categories = (catRows as Record<string, unknown>[]).map((r) => String(r.category));

  const rows = await sql`
    SELECT
      s.name AS stock_name,
      s.slug AS stock_slug,
      COALESCE(sec.name, 'Unknown') AS sector,
      sig.category,
      sig.conviction_score,
      sig.fresh_entries,
      sig.increased_count,
      sig.decreased_count,
      sig.complete_exits,
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
    rows: (rows as Record<string, unknown>[]).map((r) => ({
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

export async function getConvictionScoreData(): Promise<{
  months: string[];
  categories: string[];
  rows: ConvictionScoreRow[];
}> {
  if (!convictionCache) {
    convictionCache = loadConvictionScoreData();
  }
  return convictionCache;
}

export interface SmartMoneyFundChange {
  fundName: string;
  fundCategory: string;
  prevPct: number;
  newPct: number;
  pctChange: number;
}

export interface SmartMoneyStockRow {
  stockName: string;
  stockSlug: string;
  sector: string;
  fundCount: number;
  /** Average portfolio weight change (% of NAV) across funds in this row. */
  weightAvg: number;
  /** Sum of portfolio weight changes across funds (Most Bought/Sold only). */
  weightTotal: number;
  funds: SmartMoneyFundChange[];
}

export interface SmartMoneyMonthData {
  month: string;
  prevMonth: string;
  increased: SmartMoneyStockRow[];
  decreased: SmartMoneyStockRow[];
  fresh_entry: SmartMoneyStockRow[];
  complete_exit: SmartMoneyStockRow[];
}

export interface SmartMoneyTrackerData {
  months: { label: string; prevLabel: string }[];
  categories: string[];
  sectors: string[];
  byMonth: Record<string, SmartMoneyMonthData>;
  dataSource: 'holdings_changes' | 'computed';
}

interface RawChangeRow {
  monthLabel: string;
  prevMonthLabel: string;
  changeType: string;
  stockName: string;
  stockSlug: string;
  isin: string;
  sector: string;
  fundName: string;
  fundCategory: string;
  prevPct: number;
  newPct: number;
  pctChange: number;
}

async function loadRawHoldingsChanges(): Promise<{ rows: RawChangeRow[]; source: 'holdings_changes' | 'computed' }> {
  const sql = requireDb();

  const countRow = (await sql`SELECT COUNT(*)::int AS c FROM holdings_changes`) as Record<string, unknown>[];
  if (Number(countRow[0]?.c) > 0) {
    const rows = await sql`
      SELECT
        TRIM(TO_CHAR(hc.month, 'FMMonth YYYY')) AS month_label,
        TRIM(TO_CHAR(hc.prev_month, 'FMMonth YYYY')) AS prev_month_label,
        hc.change_type,
        s.name AS stock_name,
        s.slug AS stock_slug,
        COALESCE(s.isin, '') AS isin,
        COALESCE(sec.name, 'Unknown') AS sector,
        f.name AS fund_name,
        f.category AS fund_category,
        COALESCE(hc.prev_pct, 0)::float AS prev_pct,
        COALESCE(hc.new_pct, 0)::float AS new_pct,
        COALESCE(hc.pct_change, 0)::float AS pct_change
      FROM holdings_changes hc
      JOIN funds f ON f.id = hc.fund_id AND f.is_active = true
      JOIN stocks s ON s.id = hc.stock_id
      LEFT JOIN sectors sec ON sec.id = s.sector_id
      WHERE hc.change_type IN ('increased', 'decreased', 'fresh_entry', 'complete_exit')
        AND hc.month >= (SELECT MAX(month) - INTERVAL '12 months' FROM holdings_changes)
        AND EXISTS (SELECT 1 FROM fund_holdings fh WHERE fh.fund_id = f.id LIMIT 1)
      ORDER BY hc.month DESC
    `;
    return {
      source: 'holdings_changes',
      rows: (rows as Record<string, unknown>[]).map((r) => ({
      monthLabel: String(r.month_label).trim(),
      prevMonthLabel: String(r.prev_month_label || '').trim(),
      changeType: String(r.change_type),
      stockName: String(r.stock_name),
      stockSlug: String(r.stock_slug),
      isin: String(r.isin || ''),
      sector: String(r.sector),
      fundName: String(r.fund_name),
      fundCategory: String(r.fund_category),
      prevPct: Number(r.prev_pct),
      newPct: Number(r.new_pct),
      pctChange: Number(r.pct_change),
    })),
    };
  }

  // Fallback: compute latest month only when holdings_changes not populated
  const months = (await sql`
    SELECT DISTINCT month FROM fund_holdings ORDER BY month DESC LIMIT 1
  `) as Record<string, unknown>[];
  const allRows: RawChangeRow[] = [];

  for (const m of months) {
    const month = m.month as string;
    const prevResult = (await sql`
      SELECT month FROM fund_holdings
      WHERE month < ${month}::DATE
      ORDER BY month DESC LIMIT 1
    `) as Record<string, unknown>[];
    if (prevResult.length === 0) continue;
    const prevMonth = String(prevResult[0].month);

    const rows = await sql`
      SELECT
        TRIM(TO_CHAR(${month}::DATE, 'FMMonth YYYY')) AS month_label,
        TRIM(TO_CHAR(${prevMonth}::DATE, 'FMMonth YYYY')) AS prev_month_label,
        CASE
          WHEN prev.stock_id IS NULL THEN 'fresh_entry'
          WHEN curr.stock_id IS NULL THEN 'complete_exit'
          WHEN (COALESCE(curr.pct_to_nav, 0) - COALESCE(prev.pct_to_nav, 0)) > ${WEIGHT_CHANGE_THRESHOLD} THEN 'increased'
          WHEN (COALESCE(prev.pct_to_nav, 0) - COALESCE(curr.pct_to_nav, 0)) > ${WEIGHT_CHANGE_THRESHOLD} THEN 'decreased'
          ELSE 'unchanged'
        END AS change_type,
        s.name AS stock_name,
        s.slug AS stock_slug,
        COALESCE(s.isin, '') AS isin,
        COALESCE(sec.name, 'Unknown') AS sector,
        f.name AS fund_name,
        f.category AS fund_category,
        COALESCE(prev.pct_to_nav, 0)::float AS prev_pct,
        COALESCE(curr.pct_to_nav, 0)::float AS new_pct,
        (COALESCE(curr.pct_to_nav, 0) - COALESCE(prev.pct_to_nav, 0))::float AS pct_change
      FROM fund_holdings curr
      FULL OUTER JOIN fund_holdings prev
        ON curr.fund_id = prev.fund_id
        AND curr.stock_id = prev.stock_id
        AND prev.month = ${prevMonth}::DATE
      JOIN funds f ON f.id = COALESCE(curr.fund_id, prev.fund_id) AND f.is_active = true
      JOIN stocks s ON s.id = COALESCE(curr.stock_id, prev.stock_id)
      LEFT JOIN sectors sec ON sec.id = s.sector_id
      WHERE (curr.month = ${month}::DATE OR (prev.month = ${prevMonth}::DATE AND curr.stock_id IS NULL))
        AND EXISTS (SELECT 1 FROM fund_holdings fh WHERE fh.fund_id = f.id LIMIT 1)
    `;

    for (const r of rows as Record<string, unknown>[]) {
      const changeType = String(r.change_type);
      if (changeType === 'unchanged') continue;
      allRows.push({
        monthLabel: String(r.month_label).trim(),
        prevMonthLabel: String(r.prev_month_label).trim(),
        changeType,
        stockName: String(r.stock_name),
        stockSlug: String(r.stock_slug),
        isin: String(r.isin || ''),
        sector: String(r.sector),
        fundName: String(r.fund_name),
        fundCategory: String(r.fund_category),
        prevPct: Number(r.prev_pct),
        newPct: Number(r.new_pct),
        pctChange: Number(r.pct_change),
      });
    }
  }

  return { source: 'computed', rows: allRows };
}

interface StockBucket {
  stockName: string;
  stockSlug: string;
  sector: string;
  funds: SmartMoneyFundChange[];
}

function aggregateChanges(rows: RawChangeRow[]): SmartMoneyTrackerData {
  const sectorsSet = new Set<string>();
  const monthMeta = new Map<string, string>();
  const buckets = new Map<string, Map<string, Map<string, StockBucket>>>();

  for (const row of rows) {
    if (!isEquityFundCategory(row.fundCategory)) continue;
    if (isDebtHolding(row.stockName, row.sector)) continue;
    if (!isValidEquitySector(row.sector)) continue;
    if (!['increased', 'decreased', 'fresh_entry', 'complete_exit'].includes(row.changeType)) continue;

    if (row.sector && row.sector !== 'Unknown') sectorsSet.add(row.sector);
    if (row.prevMonthLabel) monthMeta.set(row.monthLabel, row.prevMonthLabel);

    if (!buckets.has(row.monthLabel)) buckets.set(row.monthLabel, new Map());
    const monthBucket = buckets.get(row.monthLabel)!;
    if (!monthBucket.has(row.changeType)) monthBucket.set(row.changeType, new Map());
    const typeBucket = monthBucket.get(row.changeType)!;

    const key = stockGroupKey(row.isin, row.stockName);
    if (!typeBucket.has(key)) {
      typeBucket.set(key, {
        stockName: row.stockName,
        stockSlug: row.stockSlug,
        sector: row.sector || 'Unknown',
        funds: [],
      });
    } else {
      const bucket = typeBucket.get(key)!;
      const better = pickBetterStockMeta(bucket, {
        stockName: row.stockName,
        stockSlug: row.stockSlug,
        sector: row.sector || 'Unknown',
      });
      bucket.stockName = better.stockName;
      bucket.stockSlug = better.stockSlug;
      bucket.sector = better.sector;
    }
    typeBucket.get(key)!.funds.push({
      fundName: row.fundName,
      fundCategory: mapFundCategory(row.fundCategory),
      prevPct: roundPct(row.prevPct),
      newPct: roundPct(row.newPct),
      pctChange: roundPct(row.pctChange),
    });
  }

  const byMonth: Record<string, SmartMoneyMonthData> = {};
  const monthList: { label: string; prevLabel: string }[] = [];

  for (const [monthLabel, typeMap] of buckets) {
    const prevLabel = monthMeta.get(monthLabel) || '';
    monthList.push({ label: monthLabel, prevLabel });

    const buildRows = (changeType: string): SmartMoneyStockRow[] => {
      const stockMap = typeMap.get(changeType);
      if (!stockMap) return [];

      const result: SmartMoneyStockRow[] = [];
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
        const weights = computeTrackerStockWeights(
          funds,
          changeType as 'increased' | 'decreased' | 'fresh_entry' | 'complete_exit',
        );

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
    const parse = (s: string) => {
      const [m, y] = s.split(' ');
      const order = MONTH_ORDER.indexOf(m);
      return Number(y) * 12 + order;
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

export async function getSmartMoneyTrackerData(): Promise<SmartMoneyTrackerData> {
  if (!smartMoneyCache) {
    smartMoneyCache = (async () => {
      const { rows, source } = await loadRawHoldingsChanges();
      const data = aggregateChanges(rows);
      data.dataSource = source;
      return data;
    })();
  }
  return smartMoneyCache;
}

export async function getFundSlugsWithHoldings(): Promise<Set<string>> {
  const meta = await loadFundHoldingsMeta();
  const slugs = new Set(meta.slugs);
  const overlap = readPortfolioOverlapFromDisk();
  for (const f of overlap?.funds ?? []) {
    if (f.slug) slugs.add(f.slug);
  }
  return slugs;
}

/** Latest-month distinct stock count per listable fund slug (for All Funds table). */
export async function getFundStockCounts(): Promise<Record<string, number>> {
  const meta = await loadFundHoldingsMeta();
  return meta.stockCounts;
}

export async function getFundHoldingsMeta(): Promise<{
  slugs: Set<string>;
  stockCounts: Record<string, number>;
}> {
  return loadFundHoldingsMeta();
}

interface FundHoldingsMeta {
  slugs: Set<string>;
  stockCounts: Record<string, number>;
}

let fundHoldingsMetaCache: Promise<FundHoldingsMeta> | null = null;

async function loadFundHoldingsMeta(): Promise<FundHoldingsMeta> {
  if (!fundHoldingsMetaCache) {
    fundHoldingsMetaCache = queryFundHoldingsMeta();
  }
  return fundHoldingsMetaCache;
}

async function queryFundHoldingsMeta(): Promise<FundHoldingsMeta> {
  const disk = readFundHoldingsMetaFromDisk();
  if (disk?.slugs?.length) {
    return {
      slugs: new Set(disk.slugs),
      stockCounts: disk.stockCounts,
    };
  }

  const sql = requireDb();
  const rows = await sql`
    WITH fund_latest AS (
      SELECT fund_id, MAX(month) AS m FROM fund_holdings GROUP BY fund_id
    ),
    portfolio_stats AS (
      SELECT ps.fund_id, ps.total_stocks
      FROM fund_portfolio_stats ps
      INNER JOIN fund_latest fl ON fl.fund_id = ps.fund_id AND ps.month = fl.m
    ),
    holders AS (
      SELECT
        f.id AS holder_id,
        f.amc_id,
        f.scheme_code AS holder_scheme,
        regexp_replace(
          regexp_replace(f.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
          '-growth-option$', ''
        ) AS holder_base,
        COUNT(DISTINCT fh.stock_id)::int AS stored_stock_count,
        MAX(ps.total_stocks)::int AS portfolio_total
      FROM fund_holdings fh
      JOIN funds f ON f.id = fh.fund_id
      INNER JOIN fund_latest fl ON fl.fund_id = fh.fund_id AND fh.month = fl.m
      LEFT JOIN portfolio_stats ps ON ps.fund_id = f.id
      GROUP BY f.id, f.amc_id, f.scheme_code, holder_base
    ),
    listable AS (
      SELECT
        f.id,
        f.slug,
        f.amc_id,
        f.scheme_code,
        regexp_replace(
          regexp_replace(f.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
          '-growth-option$', ''
        ) AS base_slug
      FROM funds f
      WHERE f.is_active = true
        AND f.scheme_code IS NOT NULL
        AND TRIM(f.scheme_code) <> ''
        AND f.slug LIKE '%-direct-plan'
        AND f.category = ANY(${LISTABLE_EQUITY_CATEGORIES})
        AND f.name NOT ILIKE '%IDCW%'
        AND f.name NOT ILIKE '%dividend payout%'
        AND f.name NOT ILIKE '%dividend plan%'
        AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
    )
    SELECT l.slug, COALESCE(NULLIF(h.stored_stock_count, 0), h.portfolio_total) AS stock_count
    FROM listable l
    CROSS JOIN LATERAL (
      SELECT h.portfolio_total, h.stored_stock_count
      FROM holders h
      WHERE h.holder_id = l.id
         OR (
           l.amc_id IS NOT NULL
           AND h.amc_id = l.amc_id
           AND h.holder_scheme IS NOT NULL
           AND TRIM(h.holder_scheme) <> ''
           AND h.holder_scheme = l.scheme_code
         )
         OR (
           l.amc_id IS NOT NULL
           AND h.amc_id = l.amc_id
           AND h.holder_base = l.base_slug
         )
         OR h.holder_base = l.base_slug
         OR regexp_replace(regexp_replace(h.holder_base, '-and-', '-', 'g'), '-', '', 'g')
            = regexp_replace(regexp_replace(l.base_slug, '-and-', '-', 'g'), '-', '', 'g')
      ORDER BY
        (h.holder_id = l.id) DESC,
        (
          l.scheme_code IS NOT NULL
          AND TRIM(l.scheme_code) <> ''
          AND h.holder_scheme = l.scheme_code
        ) DESC,
        (h.holder_base = l.base_slug) DESC,
        COALESCE(NULLIF(h.stored_stock_count, 0), h.portfolio_total) DESC
      LIMIT 1
    ) h
    WHERE COALESCE(NULLIF(h.stored_stock_count, 0), h.portfolio_total) > 0
  `;
  const directRows = await sql`
    WITH fund_latest AS (
      SELECT fund_id, MAX(month) AS m FROM fund_holdings GROUP BY fund_id
    ),
    portfolio_stats AS (
      SELECT ps.fund_id, ps.total_stocks
      FROM fund_portfolio_stats ps
      INNER JOIN fund_latest fl ON fl.fund_id = ps.fund_id AND ps.month = fl.m
    )
    SELECT
      f.slug,
      COALESCE(COUNT(DISTINCT fh.stock_id)::int, MAX(ps.total_stocks)) AS stock_count
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id
    INNER JOIN fund_latest fl ON fl.fund_id = fh.fund_id AND fh.month = fl.m
    LEFT JOIN portfolio_stats ps ON ps.fund_id = f.id
      AND f.is_active = true
      AND f.slug LIKE '%-direct-plan'
      AND f.category = ANY(${LISTABLE_EQUITY_CATEGORIES})
      AND f.name NOT ILIKE '%IDCW%'
      AND f.name NOT ILIKE '%dividend payout%'
      AND f.name NOT ILIKE '%dividend plan%'
      AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
    GROUP BY f.slug
    HAVING COALESCE(COUNT(DISTINCT fh.stock_id)::int, MAX(ps.total_stocks)) > 0
  `;
  const slugs = new Set<string>();
  const stockCounts: Record<string, number> = {};
  for (const row of [...(rows as Record<string, unknown>[]), ...(directRows as Record<string, unknown>[])] as Record<string, unknown>[]) {
    const slug = String(row.slug);
    const count = Number(row.stock_count);
    if (!count) continue;
    slugs.add(slug);
    stockCounts[slug] = Math.max(stockCounts[slug] ?? 0, count);
  }
  return { slugs, stockCounts };
}

/** Equity holdings count for latest month (stored fund_holdings rows, not AMC total line items). */
export async function getFundPortfolioStockCount(fundSlug: string): Promise<number | null> {
  const diskCount = readFundPortfolioStockCountFromDisk(fundSlug);
  if (diskCount != null) return diskCount;

  const sql = requireDb();
  const rows = await sql`
    WITH target AS (
      SELECT id, amc_id, slug, scheme_code FROM funds
      WHERE slug = ${fundSlug} AND is_active = true LIMIT 1
    ),
    holder AS (
      SELECT COALESCE(
        (SELECT f.id FROM funds f
         JOIN fund_holdings fh ON fh.fund_id = f.id
         WHERE f.slug = ${fundSlug}
         LIMIT 1),
        (SELECT h.id FROM fund_holdings fh
         JOIN funds h ON h.id = fh.fund_id
         CROSS JOIN target t
         WHERE h.slug = t.slug
            OR (
              t.amc_id IS NOT NULL
              AND h.amc_id = t.amc_id
              AND t.scheme_code IS NOT NULL
              AND TRIM(t.scheme_code) <> ''
              AND h.scheme_code = t.scheme_code
            )
            OR regexp_replace(
                 regexp_replace(h.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
                 '-growth-option$', ''
               ) = regexp_replace(
                 regexp_replace(t.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
                 '-growth-option$', ''
               )
         ORDER BY (h.slug = t.slug) DESC
         LIMIT 1)
      ) AS id
    )
    SELECT COUNT(DISTINCT fh.stock_id)::int AS stock_count
    FROM fund_holdings fh
    JOIN holder h ON fh.fund_id = h.id
    WHERE fh.month = (SELECT MAX(month) FROM fund_holdings WHERE fund_id = h.id)
  `;
  const val = (rows as Record<string, unknown>[])[0]?.stock_count;
  return val != null ? Number(val) : null;
}

function mapFundHoldingRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    name: String(r.name || r.stock_name || ''),
    stock_slug: r.stock_slug ? String(r.stock_slug) : undefined,
    pct: r.pct != null ? Number(r.pct) : 0,
    sector: String(r.sector || ''),
    month: r.month,
  }));
}

export async function getFundHoldings(fundSlug: string): Promise<Record<string, unknown>[]> {
  const diskCandidates = [
    readFundHoldingsBySlugFromDisk(fundSlug),
    readFundHoldingsRowsFromDisk(fundSlug),
  ].filter((rows): rows is Record<string, unknown>[] => Boolean(rows?.length));
  const diskRows = diskCandidates.sort((a, b) => b.length - a.length)[0] ?? null;

  const sql = requireDb();
  const rows = (await sql`
    WITH target AS (
      SELECT id, amc_id, slug, scheme_code FROM funds
      WHERE slug = ${fundSlug} AND is_active = true LIMIT 1
    ),
    holder AS (
      SELECT COALESCE(
        (SELECT f.id FROM funds f
         JOIN fund_holdings fh ON fh.fund_id = f.id
         WHERE f.slug = ${fundSlug}
         LIMIT 1),
        (SELECT h.id FROM fund_holdings fh
         JOIN funds h ON h.id = fh.fund_id
         CROSS JOIN target t
         WHERE h.slug = t.slug
            OR (
              t.amc_id IS NOT NULL
              AND h.amc_id = t.amc_id
              AND (
                (t.scheme_code IS NOT NULL AND TRIM(t.scheme_code) <> '' AND h.scheme_code = t.scheme_code)
                OR regexp_replace(
                     regexp_replace(h.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
                     '-growth-option$', ''
                   ) = regexp_replace(
                     regexp_replace(t.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
                     '-growth-option$', ''
                   )
              )
            )
            OR regexp_replace(
                 regexp_replace(h.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
                 '-growth-option$', ''
               ) = regexp_replace(
                 regexp_replace(t.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
                 '-growth-option$', ''
               )
            OR regexp_replace(
                 regexp_replace(
                   regexp_replace(h.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
                   '-growth-option$', ''
                 ),
                 '-and-', '-', 'g'
               ) = regexp_replace(
                 regexp_replace(
                   regexp_replace(t.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
                   '-growth-option$', ''
                 ),
                 '-and-', '-', 'g'
               )
         ORDER BY
           (h.slug = t.slug) DESC,
           (t.scheme_code IS NOT NULL AND TRIM(t.scheme_code) <> '' AND h.scheme_code = t.scheme_code) DESC,
           h.id
         LIMIT 1)
      ) AS id
    )
    SELECT s.name, s.slug AS stock_slug, fh.pct_to_nav AS pct, sec.name AS sector, fh.month
    FROM fund_holdings fh
    JOIN holder h ON fh.fund_id = h.id
    JOIN stocks s ON s.id = fh.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE fh.month = (SELECT MAX(month) FROM fund_holdings WHERE fund_id = h.id)
    ORDER BY fh.pct_to_nav DESC NULLS LAST
  `) as Record<string, unknown>[];

  const dbRows = mapFundHoldingRows(rows);
  if (dbRows.length >= (diskRows?.length ?? 0)) return dbRows;
  return diskRows ?? dbRows;
}

export interface FundComparisonResult {
  fundName: string;
  category: string;
  additions: { name: string; sector: string; pct: number }[];
  removals: { name: string; sector: string; pct: number }[];
  increased: { name: string; sector: string; oldPct: number; newPct: number }[];
  decreased: { name: string; sector: string; oldPct: number; newPct: number }[];
}

export async function getAMCHoldingsComparison(
  amcSlug: string,
  monthLabel: string
): Promise<FundComparisonResult[]> {
  const changes = await getHoldingsChangesByAMCMonth(amcSlug, monthLabel);
  const byFund = new Map<string, FundComparisonResult>();

  for (const row of changes) {
    if (!byFund.has(row.fundName)) {
      byFund.set(row.fundName, {
        fundName: row.fundName,
        category: 'Others',
        additions: [],
        removals: [],
        increased: [],
        decreased: [],
      });
    }
    const entry = byFund.get(row.fundName)!;
    const sector = '';
    if (row.changeType === 'fresh_entry') {
      entry.additions.push({ name: row.stockName, sector, pct: row.newPct ?? 0 });
    } else if (row.changeType === 'complete_exit') {
      entry.removals.push({ name: row.stockName, sector, pct: row.prevPct ?? 0 });
    } else if (row.changeType === 'increased') {
      entry.increased.push({
        name: row.stockName,
        sector,
        oldPct: row.prevPct ?? 0,
        newPct: row.newPct ?? 0,
      });
    } else if (row.changeType === 'decreased') {
      entry.decreased.push({
        name: row.stockName,
        sector,
        oldPct: row.prevPct ?? 0,
        newPct: row.newPct ?? 0,
      });
    }
  }

  return Array.from(byFund.values()).filter(
    (f) => f.additions.length + f.removals.length + f.increased.length + f.decreased.length > 0
  );
}

export async function getFundOverlaps(fundSlug: string, limit = 10): Promise<Record<string, unknown>[]> {
  const disk = readFundOverlapsByFundFromDisk();
  if (disk?.bySlug) {
    const index = readFundOverlapIndexFromDisk();
    const { resolve } = index?.length
      ? buildFundOverlapPageSlugResolver(index)
      : { resolve: (s: string) => s };

    for (const slug of fundSlugCandidates(fundSlug)) {
      const rows = disk.bySlug[slug];
      if (rows?.length) {
        return rows.slice(0, limit).map((row) => {
          const rawSlug = String(row.slug);
          const fundName = row.name != null ? String(row.name) : undefined;
          const pageSlug = resolve(rawSlug, fundName);
          return { ...row, slug: pageSlug ?? rawSlug, overlapPageSlug: pageSlug } as Record<string, unknown>;
        });
      }
    }
    return [];
  }

  if (!import.meta.env.DEV) {
    return [];
  }

  const sql = requireDb();
  const rows = await sql`
    SELECT
      f2.name,
      f2.slug,
      fo.overlap_pct,
      fo.common_stocks,
      (
        SELECT COALESCE(array_agg(s.name ORDER BY s.name), ARRAY[]::text[])
        FROM fund_holdings fh_a
        JOIN fund_holdings fh_b
          ON fh_a.stock_id = fh_b.stock_id
          AND fh_a.month = fh_b.month
        JOIN stocks s ON s.id = fh_a.stock_id
        WHERE fh_a.fund_id = f1.id
          AND fh_b.fund_id = f2.id
          AND fh_a.month = fo.month
      ) AS common_stock_names
    FROM fund_overlaps fo
    JOIN funds f1 ON f1.id = fo.fund_a_id OR f1.id = fo.fund_b_id
    JOIN funds f2 ON (f2.id = fo.fund_a_id OR f2.id = fo.fund_b_id) AND f2.id != f1.id
    WHERE f1.slug = ${fundSlug}
      AND fo.month = (SELECT MAX(month) FROM fund_overlaps)
      AND EXISTS (
        SELECT 1 FROM fund_holdings fh
        WHERE fh.fund_id = f2.id AND fh.month = fo.month
      )
    ORDER BY fo.overlap_pct DESC
    LIMIT ${limit}
  `;
  return rows as Record<string, unknown>[];
}

export async function getFundsWithOverlaps(): Promise<{ slug: string; name: string }[]> {
  const disk = readFundOverlapIndexFromDisk();
  const byFund = readFundOverlapsByFundFromDisk();
  if (disk?.length && byFund?.bySlug) {
    return disk
      .filter((f) => fundSlugCandidates(f.slug).some((slug) => byFund.bySlug[slug]?.length))
      .map((f) => ({ slug: f.slug, name: f.name }));
  }

  if (!import.meta.env.DEV) {
    return [];
  }

  const sql = requireDb();
  const rows = await sql`
    SELECT DISTINCT f.slug, f.name
    FROM fund_overlaps fo
    JOIN funds f ON f.id IN (fo.fund_a_id, fo.fund_b_id)
    WHERE fo.month = (SELECT MAX(month) FROM fund_overlaps)
      AND EXISTS (
        SELECT 1 FROM fund_holdings fh
        WHERE fh.fund_id = f.id AND fh.month = fo.month
      )
    ORDER BY f.name
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
  }));
}

export interface HoldingsCompareHolding {
  name: string;
  isin: string;
  sector: string;
  pct: number;
  quantity?: number;
  value?: number;
}

export interface HoldingsCompareFund {
  name: string;
  amc: string;
  [month: string]: HoldingsCompareHolding[] | string;
}

export interface HoldingsCompareData {
  months: string[];
  amcs: Record<string, string[]>;
  holdings: Record<string, HoldingsCompareFund>;
}

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function sortMonthLabels(months: string[]): string[] {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split(' ');
    const [mb, yb] = b.split(' ');
    if (ya !== yb) return Number(ya) - Number(yb);
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
  });
}

/** Build holdings-compare payload for interactive UI (same shape as fund-holdings.json). */
let holdingsCompareCache: Promise<HoldingsCompareData> | null = null;

export async function getHoldingsCompareData(): Promise<HoldingsCompareData> {
  if (!holdingsCompareCache) {
    holdingsCompareCache = loadHoldingsCompareData();
  }
  return holdingsCompareCache;
}

async function loadHoldingsCompareData(): Promise<HoldingsCompareData> {
  const sql = requireDb();
  const rows = await sql`
    SELECT
      f.slug,
      f.name AS fund_name,
      a.name AS amc_name,
      TRIM(TO_CHAR(fh.month, 'FMMonth YYYY')) AS month_label,
      s.name AS stock_name,
      COALESCE(s.isin, '') AS isin,
      COALESCE(sec.name, '') AS sector,
      fh.quantity,
      fh.market_value,
      fh.pct_to_nav AS pct
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id AND f.is_active = true
    JOIN amcs a ON a.id = f.amc_id
    JOIN stocks s ON s.id = fh.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    ORDER BY fh.month, a.name, f.name
  `;

  const monthsSet = new Set<string>();
  const holdings: Record<string, HoldingsCompareFund> = {};
  const amcFunds = new Map<string, Set<string>>();

  for (const r of rows as Record<string, unknown>[]) {
    const slug = String(r.slug);
    const month = String(r.month_label).trim();
    const amc = String(r.amc_name);
    const fundName = String(r.fund_name);

    monthsSet.add(month);

    if (!holdings[slug]) {
      holdings[slug] = { name: fundName, amc };
      if (!amcFunds.has(amc)) amcFunds.set(amc, new Set());
      amcFunds.get(amc)!.add(fundName);
    }

    if (!holdings[slug][month]) holdings[slug][month] = [];
    (holdings[slug][month] as HoldingsCompareHolding[]).push({
      name: String(r.stock_name),
      isin: String(r.isin),
      sector: String(r.sector),
      quantity: r.quantity != null ? Number(r.quantity) : 0,
      value: r.market_value != null ? Number(r.market_value) : 0,
      pct: r.pct != null ? Number(r.pct) : 0,
    });
  }

  const amcs: Record<string, string[]> = {};
  for (const [amc, names] of amcFunds) {
    amcs[amc] = [...names].sort();
  }

  return {
    months: sortMonthLabels([...monthsSet]),
    amcs,
    holdings,
  };
}
