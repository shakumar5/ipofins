/**
 * Holdings & smart-money data access — reads from Neon at Astro build time.
 */

import { requireDb } from '../db';

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
}

export async function getAMCList(): Promise<AMCInfo[]> {
  const sql = requireDb();
  const rows = await sql`
    SELECT a.name, a.slug, COUNT(f.id)::int AS fund_count
    FROM amcs a
    LEFT JOIN funds f ON f.amc_id = a.id AND f.is_active = true
    GROUP BY a.id, a.name, a.slug
    HAVING COUNT(f.id) > 0
    ORDER BY a.name
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    name: String(r.name),
    slug: String(r.slug),
    fundCount: Number(r.fund_count),
  }));
}

export async function getAvailableMonths(): Promise<string[]> {
  const sql = requireDb();
  const rows = await sql`
    SELECT DISTINCT TO_CHAR(month, 'FMMonth YYYY') AS month_label, month
    FROM holdings_changes
    ORDER BY month DESC
    LIMIT 12
  `;
  return (rows as Record<string, unknown>[]).map((r) => String(r.month_label).trim());
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
      AND TO_CHAR(hc.month, 'FMMonth YYYY') = ${monthLabel}
      AND hc.change_type NOT IN ('unchanged')
    ORDER BY ABS(COALESCE(hc.new_pct, 0) - COALESCE(hc.prev_pct, 0)) DESC
    LIMIT 200
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
           sig.increased_count, sig.total_funds_holding, sig.month
    FROM stock_signals sig
    JOIN stocks s ON s.id = sig.stock_id
    WHERE sig.category = ${category}
      AND sig.month = (SELECT MAX(month) FROM stock_signals WHERE category = ${category})
    ORDER BY sig.conviction_score DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows as Record<string, unknown>[];
}

export async function getFundSlugsWithHoldings(): Promise<Set<string>> {
  const sql = requireDb();
  const rows = await sql`
    SELECT DISTINCT f.slug
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id
    WHERE fh.month = (SELECT MAX(month) FROM fund_holdings)
  `;
  return new Set((rows as Record<string, unknown>[]).map((r) => String(r.slug)));
}

export async function getFundHoldings(fundSlug: string): Promise<Record<string, unknown>[]> {
  const sql = requireDb();
  const rows = await sql`
    SELECT s.name, fh.pct_to_nav AS pct, sec.name AS sector, fh.month
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id
    JOIN stocks s ON s.id = fh.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE f.slug = ${fundSlug}
      AND fh.month = (SELECT MAX(month) FROM fund_holdings WHERE fund_id = f.id)
    ORDER BY fh.pct_to_nav DESC NULLS LAST
    LIMIT 50
  `;
  return rows as Record<string, unknown>[];
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
  const sql = requireDb();
  const rows = await sql`
    SELECT f2.name, f2.slug, fo.overlap_pct, fo.common_stocks
    FROM fund_overlaps fo
    JOIN funds f1 ON f1.id = fo.fund_a_id OR f1.id = fo.fund_b_id
    JOIN funds f2 ON (f2.id = fo.fund_a_id OR f2.id = fo.fund_b_id) AND f2.id != f1.id
    WHERE f1.slug = ${fundSlug}
      AND fo.month = (SELECT MAX(month) FROM fund_overlaps)
    ORDER BY fo.overlap_pct DESC
    LIMIT ${limit}
  `;
  return rows as Record<string, unknown>[];
}

export async function getFundsWithOverlaps(): Promise<{ slug: string; name: string }[]> {
  const sql = requireDb();
  const rows = await sql`
    SELECT DISTINCT f.slug, f.name
    FROM fund_overlaps fo
    JOIN funds f ON f.id IN (fo.fund_a_id, fo.fund_b_id)
    WHERE fo.month = (SELECT MAX(month) FROM fund_overlaps)
    ORDER BY f.name
    LIMIT 300
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
  }));
}
