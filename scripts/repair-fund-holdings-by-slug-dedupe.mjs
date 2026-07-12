#!/usr/bin/env node
/**
 * One-shot: dedupe fund-holdings-by-slug/*.json by ISIN→NSE→BSE (keep higher pct).
 * Then re-reconcile meta/hub counts. Use before validate:mf-holdings-quality when
 * stale exports contain duplicate listing rows.
 *
 * Run: npm run repair:fund-holdings-by-slug-dedupe
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dedupeMappedHoldingsByListing } from './lib/fund-holdings-by-slug-write.mjs';
import { nodeExtraArgs } from './lib/node-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BY_SLUG = join(ROOT, 'public', 'data', 'fund-holdings-by-slug');

if (!existsSync(BY_SLUG)) {
  console.error('Missing fund-holdings-by-slug/');
  process.exit(1);
}

let filesTouched = 0;
let rowsRemoved = 0;

for (const fileName of readdirSync(BY_SLUG)) {
  if (!fileName.endsWith('.json')) continue;
  const path = join(BY_SLUG, fileName);
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    continue;
  }
  const stocks = Array.isArray(data.stocks) ? data.stocks : [];
  if (stocks.length < 2) continue;

  const deduped = dedupeMappedHoldingsByListing(stocks);
  if (deduped.length === stocks.length) continue;

  rowsRemoved += stocks.length - deduped.length;
  data.stocks = deduped;
  writeFileSync(path, JSON.stringify(data));
  filesTouched++;
}

console.log(`  ✓ Deduped ${filesTouched} file(s), removed ${rowsRemoved} duplicate row(s)`);

const reconcile = join(ROOT, 'scripts', 'reconcile-holdings-meta.mjs');
const result = spawnSync(process.execPath, [...nodeExtraArgs(), reconcile], {
  stdio: 'inherit',
  cwd: ROOT,
});
if ((result.status ?? 1) !== 0) {
  console.error('reconcile-holdings-meta failed after dedupe');
  process.exit(1);
}

console.log('  ✓ Ready — run npm run validate:mf-holdings-quality');
