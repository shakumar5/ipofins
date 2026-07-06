#!/usr/bin/env node
/**
 * Recompute signal + signalEmoji on exported smart-money-signals JSON
 * using the same deriveSignal rules as the app runtime.
 *
 * Run: node scripts/reconcile-signal-labels.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deriveSignal } from './lib/smart-money-signals-core.mjs';
import { signalSearchFileName } from './lib/signal-export-utils.mjs';

const root = process.cwd();
const signalsDir = join(root, 'public', 'data', 'smart-money-signals');
const indexPath = join(root, 'public', 'data', 'smart-money-signals-index.json');

if (!existsSync(indexPath)) {
  console.error('Missing smart-money-signals-index.json');
  process.exit(1);
}

const index = JSON.parse(readFileSync(indexPath, 'utf8'));
let filesUpdated = 0;
let rowsUpdated = 0;

function relabelRow(row) {
  const flow = row.netBuying ?? 0;
  const weight = row.netWeightChangePct ?? 0;
  const { signal, emoji } = deriveSignal(row.convictionScore ?? 0, flow, weight);
  if (row.signal === signal && row.signalEmoji === emoji) return false;
  row.signal = signal;
  row.signalEmoji = emoji;
  return true;
}

for (const file of readdirSync(signalsDir)) {
  if (!file.endsWith('.json') || file.includes('--detail') || file.includes('--search')) continue;
  const path = join(signalsDir, file);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data.rows)) continue;
  let changed = 0;
  for (const row of data.rows) {
    if (relabelRow(row)) changed++;
  }
  if (changed) {
    writeFileSync(path, JSON.stringify(data));
    filesUpdated++;
    rowsUpdated += changed;
    console.log(`  ${file}: ${changed} row(s)`);
  }
}

for (const month of index.months || []) {
  const monthSlug = String(month).toLowerCase().replace(/\s+/g, '-');
  const signalBySlug = new Map();

  for (const cat of index.categories || []) {
    const catSlug = String(cat).toLowerCase().replace(/\s+/g, '-');
    const chunkPath = join(signalsDir, `${monthSlug}--${catSlug}.json`);
    if (!existsSync(chunkPath)) continue;
    const chunk = JSON.parse(readFileSync(chunkPath, 'utf8'));
    for (const row of chunk.rows || []) {
      signalBySlug.set(row.stockSlug, row.signal);
    }
  }

  const searchPath = join(signalsDir, signalSearchFileName(month));
  if (!existsSync(searchPath)) continue;
  const search = JSON.parse(readFileSync(searchPath, 'utf8'));
  if (!Array.isArray(search.stocks)) continue;
  let changed = 0;
  for (const row of search.stocks) {
    const signal = signalBySlug.get(row.stockSlug);
    if (signal && row.signal !== signal) {
      row.signal = signal;
      changed++;
    }
  }
  if (changed) {
    writeFileSync(searchPath, JSON.stringify(search));
    console.log(`  ${signalSearchFileName(month)}: ${changed} search row(s)`);
    filesUpdated++;
    rowsUpdated += changed;
  }
}

console.log(`Done — ${rowsUpdated} label(s) updated across ${filesUpdated} file(s).`);
