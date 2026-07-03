/**
 * Ensure public/data/top-stocks.json exists and is populated when export was skipped.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { ensureMarketCapCategories } from './backfill-market-cap-category.mjs';
import { buildTopStocksExport } from './top-stocks-export.mjs';
import { isDbConfigured, sql, withDbRetry } from './db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TOP_STOCKS_JSON_PATH = join(ROOT, 'public', 'data', 'top-stocks.json');

export const EMPTY_TOP_STOCKS = {
  periods: { mutual_funds: '', super_investors: '', dii_fii: '', one_percent_club: '' },
  buckets: {},
  hasData: false,
};

export function topStocksPayloadHasData(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.hasData) return true;
  return Object.values(payload.buckets ?? {}).some((rows) => Array.isArray(rows) && rows.length > 0);
}

export function readTopStocksFromDisk(path = TOP_STOCKS_JSON_PATH) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function writeTopStocksJson(payload, path = TOP_STOCKS_JSON_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload));
}

export async function exportTopStocksFromDb() {
  if (!isDbConfigured()) return { ...EMPTY_TOP_STOCKS };

  const capBackfill = await withDbRetry(() => ensureMarketCapCategories(sql), {
    label: 'market cap categories',
  });
  if (!capBackfill.skipped) {
    console.log(
      `  market cap backfill: ${capBackfill.classified} stocks (updated ${capBackfill.updated ?? 0})`,
    );
  }

  return withDbRetry(() => buildTopStocksExport(sql), { label: 'Top Stocks export' });
}

/** @returns {boolean} true when file was written or refreshed from DB */
export async function finalizeTopStocksExport() {
  const existing = readTopStocksFromDisk();
  if (topStocksPayloadHasData(existing)) {
    console.log('  ✓ top-stocks.json already populated');
    return false;
  }

  if (!isDbConfigured()) {
    if (!existsSync(TOP_STOCKS_JSON_PATH)) {
      writeTopStocksJson(EMPTY_TOP_STOCKS);
      console.log('  ℹ top-stocks.json — wrote empty stub (no DATABASE_URL)');
    } else {
      console.log('  ℹ top-stocks.json present but empty — skip (no DATABASE_URL)');
    }
    return false;
  }

  try {
    const payload = await exportTopStocksFromDb();
    writeTopStocksJson(payload);
    if (topStocksPayloadHasData(payload)) {
      const buckets = Object.values(payload.buckets).filter((rows) => rows.length).length;
      console.log(`  ✓ top-stocks.json exported (${buckets} non-empty buckets)`);
    } else {
      console.log('  ⚠ top-stocks.json exported but hasData=false (no qualifying flow rows)');
    }
    return true;
  } catch (err) {
    if (!existsSync(TOP_STOCKS_JSON_PATH)) {
      writeTopStocksJson(EMPTY_TOP_STOCKS);
      console.log('  ℹ top-stocks.json — wrote empty stub after export failure');
    }
    console.warn('  ⚠ Top Stocks finalize failed:', err.message);
    return false;
  }
}