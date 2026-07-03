#!/usr/bin/env node
/**
 * Build guard — top-stocks.json must exist in public/data for /data/top-stocks.json.
 * Run: node scripts/verify-top-stocks-export.mjs
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  readTopStocksFromDisk,
  topStocksPayloadHasData,
  TOP_STOCKS_JSON_PATH,
} from './lib/finalize-top-stocks-export.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_PATH = join(ROOT, 'dist', 'data', 'top-stocks.json');

let errors = [];
let warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

if (!existsSync(TOP_STOCKS_JSON_PATH)) {
  fail('Missing public/data/top-stocks.json — run export or finalize-top-stocks-export');
} else {
  const payload = readTopStocksFromDisk();
  if (!payload?.periods || !payload?.buckets) {
    fail('top-stocks.json is missing periods or buckets');
  } else if (!topStocksPayloadHasData(payload)) {
    warn('top-stocks.json has no flow rows (hasData=false) — /top-stocks may rely on build-time DB');
  }
}

if (existsSync(join(ROOT, 'dist')) && !existsSync(DIST_PATH)) {
  fail('dist/data/top-stocks.json missing — static /data/top-stocks.json will 404 after deploy');
}

if (warnings.length) {
  console.warn('\n  Top Stocks export warnings:\n');
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  console.warn('');
}

if (errors.length) {
  console.error('\n  Top Stocks export verification FAILED:\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

console.log('  ✓ Top Stocks export verification passed (top-stocks.json on disk)');