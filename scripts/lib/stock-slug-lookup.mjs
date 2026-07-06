/**
 * Stock listing (ISIN / NSE / BSE) → slug lookups for fund holdings links.
 * Do not resolve slugs from stock names.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildBhavcopyListingIndex,
  fillListingFromBhavcopy,
  ingestBhavcopyIntoSlugMaps,
  serializeBhavcopyListingIndex,
} from './bhavcopy-listings.mjs';
import { stockNameLookupKeys } from './stock-utils.mjs';

const OUT_DIR = join(process.cwd(), 'public', 'data');

function ingestListing(map, key, slug) {
  const code = String(key || '').trim();
  const s = String(slug || '').trim();
  if (!code || !s || map.has(code)) return;
  map.set(code, s);
}

function ingestJsonIndex(map, filePath, normalizeKey = (k) => String(k || '').trim().toUpperCase()) {
  if (!existsSync(filePath)) return;
  try {
    const index = JSON.parse(readFileSync(filePath, 'utf-8'));
    for (const [key, slug] of Object.entries(index)) {
      ingestListing(map, normalizeKey(key), slug);
    }
  } catch {
    /* ignore */
  }
}

function ingestStockNameSlug(map, stockSlug, stockName) {
  if (!stockSlug || !stockName) return;
  for (const key of stockNameLookupKeys(stockName)) {
    if (key && !map.has(key)) map.set(key, stockSlug);
  }
}

function ingestSignalPayloadNse(map, parsed) {
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.stocks)
      ? parsed.stocks
      : Array.isArray(parsed?.rows)
        ? parsed.rows
        : [];
  for (const row of rows) {
    const nse = String(row?.nseSymbol || row?.nse_symbol || '').trim().toUpperCase();
    const slug = String(row?.stockSlug || '').trim();
    if (nse && slug) ingestListing(map, nse, slug);
  }
}

function ingestBhavcopyListings(isinMap, nseMap, bseMap) {
  ingestBhavcopyIntoSlugMaps(isinMap, nseMap, bseMap);
}

function ingestFundHoldingsJsonListings(isinMap, nseMap, bseMap) {
  const path = join(process.cwd(), 'src', 'data', 'fund-holdings.json');
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    for (const fund of Object.values(raw.holdings || {})) {
      for (const [key, val] of Object.entries(fund)) {
        if (key === 'name' || key === 'amc') continue;
        const rows = Array.isArray(val) ? val : val?.stocks || [];
        for (const row of rows) {
          const isin = String(row.isin || '').trim().toUpperCase();
          const nse = String(row.nseSymbol || row.nse_symbol || '').trim().toUpperCase();
          const bse = String(row.bseCode || row.bse_code || '').trim();
          const slug = String(row.stockSlug || '').trim();
          if (!slug) continue;
          if (isin) ingestListing(isinMap, isin, slug);
          if (nse) ingestListing(nseMap, nse, slug);
          if (bse) ingestListing(bseMap, bse, slug);
        }
      }
    }
  } catch {
    /* ignore */
  }
}

function ingestFundHoldingsBySlugListings(isinMap, nseMap, bseMap) {
  const dir = join(OUT_DIR, 'fund-holdings-by-slug');
  if (!existsSync(dir)) return;
  try {
    for (const fileName of readdirSync(dir)) {
      if (!fileName.endsWith('.json')) continue;
      const stocks = JSON.parse(readFileSync(join(dir, fileName), 'utf-8'))?.stocks;
      if (!Array.isArray(stocks)) continue;
      for (const row of stocks) {
        const isin = String(row.isin || '').trim().toUpperCase();
        const nse = String(row.nseSymbol || row.nse_symbol || '').trim().toUpperCase();
        const bse = String(row.bseCode || row.bse_code || '').trim();
        const slug = String(row.stockSlug || '').trim();
        if (!slug) continue;
        if (isin) ingestListing(isinMap, isin, slug);
        if (nse) ingestListing(nseMap, nse, slug);
        if (bse) ingestListing(bseMap, bse, slug);
      }
    }
  } catch {
    /* ignore */
  }
}

export function buildStockNameSlugLookupFromDisk(cwd = process.cwd()) {
  const map = new Map();
  const dataDir = join(cwd, 'public', 'data');
  const topPath = join(dataDir, 'top-stocks.json');
  if (existsSync(topPath)) {
    try {
      const top = JSON.parse(readFileSync(topPath, 'utf-8'));
      for (const rows of Object.values(top.buckets || {})) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) ingestStockNameSlug(map, row.stockSlug, row.stockName);
      }
    } catch {
      /* ignore */
    }
  }
  const signalsDir = join(dataDir, 'smart-money-signals');
  if (existsSync(signalsDir)) {
    for (const fileName of readdirSync(signalsDir)) {
      if (!fileName.endsWith('.json') || fileName.includes('--detail')) continue;
      try {
        const parsed = JSON.parse(readFileSync(join(signalsDir, fileName), 'utf-8'));
        const rows = Array.isArray(parsed)
          ? parsed
          : parsed?.stocks || parsed?.rows || [];
        for (const row of rows) ingestStockNameSlug(map, row?.stockSlug, row?.stockName);
      } catch {
        /* ignore */
      }
    }
  }
  return map;
}

export function buildStockNseSlugLookupFromDisk(cwd = process.cwd()) {
  const map = new Map();
  const dataDir = join(cwd, 'public', 'data');
  ingestJsonIndex(map, join(dataDir, 'stock-nse-slug-index.json'));
  const signalsDir = join(dataDir, 'smart-money-signals');
  if (existsSync(signalsDir)) {
    for (const fileName of readdirSync(signalsDir)) {
      if (!fileName.endsWith('.json') || fileName.includes('--detail')) continue;
      try {
        ingestSignalPayloadNse(map, JSON.parse(readFileSync(join(signalsDir, fileName), 'utf-8')));
      } catch {
        /* ignore */
      }
    }
  }
  return map;
}

export function buildStockBseSlugLookupFromDisk(cwd = process.cwd()) {
  const map = new Map();
  ingestJsonIndex(
    map,
    join(cwd, 'public', 'data', 'stock-bse-slug-index.json'),
    (k) => String(k || '').trim(),
  );
  return map;
}

export function buildStockIsinSlugLookupFromDisk(cwd = process.cwd()) {
  const map = new Map();
  const dataDir = join(cwd, 'public', 'data');
  ingestJsonIndex(map, join(dataDir, 'stock-isin-slug-index.json'));
  ingestFundHoldingsBySlugListings(map, new Map(), new Map());
  return map;
}

export function buildStockListingSlugLookupsFromDisk(cwd = process.cwd()) {
  const isinMap = buildStockIsinSlugLookupFromDisk(cwd);
  const nseMap = buildStockNseSlugLookupFromDisk(cwd);
  const bseMap = buildStockBseSlugLookupFromDisk(cwd);
  ingestFundHoldingsJsonListings(isinMap, nseMap, bseMap);
  ingestBhavcopyListings(isinMap, nseMap, bseMap);
  return { isinMap, nseMap, bseMap };
}

function ingestSignalPayloadListings(bySlug) {
  const signalsDir = join(OUT_DIR, 'smart-money-signals');
  if (!existsSync(signalsDir)) return;
  for (const fileName of readdirSync(signalsDir)) {
    if (!fileName.endsWith('.json') || fileName.includes('--detail')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(signalsDir, fileName), 'utf-8'));
      const rows = Array.isArray(parsed)
        ? parsed
        : parsed?.stocks || parsed?.rows || [];
      for (const row of rows) {
        const slug = String(row?.stockSlug || '').trim();
        if (!slug) continue;
        const entry = bySlug.get(slug) || { isin: '', nseSymbol: '', bseCode: '' };
        const isin = String(row.isin || '').trim().toUpperCase();
        const nse = String(row.nseSymbol || row.nse_symbol || '').trim().toUpperCase();
        const bse = String(row.bseCode || row.bse_code || '').trim();
        if (isin) entry.isin = isin;
        if (nse) entry.nseSymbol = nse;
        if (bse) entry.bseCode = bse;
        bySlug.set(slug, entry);
      }
    } catch {
      /* ignore */
    }
  }
}

/** slug → { isin, nseSymbol, bseCode } from inverted listing indexes (no name matching). */
export function buildStockSlugListingLookupFromDisk(cwd = process.cwd()) {
  const { isinMap, nseMap, bseMap } = buildStockListingSlugLookupsFromDisk(cwd);
  const bySlug = new Map();
  const touch = (slug) => {
    const key = String(slug || '').trim();
    if (!key) return null;
    if (!bySlug.has(key)) bySlug.set(key, { isin: '', nseSymbol: '', bseCode: '' });
    return bySlug.get(key);
  };
  for (const [isin, slug] of isinMap) {
    const entry = touch(slug);
    if (entry && isin) entry.isin = String(isin).trim().toUpperCase();
  }
  for (const [nse, slug] of nseMap) {
    const entry = touch(slug);
    if (entry && nse) entry.nseSymbol = String(nse).trim().toUpperCase();
  }
  for (const [bse, slug] of bseMap) {
    const entry = touch(slug);
    if (entry && bse) entry.bseCode = String(bse).trim();
  }
  ingestSignalPayloadListings(bySlug);
  return bySlug;
}

export function enrichHoldingListingCodes(row, slugToListing) {
  let isin = String(row.isin || '').trim().toUpperCase();
  let nseSymbol = String(row.nseSymbol || row.nse_symbol || '').trim().toUpperCase();
  let bseCode = String(row.bseCode || row.bse_code || '').trim();

  const fromBhav = fillListingFromBhavcopy({ isin, nseSymbol, bseCode });
  isin = fromBhav.isin;
  nseSymbol = fromBhav.nseSymbol;
  bseCode = fromBhav.bseCode;

  if (!isin && !nseSymbol && !bseCode) {
    const slug = String(row.stockSlug || row.stock_slug || '').trim();
    if (!slug) return { isin: '', nseSymbol: '', bseCode: '' };
    const hit = slugToListing?.get(slug);
    const fromSlug = fillListingFromBhavcopy({
      isin: hit?.isin || '',
      nseSymbol: hit?.nseSymbol || '',
      bseCode: hit?.bseCode || '',
    });
    return fromSlug;
  }

  return { isin, nseSymbol, bseCode };
}

export function writeStockListingSlugIndexFiles(cwd = process.cwd()) {
  const { isinMap, nseMap, bseMap } = buildStockListingSlugLookupsFromDisk(cwd);
  const slugListing = buildStockSlugListingLookupFromDisk(cwd);
  mkdirSync(join(cwd, 'public', 'data'), { recursive: true });
  const write = (name, map) => {
    const path = join(cwd, 'public', 'data', name);
    writeFileSync(path, JSON.stringify(Object.fromEntries(map)));
    return map.size;
  };
  const writeObj = (name, obj) => {
    const path = join(cwd, 'public', 'data', name);
    writeFileSync(path, JSON.stringify(obj));
    return Object.keys(obj).length;
  };
  const bhavcopy = serializeBhavcopyListingIndex(buildBhavcopyListingIndex(cwd));
  writeObj('stock-bhavcopy-listings.json', bhavcopy);
  return {
    isin: write('stock-isin-slug-index.json', isinMap),
    nse: write('stock-nse-slug-index.json', nseMap),
    bse: write('stock-bse-slug-index.json', bseMap),
    slugListing: writeObj('stock-slug-listing-index.json', Object.fromEntries(slugListing)),
    bhavcopyIsin: Object.keys(bhavcopy.byIsin || {}).length,
  };
}

export function resolveStockSlugFromListing(
  isin,
  nse,
  bse,
  isinLookup,
  nseLookup,
  bseLookup,
) {
  const isinCode = String(isin || '').trim().toUpperCase();
  if (isinCode && isinLookup?.has(isinCode)) return isinLookup.get(isinCode);

  const nseCode = String(nse || '').trim().toUpperCase();
  if (nseCode && nseLookup?.has(nseCode)) return nseLookup.get(nseCode);

  const bseCode = String(bse || '').trim();
  if (bseCode && bseLookup?.has(bseCode)) return bseLookup.get(bseCode);

  return '';
}

/** Listing-only resolver (name / nameLookup / pre-set slug ignored). */
export function resolveStockSlugFromLookup(
  _name,
  _explicit,
  isin,
  _nameLookup,
  isinLookup,
  nse,
  nseLookup,
  bse,
  bseLookup,
) {
  const isinMap = isinLookup instanceof Map ? isinLookup : new Map();
  const nseMap = nseLookup instanceof Map ? nseLookup : new Map();
  const bseMap = bseLookup instanceof Map ? bseLookup : new Map();
  return resolveStockSlugFromListing(isin, nse, bse, isinMap, nseMap, bseMap);
}
