/** Client-side fetch for full fund holdings (per-slug export JSON). */

import { resolveStockSlugFromListing } from './stock-listing-resolve';

export interface FundHoldingRow {
  name: string;
  sector: string;
  pct: number | string;
  stockSlug?: string;
  isin?: string;
  nseSymbol?: string;
  bseCode?: string;
}

let stockIsinSlugIndex: Map<string, string> | null = null;
let stockNseSlugIndex: Map<string, string> | null = null;
let stockBseSlugIndex: Map<string, string> | null = null;
let fundHoldingsAliases: Record<string, string> | null = null;

async function loadFundHoldingsAliases(): Promise<Record<string, string>> {
  if (fundHoldingsAliases) return fundHoldingsAliases;
  try {
    const res = await fetch('/data/fund-holdings-aliases.json');
    if (!res.ok) {
      fundHoldingsAliases = {};
      return fundHoldingsAliases;
    }
    fundHoldingsAliases = (await res.json()) as Record<string, string>;
    return fundHoldingsAliases;
  } catch {
    fundHoldingsAliases = {};
    return fundHoldingsAliases;
  }
}

function fundSlugCandidates(fundSlug: string, aliases: Record<string, string>): string[] {
  const candidates = new Set<string>([fundSlug]);
  if (aliases[fundSlug]) candidates.add(aliases[fundSlug]);
  for (const [listable, page] of Object.entries(aliases)) {
    if (page === fundSlug || listable === fundSlug) {
      candidates.add(listable);
      candidates.add(page);
    }
  }
  return [...candidates];
}

async function loadJsonIndex(url: string, normalize: (k: string) => string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(url);
    if (!res.ok) return map;
    const data = (await res.json()) as Record<string, string>;
    for (const [key, slug] of Object.entries(data)) {
      const code = normalize(String(key || ''));
      const s = String(slug || '').trim();
      if (code && s && !map.has(code)) map.set(code, s);
    }
  } catch {
    /* ignore */
  }
  return map;
}

async function loadStockIsinSlugIndex(): Promise<Map<string, string>> {
  if (stockIsinSlugIndex) return stockIsinSlugIndex;
  stockIsinSlugIndex = await loadJsonIndex('/data/stock-isin-slug-index.json', (k) => k.trim().toUpperCase());
  return stockIsinSlugIndex;
}

async function loadStockNseSlugIndex(): Promise<Map<string, string>> {
  if (stockNseSlugIndex) return stockNseSlugIndex;
  stockNseSlugIndex = await loadJsonIndex('/data/stock-nse-slug-index.json', (k) => k.trim().toUpperCase());
  return stockNseSlugIndex;
}

async function loadStockBseSlugIndex(): Promise<Map<string, string>> {
  if (stockBseSlugIndex) return stockBseSlugIndex;
  stockBseSlugIndex = await loadJsonIndex('/data/stock-bse-slug-index.json', (k) => k.trim());
  return stockBseSlugIndex;
}

function resolveClientStockSlug(
  row: Pick<FundHoldingRow, 'isin' | 'nseSymbol' | 'bseCode'>,
  indexes: {
  isin: Map<string, string>;
  nse: Map<string, string>;
  bse: Map<string, string>;
}): string | undefined {
  return resolveStockSlugFromListing(
    row.isin,
    row.nseSymbol,
    row.bseCode,
    indexes.isin,
    indexes.nse,
    indexes.bse,
  );
}

export async function fetchFundHoldingsBySlug(fundSlug: string): Promise<FundHoldingRow[]> {
  const [aliases, isinIndex, nseIndex, bseIndex] = await Promise.all([
    loadFundHoldingsAliases(),
    loadStockIsinSlugIndex(),
    loadStockNseSlugIndex(),
    loadStockBseSlugIndex(),
  ]);
  const indexes = { isin: isinIndex, nse: nseIndex, bse: bseIndex };
  const slugs = fundSlugCandidates(fundSlug, aliases);
  let best: FundHoldingRow[] = [];

  for (const slug of slugs) {
    const res = await fetch(`/data/fund-holdings-by-slug/${slug}.json`);
    if (!res.ok) continue;
    const data = (await res.json()) as { stocks?: FundHoldingRow[] };
    const rows = (data.stocks || []).map((h) => ({
      name: String(h.name || ''),
      sector: String(h.sector || ''),
      pct: h.pct != null ? Number(h.pct) : 0,
      isin: h.isin ? String(h.isin) : undefined,
      nseSymbol: h.nseSymbol ? String(h.nseSymbol) : undefined,
      bseCode: h.bseCode ? String(h.bseCode) : undefined,
      stockSlug: resolveClientStockSlug(
        {
          isin: h.isin ? String(h.isin) : undefined,
          nseSymbol: h.nseSymbol ? String(h.nseSymbol) : undefined,
          bseCode: h.bseCode ? String(h.bseCode) : undefined,
        },
        indexes,
      ),
    }));
    if (rows.length > best.length) best = rows;
  }

  return best;
}
