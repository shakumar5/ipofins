/**
 * AMFI average market-cap Excel (SEBI cap buckets).
 * Source: https://www.amfiindia.com/research-information/other-data/average-market-cap
 *
 * Columns: Sr. No., Company name, ISIN, BSE Symbol, NSE Symbol, avg mcap (Cr), SEBI category.
 */

import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { slugify } from './ipo-utils.mjs';
import { rankToMarketCapCategory } from './market-cap-buckets.mjs';

export { rankToMarketCapCategory };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const AMFI_MARKET_CAP_DIR = join(ROOT, 'data', 'amfi-excel');

const HEADER_MARKERS = {
  rank: 'sr. no.',
  name: 'company name',
  isin: 'isin',
  bseSymbol: 'bse symbol',
  nseSymbol: 'nse symbol',
  avgMarketCapCr: 'average of all exchanges',
  amfiCategory: 'categorization as per sebi',
};

function normSymbol(value) {
  const s = String(value ?? '').trim().toUpperCase();
  return s && s !== '-' ? s : null;
}

function normIsin(value) {
  const s = String(value ?? '').trim().toUpperCase();
  return s.startsWith('INE') ? s : null;
}

function findHeaderRow(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const lower = row.map((c) => String(c ?? '').trim().toLowerCase());
    if (lower.some((c) => c === HEADER_MARKERS.rank) && lower.some((c) => c === HEADER_MARKERS.isin)) {
      return i;
    }
  }
  return -1;
}

function columnIndex(headerRow, marker) {
  const lower = headerRow.map((c) => String(c ?? '').trim().toLowerCase());
  return lower.findIndex((c) => c.startsWith(marker));
}

/**
 * @param {string} [filePath]
 * @returns {Array<{
 *   rank: number,
 *   name: string,
 *   isin: string,
 *   bseSymbol: string | null,
 *   nseSymbol: string | null,
 *   avgMarketCapCr: number | null,
 *   amfiCategory: string | null,
 *   marketCapCategory: string | null,
 *   slug: string,
 * }>}
 */
export function parseAmfiMarketCapFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerIdx = findHeaderRow(matrix);
  if (headerIdx < 0) throw new Error(`AMFI market-cap header row not found in ${filePath}`);

  const header = matrix[headerIdx];
  const idx = {
    rank: columnIndex(header, HEADER_MARKERS.rank),
    name: columnIndex(header, HEADER_MARKERS.name),
    isin: columnIndex(header, HEADER_MARKERS.isin),
    bseSymbol: columnIndex(header, HEADER_MARKERS.bseSymbol),
    nseSymbol: columnIndex(header, HEADER_MARKERS.nseSymbol),
    avgMarketCapCr: columnIndex(header, HEADER_MARKERS.avgMarketCapCr),
    amfiCategory: columnIndex(header, HEADER_MARKERS.amfiCategory),
  };
  if (idx.isin < 0 || idx.name < 0 || idx.rank < 0) {
    throw new Error(`AMFI market-cap required columns missing in ${filePath}`);
  }

  const rows = [];
  const seenIsin = new Set();

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!Array.isArray(line)) continue;

    const isin = normIsin(line[idx.isin]);
    const name = String(line[idx.name] ?? '').trim();
    const rank = Number(line[idx.rank]);
    if (!isin || !name || !Number.isFinite(rank)) continue;
    if (seenIsin.has(isin)) continue;
    seenIsin.add(isin);

    const avgRaw = idx.avgMarketCapCr >= 0 ? Number(line[idx.avgMarketCapCr]) : NaN;
    const amfiCategory =
      idx.amfiCategory >= 0 ? String(line[idx.amfiCategory] ?? '').trim() || null : null;

    rows.push({
      rank,
      name,
      isin,
      bseSymbol: idx.bseSymbol >= 0 ? normSymbol(line[idx.bseSymbol]) : null,
      nseSymbol: idx.nseSymbol >= 0 ? normSymbol(line[idx.nseSymbol]) : null,
      avgMarketCapCr: Number.isFinite(avgRaw) ? avgRaw : null,
      amfiCategory,
      marketCapCategory: rankToMarketCapCategory(rank),
      slug: slugify(name),
    });
  }

  const bySlug = new Map();
  for (const row of rows) {
    const prev = bySlug.get(row.slug);
    if (!prev || row.rank < prev.rank) bySlug.set(row.slug, row);
  }
  return [...bySlug.values()];
}

/** Newest AverageMarketCapitalization*.xlsx in data/amfi-excel. */
export function findLatestAmfiMarketCapFile(dir = AMFI_MARKET_CAP_DIR) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => /^AverageMarketCapitalization.+\.xlsx$/i.test(f))
    .sort()
    .reverse();
  if (!files.length) return null;
  return join(dir, files[0]);
}

export function loadLatestAmfiMarketCapRows() {
  const file = findLatestAmfiMarketCapFile();
  if (!file) return { file: null, rows: [] };
  return { file, rows: parseAmfiMarketCapFile(file) };
}
