/**
 * Regenerate public/sitemap-smart-money-tracker.xml from on-disk JSON (no DB).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const PUBLIC_DIR = join(ROOT, 'public');

const SMART_MONEY_SITEMAP_BASE = 'https://ipofins.com/mutual-funds/smart-money';
const STOCK_SIGNAL_SITEMAP_BASE = `${SMART_MONEY_SITEMAP_BASE}/stock-signal`;
const TRACKER_VIEW_SLUGS = [
  'most-bought-stocks',
  'most-sold-stocks',
  'fresh-entries',
  'complete-exits',
];

function monthFileSlug(month) {
  return month.toLowerCase().replace(/\s+/g, '-');
}

function loadStockSlugsFromDisk() {
  const signalsDir = join(OUT_DIR, 'smart-money-signals');
  if (!existsSync(signalsDir)) return [];
  const slugs = new Set();
  for (const fileName of readdirSync(signalsDir)) {
    if (!fileName.endsWith('.json')) continue;
    const file = JSON.parse(readFileSync(join(signalsDir, fileName), 'utf8'));
    for (const row of file.rows || []) {
      if (row.stockSlug) slugs.add(row.stockSlug);
    }
  }
  return [...slugs].sort();
}

function loadTrackerMonthLabels() {
  const indexPath = join(OUT_DIR, 'smart-money-tracker-index.json');
  if (!existsSync(indexPath)) return [];
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  return (index.months || []).map((m) => m.label || m).filter(Boolean);
}

const months = loadTrackerMonthLabels();
const urls = [
  SMART_MONEY_SITEMAP_BASE,
  `${SMART_MONEY_SITEMAP_BASE}/smart-money-signal`,
  `${SMART_MONEY_SITEMAP_BASE}/stock-signal`,
  `${SMART_MONEY_SITEMAP_BASE}/sector-intelligence`,
];

for (const month of months) {
  const mSlug = monthFileSlug(month);
  for (const viewSlug of TRACKER_VIEW_SLUGS) {
    urls.push(`${SMART_MONEY_SITEMAP_BASE}/${viewSlug}-in-${mSlug}`);
  }
}

for (const stockSlug of loadStockSlugsFromDisk()) {
  urls.push(`${STOCK_SIGNAL_SITEMAP_BASE}/${stockSlug}`);
  urls.push(`${SMART_MONEY_SITEMAP_BASE}/signal/${stockSlug}`);
}

const escapeXml = (v) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const body = urls
  .map(
    (loc) =>
      `  <url><loc>${escapeXml(loc)}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
  )
  .join('\n');

writeFileSync(
  join(PUBLIC_DIR, 'sitemap-smart-money-tracker.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
);

const stockSignalCount = urls.filter((u) => u.startsWith(`${STOCK_SIGNAL_SITEMAP_BASE}/`)).length;
const signalDetailCount = urls.filter((u) => u.includes('/signal/') && !u.endsWith('/stock-signal')).length;
console.log(`Wrote ${urls.length} URLs (${stockSignalCount} stock-signal + ${signalDetailCount} signal detail pages)`);
