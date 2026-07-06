/**
 * ISIN / NSE / BSE cross-reference from local NSE & BSE bhavcopy files.
 * Used to backfill missing listing codes on fund holdings (no name matching).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvTextFromBytes } from './bhavcopy-price.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function bhavcopyDirs(cwd = process.cwd()) {
  const dirs = [];
  if (process.env.BHAVCOPY_DIR) dirs.push(process.env.BHAVCOPY_DIR);
  dirs.push(join(cwd, 'data', 'bhavcopy'));
  dirs.push(join(ROOT, 'data', 'bhavcopy'));
  return [...new Set(dirs)];
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function isIndianEquityIsin(isin) {
  const code = String(isin || '').trim().toUpperCase();
  return code.startsWith('INE') || code.startsWith('IN0');
}

function mergeListingRecord(existing, incoming) {
  const base = existing || { isin: '', nseSymbol: '', bseCode: '' };
  return {
    isin: base.isin || incoming.isin || '',
    nseSymbol: base.nseSymbol || incoming.nseSymbol || '',
    bseCode: base.bseCode || incoming.bseCode || '',
  };
}

function registerRecord(index, record) {
  const isin = String(record.isin || '').trim().toUpperCase();
  const nseSymbol = String(record.nseSymbol || '').trim().toUpperCase();
  const bseCode = String(record.bseCode || '').trim();
  if (!isin && !nseSymbol && !bseCode) return;

  const merged = { isin, nseSymbol, bseCode };
  if (isin) {
    index.byIsin.set(isin, mergeListingRecord(index.byIsin.get(isin), merged));
  }
  if (nseSymbol) {
    index.byNse.set(nseSymbol, mergeListingRecord(index.byNse.get(nseSymbol), merged));
  }
  if (bseCode) {
    index.byBse.set(bseCode, mergeListingRecord(index.byBse.get(bseCode), merged));
  }
}

function ingestUdiffBhavFile(filePath, index, { includeBseCode = false } = {}) {
  if (!filePath || !existsSync(filePath)) return 0;
  let text;
  try {
    text = csvTextFromBytes(readFileSync(filePath));
  } catch {
    return 0;
  }
  if (!text) return 0;

  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return 0;
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols[idx.Sgmt] && cols[idx.Sgmt] !== 'CM') continue;
    if (cols[idx.FinInstrmTp] && cols[idx.FinInstrmTp] !== 'STK') continue;

    const isin = String(cols[idx.ISIN] || '').trim().toUpperCase();
    if (!isIndianEquityIsin(isin)) continue;

    const nseSymbol = String(cols[idx.TckrSymb] || '').trim().toUpperCase();
    const bseRaw = String(cols[idx.FinInstrmId] || '').trim();
    const bseCode = includeBseCode && /^\d+$/.test(bseRaw) ? bseRaw : '';

    registerRecord(index, { isin, nseSymbol, bseCode });
    count += 1;
  }

  return count;
}

function collectBhavcopyPaths(exchange, cwd) {
  const paths = [];
  const sub = exchange === 'nse' ? 'nse' : 'bse';
  for (const base of bhavcopyDirs(cwd)) {
    const dir = join(base, sub);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = entry.isDirectory()
        ? join(dir, entry.name, entry.name)
        : join(dir, entry.name);
      if (!/BhavCopy/i.test(path)) continue;
      paths.push(path);
    }
  }
  paths.sort();
  return paths;
}

function findLatestBhavcopyFile(exchange, cwd = process.cwd()) {
  const paths = collectBhavcopyPaths(exchange, cwd);
  return paths.length ? paths[paths.length - 1] : null;
}

let cachedIndex = null;

/** @returns {{ byIsin: Map<string, {isin,nseSymbol,bseCode}>, byNse: Map, byBse: Map }} */
export function buildBhavcopyListingIndex(cwd = process.cwd()) {
  if (cachedIndex) return cachedIndex;

  const index = {
    byIsin: new Map(),
    byNse: new Map(),
    byBse: new Map(),
  };

  const nsePath = findLatestBhavcopyFile('nse', cwd);
  const bsePath = findLatestBhavcopyFile('bse', cwd);
  const nseRows = ingestUdiffBhavFile(nsePath, index, { includeBseCode: false });
  const bseRows = ingestUdiffBhavFile(bsePath, index, { includeBseCode: true });

  cachedIndex = index;
  cachedIndex.meta = { nsePath, bsePath, nseRows, bseRows };
  return cachedIndex;
}

export function clearBhavcopyListingCache() {
  cachedIndex = null;
}

export function fillListingFromBhavcopy(codes, index = null) {
  const idx = index || buildBhavcopyListingIndex();
  let isin = String(codes?.isin || '').trim().toUpperCase();
  let nseSymbol = String(codes?.nseSymbol || '').trim().toUpperCase();
  let bseCode = String(codes?.bseCode || '').trim();

  if (!isin && !nseSymbol && !bseCode) {
    return { isin: '', nseSymbol: '', bseCode: '' };
  }

  let hit = null;
  if (isin && idx.byIsin.has(isin)) hit = idx.byIsin.get(isin);
  else if (nseSymbol && idx.byNse.has(nseSymbol)) hit = idx.byNse.get(nseSymbol);
  else if (bseCode && idx.byBse.has(bseCode)) hit = idx.byBse.get(bseCode);

  if (!hit) return { isin, nseSymbol, bseCode };

  return {
    isin: isin || hit.isin || '',
    nseSymbol: nseSymbol || hit.nseSymbol || '',
    bseCode: bseCode || hit.bseCode || '',
  };
}

/** Serialize index for public/data/stock-bhavcopy-listings.json */
export function serializeBhavcopyListingIndex(index = null) {
  const idx = index || buildBhavcopyListingIndex();
  const mapToObj = (map) => Object.fromEntries(map);
  return {
    byIsin: mapToObj(idx.byIsin),
    byNse: mapToObj(idx.byNse),
    byBse: mapToObj(idx.byBse),
    meta: idx.meta || {},
  };
}

/** Add bhavcopy ISIN/NSE/BSE into slug maps when NSE symbol already maps to a slug. */
export function ingestBhavcopyIntoSlugMaps(isinMap, nseMap, bseMap) {
  const index = buildBhavcopyListingIndex();
  for (const [nse, rec] of index.byNse) {
    const slug = nseMap.get(nse);
    if (!slug) continue;
    if (rec.isin) {
      const code = String(rec.isin).trim().toUpperCase();
      if (code && !isinMap.has(code)) isinMap.set(code, slug);
    }
    if (!nseMap.has(nse)) nseMap.set(nse, slug);
    if (rec.bseCode) {
      const bse = String(rec.bseCode).trim();
      if (bse && !bseMap.has(bse)) bseMap.set(bse, slug);
    }
  }
  for (const [isin, rec] of index.byIsin) {
    let slug = isinMap.get(isin);
    if (!slug && rec.nseSymbol) slug = nseMap.get(rec.nseSymbol);
    if (!slug) continue;
    if (!isinMap.has(isin)) isinMap.set(isin, slug);
    if (rec.nseSymbol && !nseMap.has(rec.nseSymbol)) nseMap.set(rec.nseSymbol, slug);
    if (rec.bseCode && !bseMap.has(rec.bseCode)) bseMap.set(rec.bseCode, slug);
  }
}
