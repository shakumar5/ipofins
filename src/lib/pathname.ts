/**
 * Canonical pathname shape for ipofins.com — no trailing slash (root stays "/").
 * Keep in sync with BaseLayout canonical + sitemap URL normalization.
 */
export function pathnameWithoutTrailingSlash(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}
