#!/usr/bin/env node
/**
 * Build guard — signals list JSON must stay slim; HTML must not embed row data.
 * Run: node scripts/verify-signals-export.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { assertSlimListRow } from './lib/signal-export-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'public', 'data', 'smart-money-signals');
const INDEX_PATH = join(ROOT, 'public', 'data', 'smart-money-signals-index.json');
const DIST_DIR = join(ROOT, 'dist');

const MAX_LIST_FILE_KB = 350;
const FORBIDDEN_HTML = ['smart-money-signals-data-bootstrap', 'data-json="{"months"'];

let errors = [];

function fail(msg) {
  errors.push(msg);
}

if (!existsSync(INDEX_PATH)) {
  fail('Missing smart-money-signals-index.json — run export:client-data');
} else {
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  if (index.dataTier !== 'list+detail+search') {
    fail(`Index dataTier must be "list+detail+search" (got ${index.dataTier ?? 'missing'})`);
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
