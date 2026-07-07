import type { PageMeta } from './page-meta';
import { mfTabConfig } from './mf-section-config';
import { pathnameWithoutTrailingSlash } from './pathname';

export const PORTFOLIO_OVERLAP_BASE = '/mutual-funds/portfolio-overlap-checker';

const DELIMITER = '-vs-';

const defaultMeta = mfTabConfig('overlap-checker');

export function slugsFromComparisonSegment(segment: string): string[] {
  if (!segment) return [];
  return segment.split(DELIMITER).filter(Boolean);
}

export function comparisonSegmentFromSlugs(slugs: string[]): string {
  return slugs.filter(Boolean).join(DELIMITER);
}

export function comparisonPathFromSlugs(slugs: string[]): string {
  const valid = slugs.filter(Boolean);
  if (valid.length < 2) return PORTFOLIO_OVERLAP_BASE;
  return `${PORTFOLIO_OVERLAP_BASE}/${comparisonSegmentFromSlugs(valid)}`;
}

export function parseComparisonFromPathname(pathname: string): string[] {
  const normalized = pathnameWithoutTrailingSlash(pathname);
  if (!normalized.startsWith(PORTFOLIO_OVERLAP_BASE)) return [];
  const rest = normalized.slice(PORTFOLIO_OVERLAP_BASE.length).replace(/^\//, '');
  if (!rest) return [];
  return slugsFromComparisonSegment(decodeURIComponent(rest));
}

export function getPortfolioOverlapPageMeta(
  slugs: string[],
  fundNamesBySlug: Map<string, string>,
  month?: string,
): PageMeta {
  const names = slugs
    .map((slug) => fundNamesBySlug.get(slug))
    .filter((name): name is string => Boolean(name));

  if (names.length < 2) {
    return {
      title: defaultMeta.title,
      description: defaultMeta.description,
      path: PORTFOLIO_OVERLAP_BASE,
      heading: defaultMeta.heading,
      subtitle: defaultMeta.subtitle,
      breadcrumbLabel: 'Portfolio Overlap Checker',
    };
  }

  const label = names.join(' vs ');
  const monthNote = month ? ` (${month} holdings)` : '';

  return {
    title: `${label} — Portfolio Overlap Comparison | IPOFins`,
    description: `Compare portfolio overlap between ${names.join(', ')}. See overlap percentage and shared stock holdings${monthNote}.`,
    // Canonical always points to the hub — comparison deep links are not submitted to GSC.
    path: PORTFOLIO_OVERLAP_BASE,
    heading: defaultMeta.heading,
    subtitle: `Comparing ${label}`,
    breadcrumbLabel: 'Portfolio Overlap Checker',
  };
}
