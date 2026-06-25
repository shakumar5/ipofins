/** Build portfolio overlap sitemap URLs from fund slugs (shared by export + build). */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

export const PORTFOLIO_OVERLAP_HUB = 'https://ipofins.com/mutual-funds/portfolio-overlap-checker';
export const SITEMAP_URLS_PER_FILE = 45_000;

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildOverlapUrls(funds) {
  const slugs = funds.map((f) => f.slug).filter(Boolean).sort();
  const urls = [PORTFOLIO_OVERLAP_HUB];
  for (let i = 0; i < slugs.length; i += 1) {
    for (let j = i + 1; j < slugs.length; j += 1) {
      urls.push(`${PORTFOLIO_OVERLAP_HUB}/${slugs[i]}-vs-${slugs[j]}`);
    }
  }
  return urls;
}

export function writeOverlapStagingFiles(urls, outDir) {
  const chunks = [];
  for (let i = 0; i < urls.length; i += SITEMAP_URLS_PER_FILE) {
    chunks.push(urls.slice(i, i + SITEMAP_URLS_PER_FILE));
  }

  chunks.forEach((chunk, idx) => {
    const name = `sitemap-overlap-staging-${idx}.xml`;
    const body = chunk
      .map((loc) => `  <url><loc>${escapeXml(loc)}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`)
      .join('\n');
    writeFileSync(
      join(outDir, name),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    );
    console.log(`  ✓ ${name} (${chunk.length} overlap URLs)`);
  });

  return chunks.length;
}

export function loadFundsFromPortfolioJson(root) {
  const candidates = [
    join(root, 'public', 'data', 'portfolio-overlap.json'),
    join(root, 'dist', 'data', 'portfolio-overlap.json'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (Array.isArray(data?.funds) && data.funds.length) return data.funds;
    } catch {
      // try next
    }
  }
  return null;
}

export function parseUrlsetLocCount(filePath) {
  if (!existsSync(filePath)) return 0;
  const xml = readFileSync(filePath, 'utf8');
  return (xml.match(/<loc>/g) || []).length;
}

export function collectStagingUrlsFromDir(dir) {
  const urls = [];
  if (!existsSync(dir)) return urls;

  for (const name of readdirSync(dir)) {
    if (!/^sitemap-overlap-staging-\d+\.xml$/.test(name)) continue;
    const xml = readFileSync(join(dir, name), 'utf8');
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      urls.push(match[1].trim());
    }
  }
  return urls;
}

export function findPrebuiltOverlapSitemaps(dir) {
  if (!existsSync(dir)) return [];

  const names = readdirSync(dir).filter((n) => /^sitemap-portfolio-overlap(-\d+)?\.xml$/.test(n));
  const withUrls = names.filter((name) => parseUrlsetLocCount(join(dir, name)) > 0);

  return withUrls.sort((a, b) => {
    const na = Number((a.match(/-(\d+)\.xml$/) || [])[1] ?? 0);
    const nb = Number((b.match(/-(\d+)\.xml$/) || [])[1] ?? 0);
    if (a === 'sitemap-portfolio-overlap.xml') return -1;
    if (b === 'sitemap-portfolio-overlap.xml') return 1;
    return na - nb;
  });
}

export function stagingFilesMissingOrEmpty(publicDir) {
  if (!existsSync(publicDir)) return true;
  const staging = readdirSync(publicDir).filter((n) => /^sitemap-overlap-staging-\d+\.xml$/.test(n));
  if (!staging.length) return true;
  return staging.every((name) => parseUrlsetLocCount(join(publicDir, name)) === 0);
}
