/** Shared helpers for sitemap XML generation. */

export const SITE = 'https://ipofins.com';
export const SITEMAP_URL_LIMIT = 45_000;

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
  if (path.startsWith('/ipo')) return 'sitemap-ipos.xml';
  if (path.includes('/stock-signal/') || /^\/mutual-funds\/smart-money\/signal\//.test(path)) {
    return 'sitemap-stocks.xml';
  }
  if (path.startsWith('/mutual-funds/smart-money')) return 'sitemap-smart-money.xml';
  if (path.startsWith('/mutual-funds/portfolio-overlap-checker')) return 'sitemap-portfolio-overlap.xml';
  if (path.startsWith('/mutual-funds/fund/')) return 'sitemap-funds.xml';
  if (/^\/mutual-funds\/mutual-fund-holdings-changes\/[^/]+/.test(path)) return 'sitemap-amcs.xml';
  if (path.startsWith('/mutual-funds/')) return 'sitemap-mutual-funds.xml';
  if (path.startsWith('/tools') || path.startsWith('/broker')) return 'sitemap-tools.xml';
  if (path.startsWith('/blogs')) return 'sitemap-blog.xml';
  if (path.startsWith('/learn')) return 'sitemap-learn.xml';

  return 'sitemap-tools.xml';
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
  'sitemap-portfolio-overlap.xml', // placeholder — expanded to urlset(s) in reorganize-sitemaps.mjs
  'sitemap-tools.xml',
  'sitemap-blog.xml',
  'sitemap-learn.xml',
];
