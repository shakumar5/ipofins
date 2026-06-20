/**
 * Curated mutual-fund universe: Direct Growth, selected categories, holdings-gated (union months).
 */
import { AMFI_SLUG_ALIASES, slugVariants } from './fund-match.mjs';
import { mfSlugToDetailSlug, baseSlug } from './mf-hub-holdings-meta.mjs';
import { inferCategoryFromFundName } from './amc-resolve.mjs';
import { unpackMonthHoldings } from './holdings-month.mjs';
import {
  collapseFundSlugVariants,
  disclosureMatchKey,
  isGarbageDisclosureFund,
  normalizeDisclosureFundName,
} from './holdings-name-utils.mjs';

export const CURATED_FUND_CATEGORIES = [
  'Large Cap',
  'Large & Mid Cap',
  'Mid Cap',
  'Small Cap',
  'Flexi Cap',
  'Multi Cap',
  'Contra',
  'Value',
  'Focused',
  'Sectoral/Thematic',
  'Sectoral',
];

const REVERSE_ALIASES = (() => {
  const reverse = {};
  for (const [amfiSlug, holdingsSlug] of Object.entries(AMFI_SLUG_ALIASES)) {
    reverse[holdingsSlug] = amfiSlug;
    for (const variant of slugVariants(baseSlug(holdingsSlug))) {
      reverse[variant] = amfiSlug;
    }
  }
  return reverse;
})();

export function isCuratedCategory(category) {
  return CURATED_FUND_CATEGORIES.includes(String(category || '').trim());
}

/** Skip Regular / IDCW / Dividend plan rows from disclosure files. */
export function isExcludedPlanName(name, slug = '') {
  const n = String(name || '').toUpperCase();
  const s = String(slug || '').toLowerCase();
  if (s.includes('regular-plan')) return true;
  if (/REGULAR\s*PLAN|\bREGULAR\s*-\s*|\bREGULAR\b/.test(n)) return true;
  if (/IDCW|DIVIDEND\s*(PLAN|PAYOUT|OPTION)|INCOME\s*DISTRIBUTION|PAYOUT\s*OPTION/.test(n)) return true;
  if (/CLOSE\s*[- ]?ENDED|CLOSED\s*[- ]?ENDED/i.test(n)) return true;
  return false;
}

export function isDirectGrowthDisclosure(name, slug = '') {
  if (isExcludedPlanName(name, slug)) return false;
  const n = String(name || '').toUpperCase();
  const s = String(slug || '').toLowerCase();
  if (s.includes('direct-plan') || s.includes('growth-option-direct-plan')) return true;
  if (/DIRECT\s*PLAN|DIRECT\s*-|\bDIRECT\b/.test(n)) {
    return /GROWTH|GROWTH\s*OPTION/.test(n) || !/IDCW|DIVIDEND/.test(n);
  }
  // Parser-shortened scheme names (no plan suffix) — allow if not explicitly Regular/IDCW
  return true;
}

export function indexMutualFunds(mutualFunds) {
  const bySlug = new Map();
  const byScheme = new Map();
  const byNormName = new Map();
  for (const fund of mutualFunds || []) {
    bySlug.set(fund.slug, fund);
    const sc = String(fund.schemeCode || '').trim();
    if (sc) byScheme.set(sc, fund);
    const normKey = disclosureMatchKey(fund.name);
    if (normKey && !byNormName.has(normKey)) byNormName.set(normKey, fund);
  }
  return { bySlug, byScheme, byNormName };
}

function lookupBySlugCandidates(bySlug, slug) {
  if (bySlug.has(slug)) return bySlug.get(slug);
  for (const variant of slugVariants(baseSlug(slug))) {
    if (bySlug.has(variant)) return bySlug.get(variant);
  }
  for (const collapsed of collapseFundSlugVariants(baseSlug(slug))) {
    if (bySlug.has(collapsed)) return bySlug.get(collapsed);
    for (const variant of slugVariants(collapsed)) {
      if (bySlug.has(variant)) return bySlug.get(variant);
    }
  }
  return null;
}

function resolveByAliasSlug(parserSlug, bySlug) {
  const aliasSlug = REVERSE_ALIASES[parserSlug] || REVERSE_ALIASES[baseSlug(parserSlug)];
  if (!aliasSlug) return null;
  return lookupBySlugCandidates(bySlug, aliasSlug);
}

function resolveByTruncatedPrefix(parserSlug, bySlug) {
  if (parserSlug.length < 40) return null;
  let best = null;
  for (const [mfSlug, mf] of bySlug) {
    const mfBase = baseSlug(mfSlug);
    if (mfBase.length < 15) continue;
    if (parserSlug.startsWith(mfSlug) || parserSlug.startsWith(`${mfBase}-`)) {
      if (!best || mfBase.length > best.len) best = { mf, len: mfBase.length };
    }
  }
  return best?.mf ?? null;
}

export function resolveMfFundForParserSlug(parserSlug, fundData, mfIndex) {
  const { bySlug, byScheme, byNormName } = mfIndex;

  const fromAlias = resolveByAliasSlug(parserSlug, bySlug);
  if (fromAlias) return fromAlias;

  const direct = lookupBySlugCandidates(bySlug, parserSlug);
  if (direct) return direct;

  const schemeCode = String(fundData?.scheme_code || fundData?.schemeCode || '').trim();
  if (schemeCode && byScheme.has(schemeCode)) return byScheme.get(schemeCode);

  const fromPrefix = resolveByTruncatedPrefix(parserSlug, bySlug);
  if (fromPrefix) return fromPrefix;

  const normKey = disclosureMatchKey(fundData?.name || parserSlug);
  if (normKey && byNormName?.has(normKey)) return byNormName.get(normKey);

  return null;
}

function hasHoldingsInAnyMonth(fundData, months) {
  return months.some((month) => {
    const { totalStocks, stocks } = unpackMonthHoldings(fundData[month]);
    return totalStocks >= 3 || stocks.length >= 3;
  });
}

/**
 * Build curated fund list (union across months).
 * Each entry maps holdings parser slug → DB direct-plan slug + mutual-funds.json metadata.
 */
export function buildCuratedFundList(holdingsData, mutualFunds) {
  const mfIndex = indexMutualFunds(mutualFunds);
  const months = holdingsData?.months || [];
  const byDbSlug = new Map();

  for (const [parserSlug, fundData] of Object.entries(holdingsData?.holdings || {})) {
    if (isGarbageDisclosureFund(fundData.name, parserSlug)) continue;
    if (!isDirectGrowthDisclosure(fundData.name, parserSlug)) continue;
    if (!hasHoldingsInAnyMonth(fundData, months)) continue;

    const mf = resolveMfFundForParserSlug(parserSlug, fundData, mfIndex);
    const category = mf?.category || inferCategoryFromFundName(fundData.name);
    if (!isCuratedCategory(category)) continue;

    const dbSlug = mf ? mfSlugToDetailSlug(mf.slug, parserSlug) : mfSlugToDetailSlug(parserSlug, parserSlug);
    const existing = byDbSlug.get(dbSlug);
    const entry = {
      parserSlug,
      dbSlug,
      mfSlug: mf?.slug || null,
      schemeCode: mf?.schemeCode || fundData.scheme_code || null,
      name: mf?.name || normalizeDisclosureFundName(fundData.name),
      category,
      amc: fundData.amc,
      riskLevel: mf?.riskLevel || 'moderate',
      rating: mf?.rating ?? null,
      aum: mf?.aum ?? null,
      nav: mf?.nav ?? null,
      returns1y: mf?.returns1y ?? null,
      returns3y: mf?.returns3y ?? null,
      returns5y: mf?.returns5y ?? null,
    };

    if (!existing) {
      byDbSlug.set(dbSlug, entry);
      continue;
    }
    // Prefer entry with mutual-funds.json match
    if (!existing.mfSlug && entry.mfSlug) byDbSlug.set(dbSlug, entry);
  }

  return [...byDbSlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildCuratedParserSlugSet(holdingsData, mutualFunds) {
  return new Set(buildCuratedFundList(holdingsData, mutualFunds).map((f) => f.parserSlug));
}

export function filterMutualFundsToCurated(mutualFunds, holdingsData) {
  const curatedMfSlugs = new Set(
    buildCuratedFundList(holdingsData, mutualFunds)
      .map((f) => f.mfSlug)
      .filter(Boolean),
  );
  return mutualFunds.filter((f) => curatedMfSlugs.has(f.slug));
}
