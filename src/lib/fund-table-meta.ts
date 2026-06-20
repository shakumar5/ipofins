import { catToSlug } from './fund-category-slug';
import { withBrandSuffix } from './brand';
import { mfTabConfig } from './mf-section-config';
import type { PageMeta } from './page-meta';

export type FundTableKind = 'best' | 'all';

export function getFundTablePageMeta(
  table: FundTableKind,
  category: string,
  fundCount: number,
): PageMeta {
  const basePath = table === 'best' ? '/mutual-funds/best' : '/mutual-funds/all';

  if (category === 'All') {
    const cfg = mfTabConfig(table);
    return {
      title: cfg.title,
      description: cfg.description,
      path: basePath,
      heading: cfg.heading,
      subtitle: cfg.subtitle,
      breadcrumbLabel: table === 'best' ? 'Best Mutual Funds 2026' : 'All Mutual Funds',
    };
  }

  const path = `${basePath}/${catToSlug(category)}`;

  if (table === 'best') {
    return {
      title: withBrandSuffix(`Best ${category} Mutual Funds in India 2026`),
      description: `${fundCount} best ${category} mutual funds in India 2026. Top performers with highest returns and ratings. Direct-Growth plans only.`,
      path,
      heading: `Best ${category} Mutual Funds in India 2026`,
      subtitle: `${fundCount} top-rated ${category} funds · Sorted by performance · Direct-Growth plans only`,
      breadcrumbLabel: `${category} Mutual Funds`,
    };
  }

  return {
    title: withBrandSuffix(`List of ${category} Mutual Funds in India 2026`),
    description: `List of ${fundCount} ${category} mutual funds in India 2026. Compare NAV, 1Y/3Y/5Y returns, ratings. Direct-Growth plans sorted by performance.`,
    path,
    heading: `List of ${category} Mutual Funds in India 2026`,
    subtitle: `${fundCount} ${category} funds · Sort by returns · Direct-Growth plans only`,
    breadcrumbLabel: `${category} Mutual Funds`,
  };
}
