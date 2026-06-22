/**
 * Export fund holdings index / meta / URL aliases for static fund detail pages.
 * Slugs must match funds.slug used in getStaticPaths — not parser/holdings keys.
 */
import { AMFI_SLUG_ALIASES, slugVariants } from './fund-match.mjs';
import { LISTABLE_EQUITY_CATEGORIES } from './mf-hub-holdings-meta.mjs';

function baseSlug(slug) {
  return String(slug)
    .replace(/-fund-direct$/, '-fund')
    .replace(/(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$/, '')
    .replace(/-growth-option$/, '');
}

function mapFundRow(row) {
  const aum = row.aum != null ? Number(row.aum) : null;
  return {
    name: String(row.name),
    slug: String(row.slug),
    category: String(row.category),
    nav: row.nav != null && Number(row.nav) > 0 ? Number(row.nav) : null,
    returns1y: row.returns_1y != null ? Number(row.returns_1y) : null,
    returns3y: row.returns_3y != null ? Number(row.returns_3y) : null,
    returns5y: row.returns_5y != null ? Number(row.returns_5y) : null,
    aum: aum != null ? `₹${aum.toLocaleString('en-IN')} Cr` : null,
    riskLevel: String(row.risk_level || 'moderate'),
    rating: row.rating != null ? Number(row.rating) : null,
    schemeCode: String(row.scheme_code || ''),
    lastUpdated: row.last_computed ? String(row.last_computed) : null,
    expenseRatio: row.expense_ratio != null ? Number(row.expense_ratio) : null,
    expenseRatioRegular:
      row.expense_ratio_regular != null ? Number(row.expense_ratio_regular) : null,
  };
}

/** @param {import('@neondatabase/serverless').NeonQueryFunction} sql */
export async function loadFundHoldingsIndexFromDb(sql, overlapSlugs = []) {
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
        f.slug AS holder_slug,
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
      GROUP BY f.id, f.slug, f.amc_id, f.scheme_code, holder_base
    ),
    holder_slugs AS (
      SELECT DISTINCT holder_slug AS slug
      FROM holders
      WHERE COALESCE(portfolio_total, stored_stock_count) > 0
    )
    SELECT slug FROM holder_slugs
  `;

  const slugs = new Set(rows.map((r) => String(r.slug)));
  for (const s of overlapSlugs) {
    if (s) slugs.add(String(s));
  }
  if (!slugs.size) return [];

  const fundRows = await sql`
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

  return fundRows.map(mapFundRow);
}

export function serializeHoldingsMetaForDisk(enrichedMeta) {
  const stockCounts = enrichedMeta.stockCounts || {};
  const slugs = [...new Set(Object.keys(stockCounts).filter((k) => stockCounts[k] > 0))];
  return { slugs, stockCounts };
}

/** Hub fallback when DB index export is unavailable. */
export function buildFundHoldingsIndexFromHub(hubAll, mfFunds = []) {
  const bySlug = new Map(mfFunds.map((f) => [f.slug, f]));
  const seen = new Set();
  const out = [];

  for (const row of hubAll) {
    if (!row.hasHoldings || !row.detailSlug || seen.has(row.detailSlug)) continue;
    seen.add(row.detailSlug);
    const src = bySlug.get(row.slug) || {};
    const aumRaw = row.aum ?? src.aum;
    const aum =
      typeof aumRaw === 'number'
        ? `₹${aumRaw.toLocaleString('en-IN')} Cr`
        : typeof aumRaw === 'string' && aumRaw.trim()
          ? aumRaw
          : null;
    out.push({
      name: row.name,
      slug: row.detailSlug,
      category: row.category,
      nav: row.nav ?? src.nav ?? null,
      returns1y: row.returns1y ?? src.returns1y ?? null,
      returns3y: row.returns3y ?? src.returns3y ?? null,
      returns5y: row.returns5y ?? src.returns5y ?? null,
      aum,
      riskLevel: row.riskLevel || src.riskLevel || 'moderate',
      rating: row.rating ?? src.rating ?? null,
      schemeCode: String(src.schemeCode || src.scheme_code || ''),
      lastUpdated: src.lastUpdated ?? null,
      expenseRatio: src.expenseRatio ?? null,
      expenseRatioRegular: src.expenseRatioRegular ?? null,
    });
  }

  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** AMFI / listable slugs → canonical holdings page slug (for 301 redirect pages). */
export function buildFundHoldingsAliases(hubAll, pageSlugs = []) {
  const slugSet = new Set(pageSlugs);
  const aliases = {};

  const add = (from, to) => {
    if (!from || !to || from === to || !slugSet.has(to)) return;
    if (!aliases[from]) aliases[from] = to;
  };

  for (const row of hubAll) {
    if (!row.hasHoldings || !row.detailSlug) continue;
    add(row.slug, row.detailSlug);
  }

  for (const [amfi, detail] of Object.entries(AMFI_SLUG_ALIASES)) {
    add(amfi, detail);
    for (const variant of slugVariants(amfi)) {
      add(variant, detail);
    }
  }

  for (const pageSlug of pageSlugs) {
    const stripped = baseSlug(pageSlug);
    add(stripped, pageSlug);
    for (const variant of slugVariants(stripped)) {
      add(variant, pageSlug);
    }
  }

  return aliases;
}
