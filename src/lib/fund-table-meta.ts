import { catToSlug } from './fund-category-slug';
import { mfTabConfig } from './mf-section-config';

export type FundTableKind = 'best' | 'all';

export function getFundTablePageMeta(
  table: FundTableKind,
  category: string,
  fundCount: number,
): { title: string; description: string; path: string } {
  const basePath = table === 'best' ? '/mutual-funds/best' : '/mutual-funds/all';

  if (category === 'All') {
    const cfg = mfTabConfig(table);
    return {
      title: cfg.title,
      description: cfg.description,
      path: basePath,
    };
  }

  const path = `${basePath}/${catToSlug(category)}`;

  if (table === 'best') {
    return {
      title: `Best ${category} Mutual Funds 2026 - Top Rated | IPOFins`,
      description: `${fundCount} best ${category} mutual funds in India 2026. Top performers with highest returns and ratings. Direct-Growth plans only.`,
      path,
    };
  }

  return {
    title: `${category} Mutual Funds 2026 - Compare Returns & Ratings | IPOFins`,
    description: `List of ${fundCount} ${category} mutual funds in India 2026. Compare NAV, 1Y/3Y/5Y returns, ratings. Direct-Growth plans sorted by performance.`,
    path,
  };
}
