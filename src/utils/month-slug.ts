/** "May 2026" → "may-2026" for holdings change URLs */
export function monthSlug(month: string): string {
  return month.toLowerCase().replace(/\s+/g, '-');
}

export function monthDisplay(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
