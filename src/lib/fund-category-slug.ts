/** Shared slug for mutual fund category routes (e.g. large-cap-mutual-funds). */
export function catToSlug(cat: string): string {
  return cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-mutual-funds';
}
