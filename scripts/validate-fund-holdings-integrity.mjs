#!/usr/bin/env node
/**
 * Fail when fund holdings on disk are internally inconsistent.
 * Hard gate (Phase A): meta stockCounts must equal by-slug stocks.length.
 * Listing-code policy is enforced by validate:holdings-listing-codes.
 * Incomplete equity weight sums are warnings (data quality), not deploy blockers.
 *
 * Run: npm run validate:fund-holdings-integrity
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isInternationalEquityFund } from './lib/listing-codes.mjs';

const ROOT = process.cwd();
const BY_SLUG = join(ROOT, 'public', 'data', 'fund-holdings-by-slug');
const META_PATH = join(ROOT, 'public', 'data', 'fund-holdings-meta.json');
const ALIASES_PATH = join(ROOT, 'public', 'data', 'fund-holdings-aliases.json');
const HUB_ALL = join(ROOT, 'public', 'data', 'mf-hub', 'all.json');

if (!existsSync(BY_SLUG)) {
  console.error('Missing fund-holdings-by-slug/');
  process.exit(1);
}

const meta = existsSync(META_PATH) ? JSON.parse(readFileSync(META_PATH, 'utf-8')) : { stockCounts: {} };
const aliases = existsSync(ALIASES_PATH) ? JSON.parse(readFileSync(ALIASES_PATH, 'utf-8')) : {};

const bySlugCounts = {};
for (const fileName of readdirSync(BY_SLUG)) {
  if (!fileName.endsWith('.json')) continue;
  const slug = fileName.replace(/\.json$/, '');
  const data = JSON.parse(readFileSync(join(BY_SLUG, fileName), 'utf-8'));
  bySlugCounts[slug] = Array.isArray(data.stocks) ? data.stocks.length : 0;
}

function resolveFileCount(slug) {
  const base = slug.replace(/-holdings$/, '');
  const fileSlug = aliases[base] || aliases[slug] || base;
  return bySlugCounts[fileSlug] ?? bySlugCounts[base] ?? bySlugCounts[slug] ?? 0;
}

let errors = 0;
let warnings = 0;

for (const [slug, metaCount] of Object.entries(meta.stockCounts || {})) {
  const fileCount = resolveFileCount(slug);
  if (fileCount > 0 && Number(metaCount) !== fileCount) {
    console.error(`  ✗ count mismatch ${slug}: meta=${metaCount} file=${fileCount}`);
    errors++;
  }
}

if (existsSync(HUB_ALL)) {
  try {
    const hubRows = JSON.parse(readFileSync(HUB_ALL, 'utf-8'));
    if (Array.isArray(hubRows)) {
      for (const row of hubRows) {
        if (!row?.hasHoldings || !row.detailSlug) continue;
        const detailSlug = String(row.detailSlug);
        // A1: hub stockCount must equal detailSlug by-slug file length (not alias redirects).
        const fileCount = bySlugCounts[detailSlug] ?? 0;
        const hubCount = Number(row.stockCount) || 0;
        if (fileCount > 0 && hubCount !== fileCount) {
          console.error(
            `  ✗ hub count mismatch ${detailSlug}: hub=${hubCount} file=${fileCount}`,
          );
          errors++;
        }
        if (fileCount <= 0) {
          console.error(`  ✗ hub hasHoldings but missing by-slug file: ${detailSlug}`);
          errors++;
        }
      }
    }
  } catch {
    // ignore unreadable hub
  }
}

for (const fileName of readdirSync(BY_SLUG)) {
  if (!fileName.endsWith('.json')) continue;
  const slug = fileName.replace(/\.json$/, '');
  const data = JSON.parse(readFileSync(join(BY_SLUG, fileName), 'utf-8'));
  const stocks = data.stocks || [];
  if (!stocks.length) continue;

  const international = isInternationalEquityFund(slug);
  let pctSum = 0;
  for (const row of stocks) {
    pctSum += Number(row.pct) || 0;
  }

  if (pctSum > 0 && !international && stocks.length >= 20) {
    const isEquityOnly = pctSum >= 70 && pctSum <= 115;
    if (!isEquityOnly && pctSum < 50) {
      console.warn(`  ⚠ ${slug}: equity weights sum to ${pctSum.toFixed(1)}% (incomplete portfolio)`);
      warnings++;
    }
  }
}

if (warnings) {
  console.warn(`\n  ${warnings} completeness warning(s) — not blocking deploy`);
}

if (errors) {
  console.error(`\nvalidate:fund-holdings-integrity failed with ${errors} issue(s).`);
  process.exit(1);
}

console.log(`  ✓ fund holdings integrity OK (${Object.keys(bySlugCounts).length} files)`);
