/**
 * Shared holder link targets for server + client (no DB imports).
 */

export const HOLDER_PAGE_MIN_INDEXABLE_STOCKS = 2;

export function isHolderPageIndexable(stockCount: number): boolean {
  return stockCount >= HOLDER_PAGE_MIN_INDEXABLE_STOCKS;
}

export function onePercentStockPath(stockSlug: string): string {
  return `/1-percent-club/${stockSlug}`;
}

export function onePercentHolderPath(holderSlug: string): string {
  return `/1-percent-club/holder/${holderSlug}`;
}

export function slugifyEntity(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
}

export function primaryStockSlugFromPositions(
  positions: ReadonlyArray<{ stockSlug: string; pct?: number | null }>,
): string | null {
  if (!positions.length) return null;
  const top = [...positions].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  return top?.stockSlug ?? null;
}

export function resolveHolderProfileUrl(options: {
  entitySlug: string | null;
  holderSlug: string;
  stockCount: number;
  primaryStockSlug?: string | null;
}): string | null {
  const count = options.stockCount;
  if (count < 1) return null;

  const primaryStock = options.primaryStockSlug ?? null;
  if (!isHolderPageIndexable(count)) {
    return primaryStock ? onePercentStockPath(primaryStock) : null;
  }

  const slug = options.entitySlug || options.holderSlug;
  return slug ? onePercentHolderPath(slug) : null;
}
