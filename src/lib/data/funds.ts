/**
 * Mutual fund data access — reads from Neon at Astro build time.
 */

import { requireDb } from '../db';

export interface FundRecord {
  name: string;
  slug: string;
  category: string;
  nav: number | null;
  returns1y: number | null;
  returns3y: number | null;
  returns5y: number | null;
  aum: string | null;
  riskLevel: string;
  rating: number | null;
  schemeCode: string;
  lastUpdated: string | null;
}

type FundRow = Record<string, unknown>;

function mapFundRow(row: FundRow): FundRecord {
  return {
    name: String(row.name),
    slug: String(row.slug),
    category: String(row.category),
    nav: row.nav != null && Number(row.nav) > 0 ? Number(row.nav) : null,
    returns1y: row.returns_1y != null ? Number(row.returns_1y) : null,
    returns3y: row.returns_3y != null ? Number(row.returns_3y) : null,
    returns5y: row.returns_5y != null ? Number(row.returns_5y) : null,
    aum: row.aum != null ? `₹${Number(row.aum).toLocaleString('en-IN')} Cr` : null,
    riskLevel: String(row.risk_level || 'moderate'),
    rating: row.rating != null ? Number(row.rating) : null,
    schemeCode: String(row.scheme_code || ''),
    lastUpdated: row.last_computed ? String(row.last_computed) : null,
  };
}

export async function getAllFunds(): Promise<FundRecord[]> {
  const sql = requireDb();
  const rows = await sql`
    SELECT
      f.name, f.slug, f.category, f.scheme_code, f.risk_level, f.rating, f.aum,
      fn.nav,
      fr.returns_1y, fr.returns_3y, fr.returns_5y, fr.last_computed
    FROM funds f
    LEFT JOIN LATERAL (
      SELECT nav FROM fund_navs WHERE fund_id = f.id ORDER BY date DESC LIMIT 1
    ) fn ON true
    LEFT JOIN fund_returns fr ON fr.fund_id = f.id
    WHERE f.is_active = true
    ORDER BY f.category, f.name
  `;
  return (rows as FundRow[]).map(mapFundRow);
}

export async function getFundBySlug(slug: string): Promise<FundRecord | null> {
  const funds = await getAllFunds();
  return funds.find((f) => f.slug === slug) ?? null;
}

export async function getFundsByCategory(category: string): Promise<FundRecord[]> {
  const funds = await getAllFunds();
  const normalized = category.toLowerCase().replace(/-/g, ' ');
  return funds.filter((f) => f.category.toLowerCase().includes(normalized));
}

export async function getFundCategories(): Promise<string[]> {
  const funds = await getAllFunds();
  return [...new Set(funds.map((f) => f.category))].sort();
}

export async function getHoldingsStats(): Promise<{
  amcCount: number;
  fundsCovered: number;
  latestMonth: string;
}> {
  const sql = requireDb();
  const rows = (await sql`
    SELECT
      COUNT(DISTINCT f.amc_id)::int AS amc_count,
      COUNT(DISTINCT fh.fund_id)::int AS funds_covered,
      TO_CHAR(MAX(fh.month), 'FMMonth YYYY') AS latest_month
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id
    WHERE fh.month = (SELECT MAX(month) FROM fund_holdings)
  `) as Record<string, unknown>[];
  const row = rows[0];
  return {
    amcCount: Number(row?.amc_count ?? 0),
    fundsCovered: Number(row?.funds_covered ?? 0),
    latestMonth: String(row?.latest_month ?? '').trim(),
  };
}
