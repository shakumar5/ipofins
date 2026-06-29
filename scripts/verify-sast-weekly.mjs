#!/usr/bin/env node
/**
 * Guards for the weekly SAST CI workflow.
 *
 *   node scripts/verify-sast-weekly.mjs cache   - client JSON from export cache (before SAST export)
 *   node scripts/verify-sast-weekly.mjs export  - sast-updates*.json after export:sast-updates
 *   node scripts/verify-sast-weekly.mjs dist    - SAST JSON copied into dist/ after build
 */
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const DIST_DATA_DIR = join(ROOT, 'dist', 'data');

const CLIENT_CACHE_FILES = [
  'smart-money-signals-index.json',
  'sector-intelligence.json',
  'smart-money-tracker-index.json',
];

const SAST_FILES = ['sast-updates.json', 'sast-updates-curated.json'];

const phase = process.argv[2] || 'all';
const errors = [];

function fail(msg) {
  errors.push(msg);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`${label}: invalid JSON (${e.message})`);
    return null;
  }
}

function assertClientCache() {
  console.log('  Checking exported client data cache...');
  for (const name of CLIENT_CACHE_FILES) {
    const path = join(DATA_DIR, name);
    if (!existsSync(path)) {
      fail(`Missing ${name} - restore export cache or run a main deploy first (export:client-data)`);
    }
  }

  const indexPath = join(DATA_DIR, CLIENT_CACHE_FILES[0]);
  if (existsSync(indexPath)) {
    const index = readJson(indexPath, CLIENT_CACHE_FILES[0]);
    if (index && index.dataTier !== 'list+detail+search') {
      fail('smart-money-signals-index.json dataTier must be "list+detail+search"');
    }
  }

  const signalsDir = join(DATA_DIR, 'smart-money-signals');
  if (!existsSync(signalsDir)) {
    fail('Missing public/data/smart-money-signals/ - export cache incomplete');
  }
}

function assertSastExport() {
  console.log('  Checking SAST export files...');
  for (const name of SAST_FILES) {
    const path = join(DATA_DIR, name);
    if (!existsSync(path)) {
      fail(`Missing ${name} - run npm run export:sast-updates`);
      continue;
    }

    const payload = readJson(path, name);
    if (!payload) continue;

    if (typeof payload.generatedAt !== 'string' || !payload.generatedAt) {
      fail(`${name}: missing generatedAt`);
    }
    if (!Array.isArray(payload.items)) {
      fail(`${name}: items must be an array`);
      continue;
    }

    for (const item of payload.items.slice(0, 5)) {
      if (!item.id || !item.filingDate || !item.filerName) {
        fail(`${name}: item missing id, filingDate, or filerName`);
        break;
      }
    }
  }

  const curatedPath = join(DATA_DIR, 'sast-updates-curated.json');
  if (existsSync(curatedPath)) {
    const curated = readJson(curatedPath, 'sast-updates-curated.json');
    if (curated && Array.isArray(curated.items)) {
      const bad = curated.items.find((i) => !i.isCuratedMatch);
      if (bad) fail('sast-updates-curated.json contains non-curated items');
    }
  }
}

function assertSastDist() {
  console.log('  Checking SAST files in dist/...');
  for (const name of SAST_FILES) {
    const path = join(DIST_DATA_DIR, name);
    if (!existsSync(path)) {
      fail(`dist/data/${name} missing - public/data not copied during build`);
    }
  }
}

const phases = {
  cache: assertClientCache,
  export: assertSastExport,
  dist: assertSastDist,
  all: () => {
    assertClientCache();
    assertSastExport();
    assertSastDist();
  },
};

const run = phases[phase];
if (!run) {
  console.error(`Unknown phase "${phase}". Use: cache | export | dist | all`);
  process.exit(1);
}

console.log(`\n  verify-sast-weekly (${phase})\n`);
run();

if (errors.length) {
  console.error('\n  SAST weekly verification FAILED:\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`  ✓ SAST weekly verification passed (${phase})\n`);
