/** Path + query filters for Smart Money Tracker (category in path, sector in query). */

import { categoryFileSlug } from './client-data';
import { parseTrackerFromPathname } from './smart-money-tracker-meta';

export interface TrackerListFilters {
  category: string;
  sector: string;
}

export const DEFAULT_TRACKER_LIST_FILTERS: TrackerListFilters = {
  category: 'All',
  sector: 'All',
};

export function trackerCategorySlug(category: string): string {
  if (!category || category === 'All') return '';
  return categoryFileSlug(category);
}

export function trackerCategoryFromSlug(slug: string, categories: string[]): string {
  const match = categories.find((c) => categoryFileSlug(c) === slug);
  return match ?? 'All';
}

/** @deprecated Legacy query URLs — category now uses path segments. */
export function parseTrackerListFiltersFromSearch(search: string): TrackerListFilters {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return {
    category: params.get('category') || DEFAULT_TRACKER_LIST_FILTERS.category,
    sector: params.get('sector') || DEFAULT_TRACKER_LIST_FILTERS.sector,
  };
}

export function parseTrackerListFiltersFromPathname(
  pathname: string,
  search = '',
  categories: string[] = [],
): TrackerListFilters {
  const sectorFilters = parseTrackerListFiltersFromSearch(search);
  const parsed = parseTrackerFromPathname(pathname);
  if (!parsed) {
    return { category: DEFAULT_TRACKER_LIST_FILTERS.category, sector: sectorFilters.sector };
  }

  const basePath = `/mutual-funds/smart-money/${parsed.segment}`;
  const pathOnly = pathname.replace(/\/$/, '');
  const rest = pathOnly.slice(basePath.length).replace(/^\//, '');
  const category = rest ? trackerCategoryFromSlug(rest.split('/')[0], categories) : 'All';

  return { category, sector: sectorFilters.sector };
}

export function trackerPathWithListFilters(
  pathname: string,
  filters: Partial<TrackerListFilters> = {},
): string {
  const pathOnly = pathname.split('?')[0].replace(/\/$/, '');
  const parsed = parseTrackerFromPathname(pathOnly);
  const basePath = parsed ? `/mutual-funds/smart-money/${parsed.segment}` : pathOnly;

  const category = filters.category ?? DEFAULT_TRACKER_LIST_FILTERS.category;
  const sector = filters.sector ?? DEFAULT_TRACKER_LIST_FILTERS.sector;

  let path = basePath;
  const categorySlug = trackerCategorySlug(category);
  if (categorySlug) path = `${path}/${categorySlug}`;

  if (sector !== 'All') {
    const params = new URLSearchParams();
    params.set('sector', sector);
    path = `${path}?${params.toString()}`;
  }
  return path;
}
