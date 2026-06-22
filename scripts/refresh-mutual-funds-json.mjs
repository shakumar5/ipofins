#!/usr/bin/env node
/**
 * Refresh src/data/mutual-funds.json from live AMFI NAVAll.txt.
 * Preserves returns/aum/rating from the existing file when schemeCode or slug matches.
 *
 * Run: node scripts/node-with-ca.mjs scripts/refresh-mutual-funds-json.mjs
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchAMFINAVs } from './lib/authorized-sources.mjs';
import { isGarbageDisclosureFund } from './lib/holdings-name-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(ROOT, 'src', 'data', 'mutual-funds.json');
const BAK_PATH = `${OUT_PATH}.bak`;

function isPollutedMfRecord(fund) {
  const slug = String(fund.slug || '');
  if (/^monthly-samco-.+-as-on-/i.test(slug)) return true;
  if (isGarbageDisclosureFund(fund.name, slug)) return true;
  return false;
}

function loadExisting() {
  if (!existsSync(OUT_PATH)) return [];
  return JSON.parse(readFileSync(OUT_PATH, 'utf8'));
}

function indexExisting(records) {
  const byScheme = new Map();
  const bySlug = new Map();
  const byLooseName = new Map();
  for (const row of records) {
    if (isPollutedMfRecord(row)) continue;
    const sc = String(row.schemeCode || '').trim();
    if (sc && !byScheme.has(sc)) byScheme.set(sc, row);
    if (row.slug && !bySlug.has(row.slug)) bySlug.set(row.slug, row);
    const loose = looseDisclosureMatchKey(row.name);
    if (loose && !byLooseName.has(loose)) byLooseName.set(loose, row);
  }
  return { byScheme, bySlug, byLooseName };
}

function looseDisclosureMatchKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bfund\b/g, '')
    .replace(/children?s/g, 'children')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeRecord(amfiFund, existing) {
  const now = new Date().toISOString();
  const base = {
    name: amfiFund.name,
    slug: amfiFund.slug,
    category: amfiFund.category,
    nav: amfiFund.nav,
    schemeCode: amfiFund.schemeCode,
    lastUpdated: now,
  };
  if (!existing) {
    return {
      ...base,
      returns1y: null,
      returns3y: null,
      returns5y: null,
      aum: null,
      riskLevel: 'moderate',
      rating: null,
    };
  }
  return {
    name: existing.name || base.name,
    slug: existing.slug || base.slug,
    category: existing.category || base.category,
    nav: base.nav,
    schemeCode: base.schemeCode || existing.schemeCode || null,
    returns1y: existing.returns1y ?? null,
    returns3y: existing.returns3y ?? null,
    returns5y: existing.returns5y ?? null,
    aum: existing.aum ?? null,
    riskLevel: existing.riskLevel || 'moderate',
    rating: existing.rating ?? null,
    lastUpdated: now,
  };
}

async function main() {
  console.log('\n═══ Refresh mutual-funds.json from AMFI ═══\n');

  const existing = loadExisting();
  const { byScheme, bySlug, byLooseName } = indexExisting(existing);
  const amfiFunds = await fetchAMFINAVs();

  const merged = [];
  const seenSlug = new Set();
  const seenScheme = new Set();

  for (const amfiFund of amfiFunds) {
    const prior =
      byScheme.get(amfiFund.schemeCode) ||
      bySlug.get(amfiFund.slug) ||
      byLooseName.get(looseDisclosureMatchKey(amfiFund.name)) ||
      null;
    const row = mergeRecord(amfiFund, prior);
    if (isPollutedMfRecord(row)) continue;
    if (seenSlug.has(row.slug)) continue;
    seenSlug.add(row.slug);
    if (row.schemeCode) seenScheme.add(row.schemeCode);
    merged.push(row);
  }

  // Keep legacy enriched rows not present in today's AMFI feed (unchanged metadata).
  for (const row of existing) {
    if (isPollutedMfRecord(row)) continue;
    if (seenSlug.has(row.slug)) continue;
    const sc = String(row.schemeCode || '').trim();
    if (sc && seenScheme.has(sc)) continue;
    merged.push(row);
    seenSlug.add(row.slug);
  }

  merged.sort((a, b) => a.name.localeCompare(b.name));

  if (existsSync(OUT_PATH)) copyFileSync(OUT_PATH, BAK_PATH);
  writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2));

  const withNav = merged.filter((f) => f.nav != null && Number(f.nav) > 0).length;
  const withScheme = merged.filter((f) => f.schemeCode).length;

  console.log(`  ✅ Wrote ${merged.length} funds (${withNav} with NAV, ${withScheme} with schemeCode)`);
  console.log(`  ℹ Backup: ${existsSync(BAK_PATH) ? BAK_PATH : '(none)'}\n`);
}

main().catch((err) => {
  console.error('❌ refresh-mutual-funds-json failed:', err.message);
  process.exit(1);
});
