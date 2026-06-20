/** Social preview images — always PNG (Twitter/X and most crawlers reject SVG og:image). */

export const OG_DEFAULT_IMAGE = '/og-default.png';
export const OG_IPO_IMAGE = '/og-ipo.png';
export const OG_FUND_IMAGE = '/og-fund.png';

/** Coerce legacy SVG paths to PNG; leave other paths unchanged. */
export function resolveOgImageUrl(path: string | undefined, fallback = OG_DEFAULT_IMAGE): string {
  const raw = (path || fallback).trim();
  if (!raw) return fallback;
  if (raw.endsWith('.svg')) return raw.replace(/\.svg$/, '.png');
  return raw;
}
