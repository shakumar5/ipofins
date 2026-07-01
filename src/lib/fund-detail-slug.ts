/** Resolve listable / AMFI fund slugs → static holdings detail page slug. */

import fundSlugAliases from '../data/fund-slug-aliases.json';

export function baseSlug(slug: string): string {
  return slug
    .replace(/-fund-direct$/, '-fund')
    .replace(/(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$/, '')
    .replace(/-growth-option$/, '');
}

export function slugVariants(slug: string): string[] {
  const variants = new Set<string>([slug]);
  const add = (s: string) => variants.add(s);
  add(slug.replace(/-midcap-/g, '-mid-cap-').replace(/-midcap$/g, '-mid-cap'));
  add(slug.replace(/-largecap-/g, '-large-cap-').replace(/-largecap$/g, '-large-cap'));
  add(slug.replace(/-smallcap-/g, '-small-cap-').replace(/-smallcap$/g, '-small-cap'));
  add(slug.replace(/-multicap-/g, '-multi-cap-').replace(/-multicap$/g, '-multi-cap'));
  add(slug.replace(/-flexicap-/g, '-flexi-cap-').replace(/-flexicap$/g, '-flexi-cap'));
  add(slug.replace(/-flexi-cap-/g, '-flexicap-').replace(/-flexi-cap$/g, '-flexicap'));
  add(slug.replace(/-fund-direct$/, '-direct-plan'));
  add(slug.replace(/-direct-plan$/, '-fund-direct'));
  add(slug.replace(/-and-/g, '-'));
  return [...variants];
}

function baseSlugSet(slug: string): Set<string> {
  return new Set(slugVariants(baseSlug(slug)));
}

export function basesMatch(a: string, b: string): boolean {
  const aSet = baseSlugSet(a);
  for (const v of baseSlugSet(b)) {
    if (aSet.has(v)) return true;
  }
  return false;
}

export function fundHoldingsPath(detailSlug: string): string {
  return `/mutual-funds/fund/${detailSlug}-holdings`;
}

/** Map listable / AMFI slug → canonical static holdings page slug when aliases exist. */
export function canonicalHoldingsPageSlug(
  fundSlug: string,
  resolvedSlug: string,
  aliases: Record<string, string> = ALIASES,
): string {
  for (const variant of slugVariants(fundSlug)) {
    const canonical = aliases[variant];
    if (canonical) return canonical;
  }
  return resolvedSlug;
}

export interface FundHoldingsLinkMeta {
  slugs: Set<string>;
  stockCounts: Record<string, number>;
}

/** Merge portfolio-overlap holder slugs so detail links match built static pages. */
export function enrichLinkMetaWithOverlap(
  meta: FundHoldingsLinkMeta,
  overlapSlugs: string[],
): FundHoldingsLinkMeta {
  const slugs = new Set(meta.slugs);
  const stockCounts = { ...meta.stockCounts };

  for (const slug of overlapSlugs) {
    slugs.add(slug);
    const current = stockCounts[slug] ?? 0;
    if (current > 1) continue;

    let mapped = false;
    for (const variant of slugVariants(slug)) {
      const alias = ALIASES[variant];
      if (alias && (stockCounts[alias] ?? 0) > current) {
        stockCounts[slug] = stockCounts[alias];
        mapped = true;
        break;
      }
    }
    if (mapped) continue;

    if (current > 0) continue;

    for (const [k, count] of Object.entries(meta.stockCounts)) {
      if (basesMatch(k, slug)) {
        stockCounts[slug] = count;
        break;
      }
    }
  }

  return { slugs, stockCounts };
}

const ALIASES = fundSlugAliases as Record<string, string>;

/** Map a fund slug (+ optional scheme code) to the built static holdings page slug. */
export function resolveDetailSlug(
  fundSlug: string,
  _schemeCode: string,
  slugs: Set<string>,
  stockCounts: Record<string, number>,
): string | null {
  const pack = (detailSlug: string | null | undefined): string | null => {
    if (!detailSlug || !(stockCounts[detailSlug] ?? 0)) return null;
    return detailSlug;
  };

  const finish = (detailSlug: string | null | undefined): string | null => {
    if (!detailSlug) return null;
    const canonical = canonicalHoldingsPageSlug(fundSlug, detailSlug);
    return pack(canonical);
  };

  for (const variant of slugVariants(fundSlug)) {
    const alias = ALIASES[variant];
    if (alias) {
      const hit = finish(alias);
      if (hit) return hit;
    }
  }

  const direct = finish(fundSlug);
  if (direct) return direct;

  for (const s of slugs) {
    if (basesMatch(s, fundSlug)) {
      const hit = finish(s);
      if (hit) return hit;
    }
  }

  const candidates: string[] = [];
  const addCandidate = (s: string) => {
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  for (const variant of slugVariants(fundSlug)) {
    addCandidate(`${variant}-growth-option-direct-plan`);
    addCandidate(`${variant}-direct-plan`);
    addCandidate(variant);
  }

  for (const c of candidates) {
    const hit = finish(c);
    if (hit) return hit;
  }

  return null;
}
