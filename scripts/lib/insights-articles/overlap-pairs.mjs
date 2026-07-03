import { slugVariants } from '../fund-match.mjs';
import { baseSlug } from '../mf-hub-holdings-meta.mjs';

/** Strip AMFI scheme-code prefixes (e.g. ib31-) — prefix must include a digit so AMC slugs like groww- are kept. */
export function stripAmfiSchemePrefixFromSlug(slug) {
  return String(slug || '').replace(/^(?=[a-z0-9]{2,6}-)(?=[a-z0-9]*\d)[a-z0-9]+-/i, '');
}

/** Strip AMFI scheme-code prefixes (e.g. IB31-) from fund display names. */
export function stripAmfiSchemePrefixFromName(name) {
  return String(name || '').replace(/^[A-Z0-9]{2,6}-/, '');
}

const PLAN_NAME_SUFFIX =
  /\s+(direct|regular)(\s+(plan|growth(\s+option)?|idcw|dividend))?(\s+option)?$/i;

function normalizeFundName(name) {
  return stripAmfiSchemePrefixFromName(name)
    .replace(PLAN_NAME_SUFFIX, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function canonicalSlug(slug, aliases = {}) {
  const s = String(slug || '').trim();
  if (!s) return s;
  return aliases[s] || s;
}

function overlapIdentitySlug(slug, aliases = {}) {
  return baseSlug(stripAmfiSchemePrefixFromSlug(canonicalSlug(slug, aliases)));
}

function slugIdentitiesMatch(slugA, slugB, aliases = {}) {
  const aSet = new Set(slugVariants(overlapIdentitySlug(slugA, aliases)));
  for (const v of slugVariants(overlapIdentitySlug(slugB, aliases))) {
    if (aSet.has(v)) return true;
  }
  return false;
}

/** True when two rows refer to the same scheme (duplicate DB/listing entries). */
export function isDuplicateFundPair(slugA, slugB, nameA, nameB, aliases = {}) {
  if (!slugA || !slugB || slugA === slugB) return slugA === slugB;

  const canonA = canonicalSlug(slugA, aliases);
  const canonB = canonicalSlug(slugB, aliases);
  if (canonA === canonB) return true;
  if (canonA === slugB || slugA === canonB) return true;

  if (slugIdentitiesMatch(slugA, slugB, aliases)) return true;

  const normA = normalizeFundName(nameA || slugA);
  const normB = normalizeFundName(nameB || slugB);
  if (normA && normB && normA === normB) return true;

  return false;
}

export function topOverlapPairs(bySlug, nameBySlug, limit = 20, aliases = {}) {
  const pairs = [];
  for (const [slugA, rows] of Object.entries(bySlug || {})) {
    const fundA = nameBySlug.get(slugA) || slugA;
    for (const row of rows || []) {
      if (!row?.slug || row.slug === slugA) continue;
      if (isDuplicateFundPair(slugA, row.slug, fundA, row.name, aliases)) continue;

      const key = [slugA, row.slug].sort().join('|');
      pairs.push({
        key,
        fundA,
        fundB: row.name,
        slugA,
        slugB: row.slug,
        overlap: row.overlap_pct ?? 0,
        common: row.common_stocks ?? 0,
      });
    }
  }

  const seen = new Set();
  return pairs
    .sort((a, b) => b.overlap - a.overlap)
    .filter((row) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    })
    .slice(0, limit);
}