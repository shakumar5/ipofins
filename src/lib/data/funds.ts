/**
 * Mutual fund data access — reads from Neon at Astro build time.
 */

import { requireDb } from '../db';
import {
  holdingsStatsFromIndex,
  readHoldingsCompareIndexFromDisk,
} from '../holdings-compare-server';
import { LISTABLE_EQUITY_CATEGORIES } from '../holdings-utils';
import { getFundSlugsWithHoldings } from './holdings';

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
  expenseRatio: number | null;
  expenseRatioRegular: number | null;
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
    expenseRatio: row.expense_ratio != null ? Number(row.expense_ratio) : null,
    expenseRatioRegular:
      row.expense_ratio_regular != null ? Number(row.expense_ratio_regular) : null,
  };
}

/** Active equity Direct Growth funds for UI lists (AMFI scheme_code, one row per scheme). */
let allFundsCache: Promise<FundRecord[]> | null = null;

export async function getAllFunds(): Promise<FundRecord[]> {
  if (!allFundsCache) {
    allFundsCache = loadAllFunds();
  }
  return allFundsCache;
}

async function loadAllFunds(): Promise<FundRecord[]> {
  const sql = requireDb();
  const rows = await sql`
    SELECT
      f.name, f.slug, f.category, f.scheme_code, f.risk_level, f.rating, f.aum, f.expense_ratio,
      fn.nav,
      COALESCE(fr.returns_1y, fr_base.returns_1y) AS returns_1y,
      COALESCE(fr.returns_3y, fr_base.returns_3y) AS returns_3y,
      COALESCE(fr.returns_5y, fr_base.returns_5y) AS returns_5y,
      COALESCE(fr.last_computed, fr_base.last_computed) AS last_computed,
      ter_regular.expense_ratio AS expense_ratio_regular
    FROM funds f
    LEFT JOIN LATERAL (
      SELECT nav FROM fund_navs WHERE fund_id = f.id ORDER BY date DESC LIMIT 1
    ) fn ON true
    LEFT JOIN fund_returns fr ON fr.fund_id = f.id
    LEFT JOIN LATERAL (
      SELECT fr2.returns_1y, fr2.returns_3y, fr2.returns_5y, fr2.last_computed
      FROM funds f2
      INNER JOIN fund_returns fr2 ON fr2.fund_id = f2.id
      WHERE f2.slug = regexp_replace(f.slug, '-direct-plan$', '')
        AND f2.id <> f.id
        AND (
          fr2.returns_1y IS NOT NULL
          OR fr2.returns_3y IS NOT NULL
          OR fr2.returns_5y IS NOT NULL
        )
      LIMIT 1
    ) fr_base ON true
    LEFT JOIN LATERAL (
      SELECT f2.expense_ratio
      FROM funds f2
      WHERE f2.slug = regexp_replace(f.slug, '-direct-plan$', '')
        AND f2.id <> f.id
        AND f2.is_active = true
      LIMIT 1
    ) ter_regular ON true
    WHERE f.is_active = true
      AND f.scheme_code IS NOT NULL
      AND TRIM(f.scheme_code) <> ''
      AND f.slug LIKE '%-direct-plan'
      AND f.category = ANY(${LISTABLE_EQUITY_CATEGORIES})
      AND f.name NOT ILIKE '%IDCW%'
      AND f.name NOT ILIKE '%dividend payout%'
      AND f.name NOT ILIKE '%dividend plan%'
      AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
    ORDER BY f.category, f.name
  `;
  return (rows as FundRow[]).map(mapFundRow);
}

/** Funds with holdings — builds detail pages for listable Direct Plan funds. */
export async function getFundsWithHoldings(): Promise<FundRecord[]> {
  const sql = requireDb();
  const slugs = await getFundSlugsWithHoldings();
  if (slugs.size === 0) return [];

  const rows = await sql`
    SELECT
      f.name, f.slug, f.category, f.scheme_code, f.risk_level, f.rating, f.aum, f.expense_ratio,
      fn.nav,
      COALESCE(fr.returns_1y, fr_base.returns_1y) AS returns_1y,
      COALESCE(fr.returns_3y, fr_base.returns_3y) AS returns_3y,
      COALESCE(fr.returns_5y, fr_base.returns_5y) AS returns_5y,
      COALESCE(fr.last_computed, fr_base.last_computed) AS last_computed,
      ter_regular.expense_ratio AS expense_ratio_regular
    FROM funds f
    LEFT JOIN LATERAL (
      SELECT nav FROM fund_navs WHERE fund_id = f.id ORDER BY date DESC LIMIT 1
    ) fn ON true
    LEFT JOIN fund_returns fr ON fr.fund_id = f.id
    LEFT JOIN LATERAL (
      SELECT fr2.returns_1y, fr2.returns_3y, fr2.returns_5y, fr2.last_computed
      FROM funds f2
      INNER JOIN fund_returns fr2 ON fr2.fund_id = f2.id
      WHERE f2.slug = regexp_replace(f.slug, '-direct-plan$', '')
        AND f2.id <> f.id
        AND (
          fr2.returns_1y IS NOT NULL
          OR fr2.returns_3y IS NOT NULL
          OR fr2.returns_5y IS NOT NULL
        )
      LIMIT 1
    ) fr_base ON true
    LEFT JOIN LATERAL (
      SELECT f2.expense_ratio
      FROM funds f2
      WHERE f2.slug = regexp_replace(f.slug, '-direct-plan$', '')
        AND f2.id <> f.id
        AND f2.is_active = true
      LIMIT 1
    ) ter_regular ON true
    WHERE f.is_active = true
      AND f.slug = ANY(${[...slugs]})
    ORDER BY f.category, f.name
  `;
  return (rows as FundRow[]).map(mapFundRow);
}

/** Lightweight query for "similar funds" on fund detail pages (avoids loading all funds per page). */
export async function getRelatedFunds(
  category: string,
  excludeSlug: string,
  limit = 5
): Promise<FundRecord[]> {
  const sql = requireDb();
  const rows = await sql`
    SELECT
      f.name, f.slug, f.category, f.scheme_code, f.risk_level, f.rating, f.aum, f.expense_ratio,
      fn.nav,
      COALESCE(fr.returns_1y, fr_base.returns_1y) AS returns_1y,
      COALESCE(fr.returns_3y, fr_base.returns_3y) AS returns_3y,
      COALESCE(fr.returns_5y, fr_base.returns_5y) AS returns_5y,
      COALESCE(fr.last_computed, fr_base.last_computed) AS last_computed,
      ter_regular.expense_ratio AS expense_ratio_regular
    FROM funds f
    INNER JOIN fund_holdings fh ON fh.fund_id = f.id
    LEFT JOIN LATERAL (
      SELECT nav FROM fund_navs WHERE fund_id = f.id ORDER BY date DESC LIMIT 1
    ) fn ON true
    LEFT JOIN fund_returns fr ON fr.fund_id = f.id
    LEFT JOIN LATERAL (
      SELECT fr2.returns_1y, fr2.returns_3y, fr2.returns_5y, fr2.last_computed
      FROM funds f2
      INNER JOIN fund_returns fr2 ON fr2.fund_id = f2.id
      WHERE f2.slug = regexp_replace(f.slug, '-direct-plan$', '')
        AND f2.id <> f.id
        AND (
          fr2.returns_1y IS NOT NULL
          OR fr2.returns_3y IS NOT NULL
          OR fr2.returns_5y IS NOT NULL
        )
      LIMIT 1
    ) fr_base ON true
    LEFT JOIN LATERAL (
      SELECT f2.expense_ratio
      FROM funds f2
      WHERE f2.slug = regexp_replace(f.slug, '-direct-plan$', '')
        AND f2.id <> f.id
        AND f2.is_active = true
      LIMIT 1
    ) ter_regular ON true
    WHERE f.is_active = true
      AND f.category = ${category}
      AND f.slug != ${excludeSlug}
    GROUP BY f.id, f.name, f.slug, f.category, f.scheme_code, f.risk_level, f.rating, f.aum, f.expense_ratio,
      fn.nav,
      fr.returns_1y, fr.returns_3y, fr.returns_5y, fr.last_computed,
      fr_base.returns_1y, fr_base.returns_3y, fr_base.returns_5y, fr_base.last_computed,
      ter_regular.expense_ratio
    ORDER BY COALESCE(fr.returns_3y, fr_base.returns_3y) DESC NULLS LAST
    LIMIT ${limit}
  `;
  return (rows as FundRow[]).map(mapFundRow);
}

export async function getFundBySlug(slug: string): Promise<FundRecord | null> {
  const sql = requireDb();
  const rows = await sql`
    SELECT
      f.name, f.slug, f.category, f.scheme_code, f.risk_level, f.rating, f.aum, f.expense_ratio,
      fn.nav,
      COALESCE(fr.returns_1y, fr_base.returns_1y) AS returns_1y,
      COALESCE(fr.returns_3y, fr_base.returns_3y) AS returns_3y,
      COALESCE(fr.returns_5y, fr_base.returns_5y) AS returns_5y,
      COALESCE(fr.last_computed, fr_base.last_computed) AS last_computed,
      ter_regular.expense_ratio AS expense_ratio_regular
    FROM funds f
    LEFT JOIN LATERAL (
      SELECT nav FROM fund_navs WHERE fund_id = f.id ORDER BY date DESC LIMIT 1
    ) fn ON true
    LEFT JOIN fund_returns fr ON fr.fund_id = f.id
    LEFT JOIN LATERAL (
      SELECT fr2.returns_1y, fr2.returns_3y, fr2.returns_5y, fr2.last_computed
      FROM funds f2
      INNER JOIN fund_returns fr2 ON fr2.fund_id = f2.id
      WHERE f2.slug = regexp_replace(f.slug, '-direct-plan$', '')
        AND f2.id <> f.id
        AND (
          fr2.returns_1y IS NOT NULL
          OR fr2.returns_3y IS NOT NULL
          OR fr2.returns_5y IS NOT NULL
        )
      LIMIT 1
    ) fr_base ON true
    LEFT JOIN LATERAL (
      SELECT f2.expense_ratio
      FROM funds f2
      WHERE f2.slug = regexp_replace(f.slug, '-direct-plan$', '')
        AND f2.id <> f.id
        AND f2.is_active = true
      LIMIT 1
    ) ter_regular ON true
    WHERE f.is_active = true AND f.slug = ${slug}
    LIMIT 1
  `;
  const row = (rows as FundRow[])[0];
  return row ? mapFundRow(row) : null;
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
  const index = readHoldingsCompareIndexFromDisk();
  if (index?.amcs?.length) return holdingsStatsFromIndex(index);

  try {
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
  } catch {
    throw new Error('Holdings stats unavailable — run npm run export:client-data');
  }
}
