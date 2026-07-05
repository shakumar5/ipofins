#!/usr/bin/env node
/**
 * Build guard — signals list JSON must stay slim; HTML must not embed row data.
 * Run: node scripts/verify-signals-export.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { assertSlimListRow } from './lib/signal-export-utils.mjs';
import { publicDataMissingRequirements } from './lib/dist-data-sync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DATA_DIR = join(ROOT, 'public', 'data');
const DATA_DIR = join(PUBLIC_DATA_DIR, 'smart-money-signals');
const INDEX_PATH = join(PUBLIC_DATA_DIR, 'smart-money-signals-index.json');
const SECTOR_PATH = join(PUBLIC_DATA_DIR, 'sector-intelligence.json');
const TRACKER_INDEX_PATH = join(PUBLIC_DATA_DIR, 'smart-money-tracker-index.json');
const DIST_DIR = join(ROOT, 'dist');
const DIST_DATA_DIR = join(DIST_DIR, 'data');

const MAX_LIST_FILE_KB = 350;
const FORBIDDEN_HTML = ['smart-money-signals-data-bootstrap', 'data-json="{"months"'];

let errors = [];

function fail(msg) {
  errors.push(msg);
}

for (const req of publicDataMissingRequirements(ROOT)) {
  fail(`Missing ${req} — run export:client-data or restore CI cache`);
}

if (existsSync(INDEX_PATH)) {
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  if (index.dataTier !== 'list+detail+search') {
    fail(`Index dataTier must be "list+detail+search" (got ${index.dataTier ?? 'missing'})`);
  }
}

if (existsSync(SECTOR_PATH)) {
  const sector = JSON.parse(readFileSync(SECTOR_PATH, 'utf8'));
  if (!Array.isArray(sector.rows) || sector.rows.length === 0) {
    fail('sector-intelligence.json has no rows');
  }
}

if (existsSync(DATA_DIR)) {
  for (const name of readdirSync(DATA_DIR)) {
    if (!name.endsWith('.json') || name.includes('--detail') || name.includes('--search')) continue;

    const full = join(DATA_DIR, name);
    const kb = readFileSync(full).length / 1024;
    if (kb > MAX_LIST_FILE_KB) {
      fail(`List file too large: ${name} (${kb.toFixed(0)} KB > ${MAX_LIST_FILE_KB} KB)`);
    }

    const payload = JSON.parse(readFileSync(full, 'utf8'));
    for (const row of payload.rows || []) {
      try {
        assertSlimListRow(row, name);
      } catch (e) {
        fail(String(e.message || e));
      }
    }
  }
}

if (existsSync(DIST_DIR)) {
  const distRequired = [
    'smart-money-signals-index.json',
    'sector-intelligence.json',
    'smart-money-tracker-index.json',
  ];
  if (existsSync(DIST_DATA_DIR)) {
    for (const name of distRequired) {
      if (!existsSync(join(DIST_DATA_DIR, name))) {
        fail(`dist/data/${name} missing after build — public/data not copied to dist`);
      }
    }
    const distSignalsDir = join(DIST_DATA_DIR, 'smart-money-signals');
    if (!existsSync(distSignalsDir) || readdirSync(distSignalsDir).filter((n) => n.endsWith('.json')).length === 0) {
      fail('dist/data/smart-money-signals/ missing or empty after build');
    }
  } else {
    fail('dist/data/ missing after build');
  }

  const smDir = join(DIST_DIR, 'mutual-funds', 'smart-money');
  if (existsSync(smDir)) {
    const sampleHtml = [];
    function walk(dir, depth = 0) {
      if (depth > 4 || sampleHtml.length > 50) return;
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (name.endsWith('.html')) sampleHtml.push(p);
        else if (existsSync(p) && !name.includes('.')) walk(p, depth + 1);
      }
    }
    walk(smDir);

    for (const htmlPath of sampleHtml) {
      const html = readFileSync(htmlPath, 'utf8');
      for (const token of FORBIDDEN_HTML) {
        if (html.includes(token)) {
          fail(`Built HTML embeds signal row data: ${htmlPath.replace(ROOT, '')} (${token})`);
          break;
        }
      }
    }
  }
}

if (errors.length) {
  console.error('\n  Signals export verification FAILED:\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

console.log('  ✓ Signals export verification passed (slim list tier, no HTML row embed)');
