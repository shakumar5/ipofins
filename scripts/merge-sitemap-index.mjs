/**
 * Post-build: merge custom sitemaps into Astro's dist/sitemap-index.xml.
 * robots.txt only needs to point at /sitemap-index.xml.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SITE = 'https://ipofins.com';
const INDEX_PATH = join(DIST, 'sitemap-index.xml');

/** Child sitemaps (or nested indexes) produced before/during build in public/ → dist/. */
const CUSTOM_SITEMAPS = [
  'sitemap-portfolio-overlap-index.xml',
  'sitemap-smart-money-tracker.xml',
];

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function existingLocs(xml) {
  const locs = new Set();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    locs.add(match[1]);
  }
  return locs;
}

function main() {
  const present = CUSTOM_SITEMAPS.filter((name) => existsSync(join(DIST, name)));
  if (!present.length) {
    console.warn('  ⚠ merge-sitemap-index: no custom sitemaps in dist — skip');
    return;
  }

  if (!existsSync(INDEX_PATH)) {
    console.warn('  ⚠ merge-sitemap-index: dist/sitemap-index.xml missing — skip');
    return;
  }

  let xml = readFileSync(INDEX_PATH, 'utf8');
  const locs = existingLocs(xml);
  const entries = [];

  for (const name of present) {
    const loc = `${SITE}/${name}`;
    if (locs.has(loc)) continue;
    entries.push(`  <sitemap><loc>${escapeXml(loc)}</loc></sitemap>`);
  }

  if (!entries.length) {
    console.log('  ✓ sitemap-index.xml already lists all custom sitemaps');
    return;
  }

  xml = xml.replace('</sitemapindex>', `${entries.join('\n')}\n</sitemapindex>`);
  writeFileSync(INDEX_PATH, xml);
  console.log(`  ✓ sitemap-index.xml merged (+${entries.length} custom sitemap${entries.length === 1 ? '' : 's'})`);
}

main();
