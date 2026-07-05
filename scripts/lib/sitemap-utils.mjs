/** Shared helpers for sitemap XML generation. */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const SITE = 'https://ipofins.com';
export const SITEMAP_URL_LIMIT = 45_000;

/**
 * The default Top Stocks filter combo. Its landing page canonicalizes to the
 * /top-stocks hub (see src/lib/top-stocks-meta.ts DEFAULT_TOP_STOCKS_FILTERS and
 * top-stocks/index.astro), so it must NOT be advertised in the sitemap — the hub
 * page (/top-stocks) already covers it. Submitting both produced GSC "Duplicate,
 * Google chose different canonical than user".
 */
export const TOP_STOCKS_DEFAULT_COMBO_PATH = '/top-stocks/mutual-funds/large/accumulation';

/** Indexable Top Stocks filter URLs (path-based landing pages), excluding the
 * default combo which canonicalizes to the /top-stocks hub. */
export function collectTopStocksFilterSitemapUrls(site = SITE) {
  const sourceSlugs = {
    mutual_funds: 'mutual-funds',
    super_investors: 'super-investors',
    dii_fii: 'dii-fii',
    one_percent_club: 'one-percent-club',
  };
  const caps = ['large', 'mid', 'small', 'micro'];
  const flows = ['accumulation', 'distribution'];
  const urls = [];
  for (const [source, sourceSlug] of Object.entries(sourceSlugs)) {
    for (const cap of caps) {
      for (const flow of flows) {
        const path = `/top-stocks/${sourceSlug}/${cap}/${flow}`;
        if (path === TOP_STOCKS_DEFAULT_COMBO_PATH) continue;
        urls.push(`${site}${path}`);
      }
    }
  }
  return urls;
}

/** Indexable Smart Money Signal filter URLs (month × cap × signal). */
export function collectSmartMoneySignalFilterSitemapUrls(site = SITE, cwd = process.cwd()) {
  const indexPath = join(cwd, 'public', 'data', 'smart-money-signals-index.json');
  if (!existsSync(indexPath)) return [];
  let index;
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch {
    return [];
  }
  const months = index.months || [];
  const categories = index.categories || [];
  const base = `${site}/mutual-funds/smart-money/smart-money-signal`;
  const urls = [];
  const signalSlugs = [
    'aggressive-accumulation',
    'strong-accumulation',
    'moderate-accumulation',
    'light-accumulation',
    'neutral',
    'light-distribution',
    'distribution',
    'strong-distribution',
  ];
  const categorySlug = (cat) => cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  for (const month of months) {
    const mSlug = month.toLowerCase().replace(/\s+/g, '-');
    for (const category of categories) {
      const cSlug = categorySlug(category);
      for (const signalSlug of signalSlugs) {
        urls.push(`${base}/${mSlug}/${cSlug}/${signalSlug}`);
      }
    }
  }
  return urls;
}

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function pathnameFromLoc(loc) {
  try {
    const url = new URL(loc);
    return url.pathname.replace(/\/$/, '') || '/';
  } catch {
    return '';
  }
}

export function parseUrlsetLocs(xml) {
  const locs = [];
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    locs.push(match[1].trim());
  }
  return locs;
}

export function writeUrlsetSync(
  writeFileSync,
  filePath,
  urls,
  { lastmod = todayIso(), changefreq = 'weekly', priority = '0.7' } = {},
) {
  const unique = [...new Set(urls)].sort();
  const body = unique
    .map(
      (loc) =>
        `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  writeFileSync(filePath, xml);
  return unique.length;
}

export function writeSitemapIndexSync(writeFileSync, filePath, childNames, lastmod = todayIso()) {
  const body = childNames
    .map(
      (name) =>
        `  <sitemap>\n    <loc>${escapeXml(`${SITE}/${name}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
  writeFileSync(filePath, xml);
}

export function chunkUrls(urls, limit = SITEMAP_URL_LIMIT) {
  const chunks = [];
  for (let i = 0; i < urls.length; i += limit) {
    chunks.push(urls.slice(i, i + limit));
  }
  return chunks.length ? chunks : [[]];
}

/** Classify a site path into a canonical sitemap bucket filename. */
export function classifySitemapBucket(pathname) {
  const path = pathname || '/';

  if (path.startsWith('/super-investors')) return 'sitemap-super-investors.xml';
  if (path.startsWith('/1-percent-club')) return 'sitemap-one-percent-club.xml';
  if (path.startsWith('/top-stocks')) return 'sitemap-top-stocks.xml';
  if (path.startsWith('/ipo')) return 'sitemap-ipos.xml';
  if (path.includes('/stock-signal/') || /^\/mutual-funds\/smart-money\/signal\//.test(path)) {
    return 'sitemap-stocks.xml';
  }
  if (path.startsWith('/mutual-funds/smart-money')) return 'sitemap-smart-money.xml';
  if (path.startsWith('/mutual-funds/portfolio-overlap-checker')) {
    // Only "-vs-" comparison deep links belong to the overlap bucket (which is
    // no longer listed in sitemap-index.xml — they serve one shared hub HTML with
    // a hub canonical, so Google treats them as duplicates). The hub page itself
    // stays in the mutual-funds sitemap so it remains indexable.
    return isPortfolioOverlapRewritePath(path)
      ? 'sitemap-portfolio-overlap.xml'
      : 'sitemap-mutual-funds.xml';
  }
  if (path.startsWith('/mutual-funds/fund/')) return 'sitemap-funds.xml';
  if (/^\/mutual-funds\/amc\/[^/]+$/.test(path)) return 'sitemap-amcs.xml';
  if (/^\/mutual-funds\/mutual-fund-holdings-changes\/[^/]+/.test(path)) return 'sitemap-amcs.xml';
  if (path === '/mutual-funds' || path.startsWith('/mutual-funds/')) return 'sitemap-mutual-funds.xml';
  if (path.startsWith('/tools') || path.startsWith('/broker')) return 'sitemap-tools.xml';
  if (path.startsWith('/blogs')) return 'sitemap-blog.xml';
  if (path.startsWith('/learn')) return 'sitemap-learn.xml';

  return 'sitemap-tools.xml';
}

/**
 * True for a fund holdings detail page path (/mutual-funds/fund/<slug>-holdings).
 *
 * These come in two flavours: the canonical page (indexable, self-canonical) and
 * AMFI/listable alias slugs that Astro emits as noindex meta-refresh redirects to
 * the canonical page. Only canonical fund paths belong in the sitemap — see
 * reorganize-sitemaps.mjs, which drops the alias redirects using the fund holdings
 * index. Submitting the aliases caused GSC "Excluded by noindex", "Page with
 * redirect", and "Duplicate, Google chose different canonical" at scale.
 */
export function isFundDetailPath(pathname) {
  return /^\/mutual-funds\/fund\/.+-holdings$/.test(pathname || '');
}

/**
 * Canonical fund detail paths (/mutual-funds/fund/<slug>-holdings) that are
 * indexable and self-canonical, built from fund-holdings-index.json — the same
 * source getFundsWithHoldings() uses to generate the pages. Shared by
 * reorganize-sitemaps.mjs (to drop alias redirects) and verify-sitemaps.mjs (to
 * fail the build if an alias ever leaks back in).
 *
 * `dataDirs` is an ordered list of directories to look for the index in. Returns
 * null when the index is unavailable/empty so callers can fall back to keeping
 * all fund URLs rather than emptying the funds sitemap.
 */
export function loadCanonicalFundPaths(dataDirs) {
  for (const base of dataDirs) {
    const path = join(base, 'fund-holdings-index.json');
    if (!existsSync(path)) continue;
    try {
      const index = JSON.parse(readFileSync(path, 'utf8'));
      if (!Array.isArray(index) || !index.length) return null;
      const paths = new Set(
        index
          .map((f) => f?.slug)
          .filter(Boolean)
          .map((slug) => `/mutual-funds/fund/${slug}-holdings`),
      );
      return paths.size ? paths : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Sitemap hygiene guard. Given the sitemap loc paths (and, when available, the
 * canonical fund path set), return any paths that must never be advertised:
 *   - fundAliasLeaks: /mutual-funds/fund/<slug>-holdings URLs that are NOT
 *     canonical (i.e. noindex meta-refresh alias redirects).
 *   - defaultComboLeaks: the default Top Stocks combo, which canonicalizes to the
 *     /top-stocks hub.
 * verify-sitemaps.mjs fails the build when either is non-empty, turning a silent
 * regression of reorganize-sitemaps.mjs into a loud, pre-deploy error.
 */
export function findForbiddenSitemapPaths(paths, { canonicalFundPaths } = {}) {
  const fundAliasLeaks = [];
  const defaultComboLeaks = [];
  for (const path of paths) {
    if (path === TOP_STOCKS_DEFAULT_COMBO_PATH) {
      defaultComboLeaks.push(path);
    }
    if (canonicalFundPaths && isFundDetailPath(path) && !canonicalFundPaths.has(path)) {
      fundAliasLeaks.push(path);
    }
  }
  return { fundAliasLeaks, defaultComboLeaks };
}

export const CANONICAL_SITEMAP_INDEX = [
  'sitemap-ipos.xml',
  'sitemap-mutual-funds.xml',
  'sitemap-amcs.xml',
  'sitemap-funds.xml',
  'sitemap-stocks.xml',
  'sitemap-smart-money.xml',
  'sitemap-super-investors.xml',
  'sitemap-one-percent-club.xml',
  'sitemap-top-stocks.xml',
  'sitemap-portfolio-overlap.xml', // placeholder — expanded to urlset(s) in reorganize-sitemaps.mjs
  'sitemap-tools.xml',
  'sitemap-blog.xml',
  'sitemap-learn.xml',
];

/** Hub pages that must appear in at least one sitemap urlset. */
export const REQUIRED_SITEMAP_HUB_PATHS = [
  '/',
  '/ipo',
  '/mutual-funds',
  '/mutual-funds/smart-money',
  '/super-investors',
  '/1-percent-club',
  '/top-stocks',
  '/broker',
  '/tools',
  '/blogs',
  '/learn',
];

/** Astro sitemap filter excludes these — fail if they appear in a urlset. */
export const SITEMAP_EXCLUDED_PATH_PREFIXES = [
  '/dashboard',
  '/search',
  '/1-percent-club/holder/',
];

export const PORTFOLIO_OVERLAP_HUB_PATH = '/mutual-funds/portfolio-overlap-checker';

/** Comparison deep links are served via vercel.json rewrite to the hub HTML. */
export function isPortfolioOverlapRewritePath(pathname) {
  return (
    pathname.startsWith(`${PORTFOLIO_OVERLAP_HUB_PATH}/`)
    && pathname !== `${PORTFOLIO_OVERLAP_HUB_PATH}/`
    && pathname.includes('-vs-')
  );
}

/** Map a site path to the expected Astro static HTML file in dist/. */
export function locToDistHtml(distRoot, pathname) {
  const path = (pathname || '/').replace(/\/$/, '') || '/';
  if (path === '/') return join(distRoot, 'index.html');
  return join(distRoot, ...path.slice(1).split('/'), 'index.html');
}

export function parseSitemapIndexChildNames(indexXml) {
  return [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .map((loc) => loc.replace(/^https:\/\/ipofins\.com\//, ''))
    .filter((name) => name.endsWith('.xml'));
}

export function collectAllSitemapPaths(distRoot, childNames) {
  const paths = new Set();
  for (const name of childNames) {
    const filePath = join(distRoot, name);
    if (!existsSync(filePath)) continue;
    const xml = readFileSync(filePath, 'utf8');
    for (const loc of parseUrlsetLocs(xml)) {
      const path = pathnameFromLoc(loc);
      if (path) paths.add(path);
    }
  }
  return paths;
}
