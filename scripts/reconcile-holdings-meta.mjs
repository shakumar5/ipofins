#!/usr/bin/env node
/**
 * Align fund-holdings-meta.json stockCounts with fund-holdings-by-slug/*.json row counts.
 * Also writes fund-holdings-by-slug-counts.json for client-side mf-hub enrichment.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');
const BY_SLUG = join(DATA, 'fund-holdings-by-slug');
const META_PATH = join(DATA, 'fund-holdings-meta.json');
const ALIASES_PATH = join(DATA, 'fund-holdings-aliases.json');
const COUNTS_PATH = join(DATA, 'fund-holdings-by-slug-counts.json');

if (!existsSync(BY_SLUG)) {
  console.error('Missing public/data/fund-holdings-by-slug/');
  process.exit(1);
}

const bySlugCounts = {};
for (const fileName of readdirSync(BY_SLUG)) {
  if (!fileName.endsWith('.json')) continue;
  const slug = fileName.replace(/\.json$/, '');
  try {
    const data = JSON.parse(readFileSync(join(BY_SLUG, fileName), 'utf-8'));
    const n = Array.isArray(data.stocks) ? data.stocks.length : 0;
    if (n > 0) bySlugCounts[slug] = n;
  } catch {
    // skip
  }
}

writeFileSync(COUNTS_PATH, JSON.stringify(bySlugCounts));
console.log(`  ✓ fund-holdings-by-slug-counts.json (${Object.keys(bySlugCounts).length} funds)`);

function effectiveCount(slug, aliases = {}) {
  let count = bySlugCounts[slug] || 0;
  for (const [listable, canonical] of Object.entries(aliases)) {
    if (listable !== slug && canonical !== slug) continue;
    count = Math.max(
      count,
      bySlugCounts[listable] || 0,
      bySlugCounts[canonical] || 0,
    );
  }
  return count;
}

if (!existsSync(META_PATH)) {
  console.log('  ℹ fund-holdings-meta.json not found — counts file only');
  process.exit(0);
}

const meta = JSON.parse(readFileSync(META_PATH, 'utf-8'));
const stockCounts = { ...(meta.stockCounts || {}) };
let updated = 0;

const aliases = existsSync(ALIASES_PATH)
  ? JSON.parse(readFileSync(ALIASES_PATH, 'utf-8'))
  : {};

// Authoritative counts: actual rows in fund-holdings-by-slug/*.json only.
for (const slug of Object.keys(stockCounts)) {
  const count = effectiveCount(slug, aliases);
  if (count <= 0) {
    delete stockCounts[slug];
    updated++;
    continue;
  }
  if (stockCounts[slug] !== count) {
    stockCounts[slug] = count;
    updated++;
  }
}

for (const slug of Object.keys(bySlugCounts)) {
  const count = effectiveCount(slug, aliases);
  if (!count) continue;
  if (stockCounts[slug] !== count) {
    stockCounts[slug] = count;
    updated++;
  }
}

for (const [listable, canonical] of Object.entries(aliases)) {
  const canonicalCount = effectiveCount(canonical, aliases) || stockCounts[canonical] || 0;
  const listableCount = effectiveCount(listable, aliases) || stockCounts[listable] || 0;
  const best = Math.max(canonicalCount, listableCount);
  if (best > 0) {
    if (stockCounts[listable] !== best) {
      stockCounts[listable] = best;
      updated++;
    }
    if (stockCounts[canonical] !== best) {
      stockCounts[canonical] = best;
      updated++;
    }
  }
}

meta.stockCounts = stockCounts;
meta.slugs = [...new Set([
  ...(meta.slugs || []),
  ...Object.keys(stockCounts).filter((k) => stockCounts[k] > 0),
])];

writeFileSync(META_PATH, JSON.stringify(meta));
console.log(`  ✓ fund-holdings-meta.json reconciled (${updated} slug count(s) synced to by-slug files)`);

function syncMfHubStockCounts(fileName) {
  const hubPath = join(DATA, 'mf-hub', fileName);
  if (!existsSync(hubPath)) return 0;
  const rows = JSON.parse(readFileSync(hubPath, 'utf-8'));
  if (!Array.isArray(rows)) return 0;
  let hubUpdated = 0;
  for (const row of rows) {
    const detailSlug = row.detailSlug ? String(row.detailSlug) : '';
    const count = detailSlug ? effectiveCount(detailSlug, aliases) : 0;
    if (!count || count <= 0) {
      if (row.hasHoldings !== false) {
        row.hasHoldings = false;
        hubUpdated++;
      }
      if ((row.stockCount ?? 0) !== 0) {
        row.stockCount = 0;
        hubUpdated++;
      }
      continue;
    }
    if ((row.stockCount ?? 0) !== count) {
      row.stockCount = count;
      hubUpdated++;
    }
    if (row.hasHoldings !== true) {
      row.hasHoldings = true;
      hubUpdated++;
    }
  }
  if (hubUpdated) writeFileSync(hubPath, JSON.stringify(rows));
  return hubUpdated;
}

const hubAll = syncMfHubStockCounts('all.json');
const hubBest = syncMfHubStockCounts('best.json');
if (hubAll || hubBest) {
  console.log(`  ✓ mf-hub stockCount synced (all: ${hubAll}, best: ${hubBest} rows)`);
}
