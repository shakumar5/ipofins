/**
 * Stock market-cap rank buckets - mirrors scripts/lib/market-cap-buckets.mjs for UI.
 */

export type MarketCapBucketId = 'large' | 'mid' | 'small' | 'micro';

export const MARKET_CAP_BUCKET_ORDER: MarketCapBucketId[] = ['large', 'mid', 'small', 'micro'];

export const MARKET_CAP_BUCKETS: Record<
  MarketCapBucketId,
  { label: string; rankFrom: number; rankTo: number | null; description: string }
> = {
  large: {
    label: 'Large Cap',
    rankFrom: 1,
    rankTo: 100,
    description: 'Rank 1-100 by average market cap',
  },
  mid: {
    label: 'Mid Cap',
    rankFrom: 101,
    rankTo: 250,
    description: 'Rank 101-250 - SEBI mid cap (not micro)',
  },
  small: {
    label: 'Small Cap',
    rankFrom: 251,
    rankTo: 1500,
    description: 'Rank 251-1500 - SEBI small cap band',
  },
  micro: {
    label: 'Micro Cap',
    rankFrom: 1501,
    rankTo: null,
    description: 'Rank 1501+ - below small cap (distinct from mid cap)',
  },
};

export function marketCapBucketLabel(id: MarketCapBucketId): string {
  return MARKET_CAP_BUCKETS[id]?.label ?? id;
}

export function marketCapBucketDescription(id: MarketCapBucketId): string {
  return MARKET_CAP_BUCKETS[id]?.description ?? '';
}