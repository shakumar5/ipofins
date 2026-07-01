import { basesMatch, resolveDetailSlug, slugVariants } from './fund-detail-slug';
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

  const resolveRow = (fund: MfHubFundRow) => {
    if ((stockCounts[fund.slug] ?? 0) > 0) {
      const direct = pack(fund.slug);
      if (direct) return direct;
    }

    for (const variant of slugVariants(fund.slug)) {
      const alias = slugAliases[variant];
      const hit = pack(alias);
      if (hit) return hit;
    }

    const viaDetail = resolveDetailSlug(fund.slug, '', slugSet, stockCounts);
    const detailHit = pack(viaDetail);
    if (detailHit) return detailHit;

    for (const slug of slugSet) {
      if (basesMatch(slug, fund.slug)) {
        const hit = pack(slug);
        if (hit) return hit;
      }
    }

    for (const variant of slugVariants(fund.slug)) {
      for (const candidate of [
        variant + '-growth-option-direct-plan',
        variant + '-direct-plan',
        variant,
      ]) {
        const hit = pack(candidate);
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
    if (fund.hasHoldings === true && fund.stockCount && fund.stockCount > 0) {
      return fund;
    }
    return { ...fund, hasHoldings: false, stockCount: 0, detailSlug: null };
  });
}
