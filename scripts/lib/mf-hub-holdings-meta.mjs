/**
 * Resolve mutual-funds.json table rows → DB direct-plan holdings slugs + stock counts.
 * Mirrors src/lib/data/holdings.ts queryFundHoldingsMeta matching rules.
 */
import { AMFI_SLUG_ALIASES, slugVariants } from './fund-match.mjs';
import { unpackMonthHoldings, latestMonthForFund } from './holdings-month.mjs';

function registerBaseSlugAliases(map, base, detailSlug) {
  for (const variant of slugVariants(base)) {
    map[variant] = detailSlug;
  }
}

function buildReverseAliasIndex() {
  const reverse = {};
  for (const [amfiSlug, holdingsSlug] of Object.entries(AMFI_SLUG_ALIASES)) {
    reverse[holdingsSlug] = amfiSlug;
    for (const variant of slugVariants(baseSlug(holdingsSlug))) {
      reverse[variant] = amfiSlug;
    }
  }
  return reverse;
}

const REVERSE_ALIASES = buildReverseAliasIndex();

export const LISTABLE_EQUITY_CATEGORIES = [
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
];

export function mfSlugToDetailSlug(mfSlug, parserSlug = '') {
  for (const [detailSlug, amfiSlug] of Object.entries(AMFI_SLUG_ALIASES)) {
    if (amfiSlug === mfSlug) return detailSlug;
  }
  if (AMFI_SLUG_ALIASES[mfSlug]) return AMFI_SLUG_ALIASES[mfSlug];
  if (parserSlug.includes('-direct-plan') || parserSlug.includes('-growth-option')) return parserSlug;
  return `${mfSlug}-direct-plan`;
}

export function baseSlug(slug) {
  return String(slug)
    .replace(/-fund-direct$/, '-fund')
    .replace(/(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$/, '')
    .replace(/-growth-option$/, '');
}

function baseSlugSet(slug) {
  return new Set(slugVariants(baseSlug(slug)));
}

function basesMatch(a, b) {
  const aSet = baseSlugSet(a);
  for (const v of baseSlugSet(b)) {
    if (aSet.has(v)) return true;
  }
  return false;
}

/** Add portfolio holder slugs so detail links match built static pages. */
export function enrichHoldingsMetaWithOverlap(holdingsMeta, overlapSlugs = []) {
  const stockCounts = { ...holdingsMeta.stockCounts };
  const overlapSlugSet = new Set(overlapSlugs);
  for (const slug of overlapSlugs) {
    const current = stockCounts[slug] ?? 0;
    if (current > 1) continue;

    let mapped = false;
    for (const variant of slugVariants(slug)) {
      const alias = AMFI_SLUG_ALIASES[variant];
      if (alias && stockCounts[alias] > current) {
        stockCounts[slug] = stockCounts[alias];
        mapped = true;
        break;
      }
    }
    if (mapped) continue;

    if (current > 0) continue;

    for (const [k, count] of Object.entries(holdingsMeta.stockCounts)) {
      if (basesMatch(k, slug)) {
        stockCounts[slug] = count;
        break;
      }
    }
  }
  return { ...holdingsMeta, stockCounts, overlapSlugSet };
}

function detailSlugCandidates(mfSlug) {
  const out = [];
  const add = (s) => {
    if (s && !out.includes(s)) out.push(s);
  };
  add(AMFI_SLUG_ALIASES[mfSlug]);
  for (const variant of slugVariants(mfSlug)) {
    add(AMFI_SLUG_ALIASES[variant]);
    add(`${variant}-growth-option-direct-plan`);
    add(`${variant}-direct-plan`);
    add(variant);
  }
  return out;
}

/** DB-backed holdings meta (listable direct-plan funds with portfolio stock counts). */
export async function loadHoldingsMetaFromDb(sql) {
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
        AND f.slug LIKE '%-direct-plan'
        AND f.category = ANY(${LISTABLE_EQUITY_CATEGORIES})
        AND f.name NOT ILIKE '%IDCW%'
        AND f.name NOT ILIKE '%dividend payout%'
        AND f.name NOT ILIKE '%dividend plan%'
        AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
    )
    SELECT l.slug, TRIM(l.scheme_code) AS scheme_code, l.base_slug,
           COALESCE(h.portfolio_total, h.stored_stock_count) AS stock_count
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
        COALESCE(h.portfolio_total, h.stored_stock_count) DESC
      LIMIT 1
    ) h
    WHERE COALESCE(h.portfolio_total, h.stored_stock_count) > 0
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
      TRIM(f.scheme_code) AS scheme_code,
      regexp_replace(
        regexp_replace(f.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
        '-growth-option$', ''
      ) AS base_slug,
      COALESCE(MAX(ps.total_stocks), COUNT(DISTINCT fh.stock_id)::int) AS stock_count
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
    GROUP BY f.slug, f.scheme_code
    HAVING COALESCE(MAX(ps.total_stocks), COUNT(DISTINCT fh.stock_id)::int) > 0
  `;

  const stockCounts = {};
  const bySchemeCode = {};
  const byBaseSlug = {};

  for (const row of [...rows, ...directRows]) {
    const slug = String(row.slug);
    const count = Number(row.stock_count);
    if (!count) continue;
    stockCounts[slug] = Math.max(stockCounts[slug] || 0, count);
    const sc = String(row.scheme_code || '').trim();
    if (sc) bySchemeCode[sc] = slug;
    const b = String(row.base_slug || baseSlug(slug));
    byBaseSlug[b] = slug;
    for (const variant of slugVariants(b)) {
      if (!byBaseSlug[variant]) byBaseSlug[variant] = slug;
    }
  }

  return { stockCounts, bySchemeCode, byBaseSlug };
}

/** JSON fallback when DB export is unavailable. */
export function buildHoldingsMetaFromJson(holdings) {
  const stockCounts = {};
  const byBaseSlug = {};
  const months = holdings.months || [];
  if (!months.length) return { stockCounts, bySchemeCode: {}, byBaseSlug };

  for (const [parserSlug, fund] of Object.entries(holdings.holdings || {})) {
    const month = latestMonthForFund(fund, months);
    if (!month) continue;
    const { totalStocks } = unpackMonthHoldings(fund[month]);
    if (!totalStocks) continue;

    const alias = AMFI_SLUG_ALIASES[parserSlug];
    const mfSlug = REVERSE_ALIASES[parserSlug] || REVERSE_ALIASES[baseSlug(parserSlug)] || parserSlug;
    const detailSlug =
      alias && (alias.includes('-direct-plan') || alias.includes('-growth-option'))
        ? alias
        : mfSlugToDetailSlug(mfSlug, parserSlug);

    stockCounts[detailSlug] = Math.max(stockCounts[detailSlug] || 0, totalStocks);
    registerBaseSlugAliases(byBaseSlug, baseSlug(parserSlug), detailSlug);
    registerBaseSlugAliases(byBaseSlug, baseSlug(detailSlug), detailSlug);
    if (mfSlug !== parserSlug) {
      registerBaseSlugAliases(byBaseSlug, baseSlug(mfSlug), detailSlug);
    }
  }

  return { stockCounts, bySchemeCode: {}, byBaseSlug };
}

/** Prefer slugs that match built static fund pages (not parser/AMFI shortcuts). */
export function pickBestDetailSlug(candidates, { pageSlugSet, overlapSlugSet } = {}) {
  const matched = [...new Set(candidates.filter(Boolean))].filter(
    (slug) => typeof slug === 'string' && slug.length > 0,
  );
  if (!matched.length) return null;

  matched.sort((a, b) => {
    if (pageSlugSet?.size) {
      const ap = pageSlugSet.has(a) ? 0 : 1;
      const bp = pageSlugSet.has(b) ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    const ad = a.includes('-direct-plan') ? 0 : 1;
    const bd = b.includes('-direct-plan') ? 0 : 1;
    if (ad !== bd) return ad - bd;
    if (overlapSlugSet?.size) {
      const ao = overlapSlugSet.has(a) ? 0 : 1;
      const bo = overlapSlugSet.has(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
    }
    return b.length - a.length;
  });

  return matched[0];
}

export function resolveMfFundHoldings(mfFund, meta) {
  const { stockCounts, bySchemeCode, byBaseSlug, overlapSlugSet, pageSlugSet } = meta;

  const pack = (detailSlug) => {
    const count = stockCounts[detailSlug];
    if (!detailSlug || !count || count <= 0) return null;
    return { hasHoldings: true, stockCount: count, detailSlug };
  };

  const pickFromMatches = (slugs) => {
    const matched = slugs.filter((slug) => basesMatch(slug, mfFund.slug));
    const best = pickBestDetailSlug(matched, { pageSlugSet, overlapSlugSet });
    return best ? pack(best) : null;
  };

  const schemeCode = String(mfFund.schemeCode || mfFund.scheme_code || '').trim();

  // Named AMFI renames (e.g. axis-large-cap-fund → axis-bluechip-fund) before overlap shortcuts.
  for (const variant of slugVariants(mfFund.slug)) {
    const alias = AMFI_SLUG_ALIASES[variant];
    if (alias) {
      const hit = pack(alias);
      if (hit) return hit;
    }
  }

  if (schemeCode && bySchemeCode[schemeCode]) {
    const hit = pack(bySchemeCode[schemeCode]);
    if (hit) return hit;
  }

  if (overlapSlugSet?.size) {
    const overlapMatch = pickFromMatches(Object.keys(stockCounts));
    if (overlapMatch) return overlapMatch;
  }

  const variantMatch = pickFromMatches(Object.keys(stockCounts));
  if (variantMatch) return variantMatch;

  const b = baseSlug(mfFund.slug);
  for (const variant of slugVariants(b)) {
    if (byBaseSlug[variant]) {
      const hit = pack(byBaseSlug[variant]);
      if (hit) return hit;
    }
  }

  for (const candidate of detailSlugCandidates(mfFund.slug)) {
    const hit = pack(candidate);
    if (hit) return hit;
  }

  return { hasHoldings: false, stockCount: 0, detailSlug: null };
}
