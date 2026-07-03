/**
 * SEBI-style stock market-cap rank buckets (IPOFins: micro split at rank 1501).
 * Shared by AMFI backfill, SHP fallback, and Top Stocks UI copy.
 */

export const MARKET_CAP_BUCKET_ORDER = ['large', 'mid', 'small', 'micro'];

/** @type {Record<string, { label: string; rankFrom: number; rankTo: number | null; description: string }>} */
export const MARKET_CAP_BUCKETS = {
  large: {
    label: 'Large Cap',
    rankFrom: 1,
    rankTo: 100,
    description: 'Rank 1–100 by average market cap',
  },
  mid: {
    label: 'Mid Cap',
    rankFrom: 101,
    rankTo: 250,
    description: 'Rank 101–250 — SEBI mid cap (not micro)',
  },
  small: {
    label: 'Small Cap',
    rankFrom: 251,
    rankTo: 1500,
    description: 'Rank 251–1500 — SEBI small cap band',
  },
  micro: {
    label: 'Micro Cap',
    rankFrom: 1501,
    rankTo: null,
    description: 'Rank 1501+ — below small cap (distinct from mid cap)',
  },
};

/**
 * @param {number} rank
 * @returns {'large' | 'mid' | 'small' | 'micro' | null}
 */
export function rankToMarketCapCategory(rank) {
  const r = Number(rank);
  if (!Number.isFinite(r) || r < 1) return null;
  if (r <= MARKET_CAP_BUCKETS.large.rankTo) return 'large';
  if (r <= MARKET_CAP_BUCKETS.mid.rankTo) return 'mid';
  if (r <= MARKET_CAP_BUCKETS.small.rankTo) return 'small';
  return 'micro';
}

export function marketCapBucketLabel(id) {
  return MARKET_CAP_BUCKETS[id]?.label ?? id;
}
