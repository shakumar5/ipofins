import {
  basesMatch,
  canonicalHoldingsPageSlug,
  resolveDetailSlug,
  slugVariants,
} from './fund-detail-slug';
import fundSlugAliases from '../data/fund-slug-aliases.json';
import type { MfHubFundRow } from './mf-hub-build';

export interface FundHoldingsMetaDisk {
  slugs: string[];
  stockCounts: Record<string, number>;
}

export const FUND_HOLDINGS_META_URL = '/data/fund-holdings-meta.json';
export const FUND_HOLDINGS_ALIASES_URL = '/data/fund-holdings-aliases.json';

/** Reconcile table rows with exported holdings meta (fixes stale mf-hub JSON / slug mismatches). */
export function enrichMfHubFundsWithHoldings(
  funds: MfHubFundRow[],
  meta: FundHoldingsMetaDisk,
  amfiAliases: Record<string, string> = {},
): MfHubFundRow[] {
  const stockCounts = meta.stockCounts || {};
  const slugAliases: Record<string, string> = { ...fundSlugAliases, ...amfiAliases };
  const slugSet = new Set(
    meta.slugs?.length ? meta.slugs : Object.keys(stockCounts).filter((k) => (stockCounts[k] ?? 0) > 0),
  );

  const pack = (detailSlug: string | null | undefined): { detailSlug: string; stockCount: number } | null => {
    if (!detailSlug) return null;
    const stockCount = stockCounts[detailSlug] ?? 0;
    if (stockCount <= 0) return null;
    return { detailSlug, stockCount };
  };

  const toCanonical = (fundSlug: string, resolved: string): string =>
    canonicalHoldingsPageSlug(fundSlug, resolved, slugAliases);

  const resolveRow = (fund: MfHubFundRow) => {
    // Trust export-built detailSlug when still valid — avoids replacing with listable slugs.
    if (fund.detailSlug) {
      const canonical = toCanonical(fund.slug, fund.detailSlug);
      const existing = pack(canonical);
      if (existing) return existing;
    }

    for (const variant of slugVariants(fund.slug)) {
      const alias = slugAliases[variant];
      if (!alias) continue;
      const hit = pack(alias);
      if (hit) return { detailSlug: alias, stockCount: hit.stockCount };
    }

    const viaDetail = resolveDetailSlug(fund.slug, '', slugSet, stockCounts);
    if (viaDetail) {
      const canonical = toCanonical(fund.slug, viaDetail);
      const hit = pack(canonical);
      if (hit) return hit;
    }

    for (const slug of slugSet) {
      if (basesMatch(slug, fund.slug)) {
        const canonical = toCanonical(fund.slug, slug);
        const hit = pack(canonical);
        if (hit) return hit;
      }
    }

    for (const variant of slugVariants(fund.slug)) {
      for (const candidate of [
        `${variant}-growth-option-direct-plan`,
        `${variant}-direct-plan`,
        variant,
      ]) {
        const canonical = toCanonical(fund.slug, candidate);
        const hit = pack(canonical);
        if (hit) return hit;
      }
    }

    return null;
  };

  return funds.map((fund) => {
    const hit = resolveRow(fund);
    if (hit) {
      return {
        ...fund,
        hasHoldings: true,
        stockCount: hit.stockCount,
        detailSlug: hit.detailSlug,
      };
    }
    return { ...fund, hasHoldings: false, stockCount: 0, detailSlug: null };
  });
}
