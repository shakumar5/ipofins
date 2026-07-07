import type { PageMeta } from './page-meta';
import { withBrandSuffix } from './brand';
import { getSmartMoneyPageMeta } from './smart-money-meta';
import { pathnameWithoutTrailingSlash } from './pathname';

export const STOCK_SIGNAL_BASE = '/mutual-funds/smart-money/stock-signal';

export function stockSignalPath(stockSlug?: string): string {
  if (!stockSlug) return STOCK_SIGNAL_BASE;
  return `${STOCK_SIGNAL_BASE}/${stockSlug}`;
}

export function parseStockSignalSlugFromPathname(pathname: string): string | null {
  const normalized = pathnameWithoutTrailingSlash(pathname);
  if (!normalized.startsWith(STOCK_SIGNAL_BASE)) return null;
  const rest = normalized.slice(STOCK_SIGNAL_BASE.length).replace(/^\//, '');
  if (!rest || rest.includes('/')) return null;
  return decodeURIComponent(rest);
}

export function getStockSignalPageMeta(stockName?: string, stockSlug?: string): PageMeta {
  if (stockName && stockSlug) {
    const path = stockSignalPath(stockSlug);
    return {
      title: withBrandSuffix(`${stockName} Stock Signal 2026 - Mutual Fund Institutional Activity`),
      description: `How mutual funds are buying or selling ${stockName}: conviction score, funds holding, increases, reductions, fresh entries and complete exits from AMC disclosures.`,
      path,
      heading: stockName,
      subtitle: `Institutional mutual fund activity for ${stockName} — conviction score and top AMC holders.`,
      breadcrumbLabel: stockName,
    };
  }
  return getSmartMoneyPageMeta('stock-signal');
}
