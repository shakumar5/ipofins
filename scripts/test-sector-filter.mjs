#!/usr/bin/env node
/** Golden tests for isValidEquitySector / filterTrackerSectorOptions. */
import { isValidEquitySector, filterTrackerSectorOptions } from './lib/stock-utils.mjs';

const INVALID = [
  '0.1413',
  '0.2604',
  '12.5%',
  'N.A.',
  'NA',
  'SOV',
  'Stock Future',
  'Foreign Security',
  'Foreign Mutual Fund',
  'Overseas Mutual Fund',
  'Mutual Fund',
  'Treasury Bill',
  'CRISIL AAA',
];

const VALID = [
  'Banks',
  'Capital Markets',
  'Pharmaceuticals & Biotechnology',
  'IT - Software',
  'Auto Components',
  'Unknown',
];

let failed = 0;

for (const s of INVALID) {
  if (isValidEquitySector(s)) {
    console.error(`  ✗ should reject: ${s}`);
    failed++;
  }
}

for (const s of VALID) {
  if (!isValidEquitySector(s)) {
    console.error(`  ✗ should accept: ${s}`);
    failed++;
  }
}

const filtered = filterTrackerSectorOptions(['All', 'Banks', '0.1413', 'SOV', 'IT - Software']);
if (filtered.join('|') !== 'All|Banks|IT - Software') {
  console.error(`  ✗ filterTrackerSectorOptions got: ${filtered.join('|')}`);
  failed++;
}

if (failed) {
  console.error(`\n  Sector filter tests FAILED (${failed})\n`);
  process.exit(1);
}

console.log('  ✓ Sector filter tests passed');
