import fundSlugAliases from '../data/fund-slug-aliases.json';
import { basesMatch, slugVariants } from './fund-detail-slug';
import { fundSlugCandidates } from './holdings-compare-server';

export interface FundOverlapIndexEntry {
  slug: string;
  name?: string;
}

function normalizeFundName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Map any funds.slug / alias variant to the slug used in fund-overlap static pages. */
export function buildFundOverlapPageSlugResolver(index: FundOverlapIndexEntry[]) {
  const canonicalSet = new Set(index.map((f) => f.slug));
  const canonical = [...canonicalSet];
  const aliases = fundSlugAliases as Record<string, string>;
  const nameToSlug = new Map<string, string>();
  for (const fund of index) {
    if (!fund.name) continue;
    nameToSlug.set(normalizeFundName(fund.name), fund.slug);
  }

  function resolve(raw: string, fundName?: string): string | null {
    const slug = String(raw || '').trim();
    if (!slug) return null;
    if (canonicalSet.has(slug)) return slug;

    for (const c of fundSlugCandidates(slug)) {
      if (canonicalSet.has(c)) return c;
    }

    for (const v of slugVariants(slug)) {
      const alias = aliases[v];
      if (alias && canonicalSet.has(alias)) return alias;
      const growth = v + '-growth-option-direct-plan';
      if (canonicalSet.has(growth)) return growth;
      const direct = v + '-direct-plan';
      if (canonicalSet.has(direct)) return direct;
    }

    for (const c of canonical) {
      if (basesMatch(c, slug)) return c;
    }

    for (const [from, to] of Object.entries(aliases)) {
      if (from !== slug && to !== slug) continue;
      if (canonicalSet.has(to)) return to;
      if (canonicalSet.has(from)) return from;
    }

    if (fundName) {
      const byName = nameToSlug.get(normalizeFundName(fundName));
      if (byName) return byName;
    }

    return null;
  }

  return { resolve, canonicalSet };
}
