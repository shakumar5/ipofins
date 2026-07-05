/** AMFI canonical names → short labels for UI cards and nav. */
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'Equity Scheme - Large Cap Fund': 'Large Cap Funds',
  'Equity Scheme - Large & Mid Cap Fund': 'Large & Mid Cap',
  'Equity Scheme - Mid Cap Fund': 'Mid Cap Funds',
  'Equity Scheme - Small Cap Fund': 'Small Cap Funds',
  'Equity Scheme - Multi Cap Fund': 'Multi Cap Funds',
  'Equity Scheme - Flexi Cap Fund': 'Flexi Cap Funds',
  'Equity Scheme - Focused Fund': 'Focused Funds',
  'Equity Scheme - Sectoral/ Thematic': 'Sector/Thematic',
  'Equity Scheme - ELSS': 'ELSS (Tax Saving)',
  'Equity Scheme - Value Fund': 'Value Funds',
  'Equity Scheme - Contra Fund': 'Contra Funds',
  'Equity Scheme - Dividend Yield Fund': 'Dividend Yield',
  'Hybrid Scheme - Aggressive Hybrid Fund': 'Aggressive Hybrid',
  'Hybrid Scheme - Conservative Hybrid Fund': 'Conservative Hybrid',
  'Hybrid Scheme - Balanced Hybrid Fund': 'Balanced Hybrid',
  'Hybrid Scheme - Dynamic Asset Allocation': 'Dynamic Allocation',
  'Hybrid Scheme - Multi Asset Allocation': 'Multi Asset',
  'Hybrid Scheme - Arbitrage Fund': 'Arbitrage Funds',
  'Debt Scheme - Liquid Fund': 'Liquid Funds',
  'Debt Scheme - Short Duration Fund': 'Short Duration',
  'Debt Scheme - Corporate Bond Fund': 'Corporate Bond',
  'Other Scheme - Index Funds': 'Index Funds',
  'Other Scheme - FoF Domestic': 'Fund of Funds',
};

/** Human-friendly category label; falls back to shortened AMFI name. */
export function categoryDisplayName(cat: string): string {
  if (CATEGORY_DISPLAY_NAMES[cat]) return CATEGORY_DISPLAY_NAMES[cat];
  return cat
    .replace(/^Equity Scheme - /i, '')
    .replace(/^Hybrid Scheme - /i, '')
    .replace(/^Debt Scheme - /i, '')
    .replace(/^Other Scheme - /i, '')
    .replace(/ Fund$/i, ' Funds')
    .trim();
}

/** Shared slug for mutual fund category routes (e.g. large-cap-mutual-funds). */
export function catToSlug(cat: string): string {
  return cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-mutual-funds';
}

/** Resolve category name from URL slug using available categories. */
export function slugToCat(slug: string, categories: string[]): string | null {
  return categories.find((c) => catToSlug(c) === slug) ?? null;
}

/** Read active category from a fund table base path (e.g. /mutual-funds/all). */
export function categoryFromPath(
  pathname: string,
  basePath: string,
  categories: string[],
): string {
  if (pathname === basePath) return 'All';
  const prefix = `${basePath}/`;
  if (!pathname.startsWith(prefix)) return 'All';
  const slug = pathname.slice(prefix.length);
  return slugToCat(slug, categories) ?? 'All';
}
