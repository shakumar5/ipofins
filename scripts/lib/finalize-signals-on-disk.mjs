/**
 * Reslim cached smart-money signal list JSON to match current export schema.
 * Used when CI restores public/data from cache but skips full Neon export.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  assertSlimListRow,
  monthFileSlug,
  searchIndexEntry,
  signalSearchFileName,
  slimSignalRow,
} from './signal-export-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const INDEX_PATH = join(OUT_DIR, 'smart-money-signals-index.json');
const SIGNALS_DIR = join(OUT_DIR, 'smart-money-signals');

function reslimAllSignalListFiles(dir) {
  let changed = 0;

  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json') || name.includes('--detail') || name.includes('--search')) continue;

    const listPath = join(dir, name);
    const payload = JSON.parse(readFileSync(listPath, 'utf8'));
    const listRows = (payload.rows || []).map(slimSignalRow);
    for (const row of listRows) {
      assertSlimListRow(row, name);
    }

    const next = JSON.stringify({ month: payload.month, category: payload.category, rows: listRows });
    const prev = readFileSync(listPath, 'utf8');
    if (prev !== next) changed += 1;
    writeFileSync(listPath, next);
  }

  return changed;
}

function rebuildSearchIndexes(index) {
  if (!existsSync(SIGNALS_DIR)) return;

  for (const month of index.months || []) {
    const searchBySlug = new Map();

    for (const name of readdirSync(SIGNALS_DIR)) {
      if (!name.endsWith('.json') || name.includes('--detail') || name.includes('--search')) continue;
      if (!name.startsWith(`${monthFileSlug(month)}--`)) continue;

      const payload = JSON.parse(readFileSync(join(SIGNALS_DIR, name), 'utf8'));
      for (const row of payload.rows || []) {
        const entry = searchIndexEntry(row, {
          month: payload.month ?? month,
          category: payload.category,
        });
        const prev = searchBySlug.get(row.stockSlug);
        if (!prev || entry.convictionScore > prev.convictionScore) {
          searchBySlug.set(row.stockSlug, entry);
        }
      }
    }

    if (!searchBySlug.size) continue;

    const searchRel = join('smart-money-signals', signalSearchFileName(month));
    writeFileSync(
      join(OUT_DIR, searchRel),
      JSON.stringify({
        month,
        stocks: [...searchBySlug.values()].sort((a, b) => b.convictionScore - a.convictionScore),
      }),
    );
  }
}

/** @returns {number} count of list files rewritten */
export function finalizeSignalsOnDisk() {
  if (!existsSync(INDEX_PATH) || !existsSync(SIGNALS_DIR)) {
    console.log('  ℹ finalize-signals-on-disk: no smart-money-signals index — skip');
    return 0;
  }

  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  const changed = reslimAllSignalListFiles(SIGNALS_DIR);
  rebuildSearchIndexes(index);

  if (changed) {
    console.log(`  ✓ reslimmed ${changed} smart-money signal list file(s) for current export schema`);
  } else {
    console.log('  ✓ smart-money signal list files already match current export schema');
  }

  return changed;
}
