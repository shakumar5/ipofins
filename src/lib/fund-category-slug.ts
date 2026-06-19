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
