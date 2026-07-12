import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { normalizeStockName } from './holdings-utils';
import {
  buildSlugToListingMap,
  enrichHoldingListingCodes,
  resolveStockSlugFromListing,
  type BhavcopyListingIndex,
} from './stock-listing-resolve';
import {
  applyTerToFundRow,
  loadFundTerBySlugFromDisk,
} from '../../scripts/lib/fund-ter-export.mjs';
import { normalizeEquityHoldingRow, isInternationalEquityFund } from './listing-codes';

export interface HoldingsCompareIndexDisk {
  months: string[];
  amcs: { name: string; slug: string; fundCount: number }[];
}

let diskCache: HoldingsCompareIndexDisk | null | undefined;

function projectRoots(): string[] {
  const fileRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  return [fileRoot, process.cwd(), join(process.cwd(), 'finverseui')];
}

function indexFilePath(): string | null {
  for (const root of projectRoots()) {
    const path = join(root, 'public', 'data', 'holdings-compare-index.json');
    if (existsSync(path)) return path;
  }
  return null;
}

export function readHoldingsCompareIndexFromDisk(): HoldingsCompareIndexDisk | null {
  if (diskCache !== undefined) return diskCache;
  const path = indexFilePath();
  if (!path) {
    diskCache = null;
    return null;
  }
  try {
    diskCache = JSON.parse(readFileSync(path, 'utf-8')) as HoldingsCompareIndexDisk;
    return diskCache;
  } catch {
    diskCache = null;
    return null;
  }
}

export function holdingsStatsFromIndex(index: HoldingsCompareIndexDisk) {
  return {
    amcCount: index.amcs.length,
    fundsCovered: index.amcs.reduce((sum, a) => sum + a.fundCount, 0),
    latestMonth: index.months[index.months.length - 1] || '',
  };
}

/** Newest-first month labels (matches getAvailableMonths DB order). */
export function monthsFromIndex(index: HoldingsCompareIndexDisk): string[] {
  return [...index.months].reverse();
}

export interface PortfolioOverlapDisk {
  month: string;
  funds: { slug: string; name: string; amc?: string }[];
}

export interface FundOverlapIndexDisk {
  slug: string;
  name: string;
}

export interface FundOverlapRowDisk {
  name: string;
  slug: string;
  overlap_pct: number | null;
  common_stocks: number;
  common_stock_names: string[];
}

export interface FundOverlapsByFundDisk {
  month: string;
  bySlug: Record<string, FundOverlapRowDisk[]>;
}

let portfolioOverlapCache: PortfolioOverlapDisk | null | undefined;
let fundOverlapIndexCache: FundOverlapIndexDisk[] | null | undefined;
let fundOverlapsByFundCache: FundOverlapsByFundDisk | null | undefined;

function dataFilePath(name: string): string | null {
  for (const root of projectRoots()) {
    for (const sub of ['public/data', 'dist/data']) {
      const path = join(root, sub, name);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

/** Slugs from exported portfolio-overlap.json (holder funds, incl. growth-option direct plans). */
export function readPortfolioOverlapFromDisk(): PortfolioOverlapDisk | null {
  if (portfolioOverlapCache !== undefined) return portfolioOverlapCache;
  for (const root of projectRoots()) {
    const path = join(root, 'public', 'data', 'portfolio-overlap.json');
    if (!existsSync(path)) continue;
    try {
      portfolioOverlapCache = JSON.parse(readFileSync(path, 'utf-8')) as PortfolioOverlapDisk;
      return portfolioOverlapCache;
    } catch {
      portfolioOverlapCache = null;
      return null;
    }
  }
  portfolioOverlapCache = null;
  return null;
}

/** Funds with pairwise overlap rows in fund_overlaps (canonical funds.slug). */
export function readFundOverlapIndexFromDisk(): FundOverlapIndexDisk[] | null {
  if (fundOverlapIndexCache !== undefined) return fundOverlapIndexCache;
  const path = dataFilePath('fund-overlap-index.json');
  if (!path) {
    fundOverlapIndexCache = null;
    return null;
  }
  try {
    fundOverlapIndexCache = JSON.parse(readFileSync(path, 'utf-8')) as FundOverlapIndexDisk[];
    return fundOverlapIndexCache;
  } catch {
    fundOverlapIndexCache = null;
    return null;
  }
}

export function readFundOverlapsByFundFromDisk(): FundOverlapsByFundDisk | null {
  if (fundOverlapsByFundCache !== undefined) return fundOverlapsByFundCache;
  const path = dataFilePath('fund-overlaps-by-fund.json');
  if (!path) {
    fundOverlapsByFundCache = null;
    return null;
  }
  try {
    fundOverlapsByFundCache = JSON.parse(readFileSync(path, 'utf-8')) as FundOverlapsByFundDisk;
    return fundOverlapsByFundCache;
  } catch {
    fundOverlapsByFundCache = null;
    return null;
  }
}

export interface FundHoldingsIndexDisk {
  name: string;
  slug: string;
  category: string;
  nav: number | null;
  returns1y: number | null;
  returns3y: number | null;
  returns5y: number | null;
  aum: string | null;
  riskLevel: string;
  rating: number | null;
  schemeCode: string;
  lastUpdated: string | null;
  expenseRatio: number | null;
  expenseRatioRegular: number | null;
}

export interface FundHoldingsMetaDisk {
  slugs: string[];
  stockCounts: Record<string, number>;
}

let fundHoldingsIndexCache: FundHoldingsIndexDisk[] | null | undefined;
let fundHoldingsMetaCache: FundHoldingsMetaDisk | null | undefined;
let fundHoldingsAliasesCache: Record<string, string> | null | undefined;
let mfHubAllCache: MfHubAllDiskRow[] | null | undefined;

export interface MfHubAllDiskRow {
  name: string;
  slug: string;
  category: string;
  nav: number | null;
  returns1y?: number | null;
  returns3y?: number | null;
  returns5y?: number | null;
  aum?: string | null;
  riskLevel?: string;
  rating?: number | null;
  hasHoldings?: boolean;
  stockCount?: number;
  detailSlug?: string | null;
}

function mfHubAllFilePath(): string | null {
  for (const root of projectRoots()) {
    for (const sub of ['public/data', 'dist/data']) {
      const path = join(root, sub, 'mf-hub', 'all.json');
      if (existsSync(path)) return path;
    }
  }
  return null;
}

export function readMfHubAllFromDisk(): MfHubAllDiskRow[] | null {
  if (mfHubAllCache !== undefined) return mfHubAllCache;
  const path = mfHubAllFilePath();
  if (!path) {
    mfHubAllCache = null;
    return null;
  }
  try {
    mfHubAllCache = JSON.parse(readFileSync(path, 'utf-8')) as MfHubAllDiskRow[];
    return mfHubAllCache;
  } catch {
    mfHubAllCache = null;
    return null;
  }
}

/** Add mf-hub rows flagged hasHoldings when fund-holdings-index export is stale vs meta/hub. */
export function supplementHoldingsIndexFromHub(
  index: FundHoldingsIndexDisk[],
): FundHoldingsIndexDisk[] {
  const hub = readMfHubAllFromDisk();
  if (!hub?.length) return index;

  const terBySlug = loadFundTerBySlugFromDisk();
  const seen = new Set(index.map((f) => f.slug));
  const out = index.map((row) => applyTerToFundRow(row, terBySlug));

  for (const row of hub) {
    const detailSlug = row.detailSlug?.trim();
    if (!row.hasHoldings || !detailSlug || seen.has(detailSlug)) continue;
    seen.add(detailSlug);
    out.push(
      applyTerToFundRow(
        {
          name: row.name,
          slug: detailSlug,
          category: row.category,
          nav: row.nav ?? null,
          returns1y: row.returns1y ?? null,
          returns3y: row.returns3y ?? null,
          returns5y: row.returns5y ?? null,
          aum: row.aum ?? null,
          riskLevel: row.riskLevel || 'moderate',
          rating: row.rating ?? null,
          schemeCode: '',
          lastUpdated: null,
          expenseRatio: null,
          expenseRatioRegular: null,
        },
        terBySlug,
      ),
    );
  }

  return out;
}

/** Funds with static holdings detail pages (canonical funds.slug values). */
export function readFundHoldingsIndexFromDisk(): FundHoldingsIndexDisk[] | null {
  if (fundHoldingsIndexCache !== undefined) return fundHoldingsIndexCache;
  const path = dataFilePath('fund-holdings-index.json');
  if (!path) {
    fundHoldingsIndexCache = null;
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as FundHoldingsIndexDisk[];
    const terBySlug = loadFundTerBySlugFromDisk();
    fundHoldingsIndexCache = raw.map((row) => applyTerToFundRow(row, terBySlug));
    return fundHoldingsIndexCache;
  } catch {
    fundHoldingsIndexCache = null;
    return null;
  }
}

function fundHoldingsBySlugDir(): string | null {
  for (const root of projectRoots()) {
    for (const sub of ['public/data', 'dist/data']) {
      const dir = join(root, sub, 'fund-holdings-by-slug');
      if (existsSync(dir)) return dir;
    }
  }
  return null;
}

/** Prefer per-fund export lengths — meta DB counts can under-count vs full AMC disclosure rows. */
export function readBySlugStockCountsFromDisk(): Record<string, number> {
  const dir = fundHoldingsBySlugDir();
  if (!dir) return {};

  const counts: Record<string, number> = {};
  for (const fileName of readdirSync(dir)) {
    if (!fileName.endsWith('.json')) continue;
    const slug = fileName.replace(/\.json$/, '');
    try {
      const data = JSON.parse(readFileSync(join(dir, fileName), 'utf-8')) as PerFundHoldingsDisk;
      const n = data.stocks?.length ?? 0;
      if (n > 0) counts[slug] = n;
    } catch {
      // skip bad file
    }
  }
  return counts;
}

function reconcileMetaStockCounts(meta: FundHoldingsMetaDisk): FundHoldingsMetaDisk {
  const bySlug = readBySlugStockCountsFromDisk();
  if (!Object.keys(bySlug).length) return meta;

  // Authoritative: by-slug file row lengths (never inflate above actual rows).
  const stockCounts: Record<string, number> = { ...bySlug };

  const aliases = readFundHoldingsAliasesFromDisk() ?? {};
  for (const [listable, canonical] of Object.entries(aliases)) {
    const count = Math.max(stockCounts[listable] ?? 0, stockCounts[canonical] ?? 0);
    if (count > 0) {
      stockCounts[listable] = count;
      stockCounts[canonical] = count;
    }
  }

  const slugs = [...new Set([
    ...(meta.slugs || []),
    ...Object.keys(stockCounts).filter((k) => (stockCounts[k] ?? 0) > 0),
  ])];

  return { slugs, stockCounts };
}

export function readFundHoldingsMetaFromDisk(): FundHoldingsMetaDisk | null {
  if (fundHoldingsMetaCache !== undefined) return fundHoldingsMetaCache;
  const path = dataFilePath('fund-holdings-meta.json');
  if (!path) {
    fundHoldingsMetaCache = null;
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as FundHoldingsMetaDisk;
    fundHoldingsMetaCache = reconcileMetaStockCounts(raw);
    return fundHoldingsMetaCache;
  } catch {
    fundHoldingsMetaCache = null;
    return null;
  }
}

/** Listable / AMFI slug → canonical holdings page slug. */
export function readFundHoldingsAliasesFromDisk(): Record<string, string> | null {
  if (fundHoldingsAliasesCache !== undefined) return fundHoldingsAliasesCache;
  const path = dataFilePath('fund-holdings-aliases.json');
  if (!path) {
    fundHoldingsAliasesCache = null;
    return null;
  }
  try {
    fundHoldingsAliasesCache = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>;
    return fundHoldingsAliasesCache;
  } catch {
    fundHoldingsAliasesCache = null;
    return null;
  }
}

interface DiskHoldingStock {
  name: string;
  isin?: string;
  nseSymbol?: string;
  bseCode?: string;
  sector: string;
  pct: number;
  stockSlug?: string;
}

let stockIsinSlugCache: Map<string, string> | null | undefined;
let stockNseSlugCache: Map<string, string> | null | undefined;
let stockBseSlugCache: Map<string, string> | null | undefined;
let stockSlugListingCache: Map<string, import('./stock-listing-resolve').StockListingCodes> | null | undefined;

function normalizeStockNameKey(name: string): string {
  return normalizeStockName(name);
}

function holdingRowKey(isin: string | undefined | null, name: string): string {
  const code = String(isin || '').trim().toUpperCase();
  if (code) return `isin:${code}`;
  return `name:${normalizeStockNameKey(name)}`;
}

function loadListingSlugIndex(fileName: string, normalizeKey: (k: string) => string): Map<string, string> {
  const map = new Map<string, string>();
  const indexPath = dataFilePath(fileName);
  if (indexPath) {
    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf-8')) as Record<string, string>;
      for (const [key, slug] of Object.entries(index)) {
        const code = normalizeKey(String(key || ''));
        const s = String(slug || '').trim();
        if (code && s && !map.has(code)) map.set(code, s);
      }
    } catch {
      /* ignore */
    }
  }
  return map;
}

/** ISIN → slug from exported stock index and per-fund holdings JSON. */
function loadStockIsinSlugIndex(): Map<string, string> {
  if (stockIsinSlugCache !== undefined) return stockIsinSlugCache!;

  const map = loadListingSlugIndex('stock-isin-slug-index.json', (k) => k.trim().toUpperCase());
  const ingest = (isin?: string, stockSlug?: string) => {
    const code = String(isin || '').trim().toUpperCase();
    const slug = String(stockSlug || '').trim();
    if (!code || !slug || map.has(code)) return;
    map.set(code, slug);
  };

  for (const root of projectRoots()) {
    const dir = join(root, 'public', 'data', 'fund-holdings-by-slug');
    if (!existsSync(dir)) continue;
    try {
      for (const fileName of readdirSync(dir)) {
        if (!fileName.endsWith('.json')) continue;
        const data = JSON.parse(readFileSync(join(dir, fileName), 'utf-8')) as {
          stocks?: { isin?: string; stockSlug?: string }[];
        };
        for (const row of data.stocks || []) ingest(row.isin, row.stockSlug);
      }
    } catch {
      /* ignore */
    }
    break;
  }

  stockIsinSlugCache = map;
  return map;
}

function loadStockNseSlugIndex(): Map<string, string> {
  if (stockNseSlugCache !== undefined) return stockNseSlugCache!;
  const map = loadListingSlugIndex('stock-nse-slug-index.json', (k) => k.trim().toUpperCase());

  for (const root of projectRoots()) {
    const dir = join(root, 'public', 'data', 'smart-money-signals');
    if (!existsSync(dir)) continue;
    try {
      for (const fileName of readdirSync(dir)) {
        if (!fileName.endsWith('.json') || fileName.includes('--detail')) continue;
        const parsed = JSON.parse(readFileSync(join(dir, fileName), 'utf-8')) as
          | { nseSymbol?: string; stockSlug?: string }[]
          | { stocks?: { nseSymbol?: string; stockSlug?: string }[]; rows?: { nseSymbol?: string; stockSlug?: string }[] };
        const rows = Array.isArray(parsed)
          ? parsed
          : [...(parsed.stocks || []), ...(parsed.rows || [])];
        for (const row of rows) {
          const nse = String(row.nseSymbol || '').trim().toUpperCase();
          const slug = String(row.stockSlug || '').trim();
          if (nse && slug && !map.has(nse)) map.set(nse, slug);
        }
      }
    } catch {
      /* ignore */
    }
    break;
  }

  stockNseSlugCache = map;
  return map;
}

function loadStockBseSlugIndex(): Map<string, string> {
  if (stockBseSlugCache !== undefined) return stockBseSlugCache!;
  stockBseSlugCache = loadListingSlugIndex('stock-bse-slug-index.json', (k) => k.trim());
  return stockBseSlugCache;
}

let bhavcopyListingCache: BhavcopyListingIndex | null | undefined;

function loadBhavcopyListingIndex(): BhavcopyListingIndex | null {
  if (bhavcopyListingCache !== undefined) return bhavcopyListingCache;

  const filePath = dataFilePath('stock-bhavcopy-listings.json');
  if (!filePath) {
    bhavcopyListingCache = null;
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      byIsin?: Record<string, { isin?: string; nseSymbol?: string; bseCode?: string }>;
      byNse?: Record<string, { isin?: string; nseSymbol?: string; bseCode?: string }>;
      byBse?: Record<string, { isin?: string; nseSymbol?: string; bseCode?: string }>;
    };

    const toCodes = (entry?: { isin?: string; nseSymbol?: string; bseCode?: string }) => ({
      isin: String(entry?.isin || '').trim().toUpperCase(),
      nseSymbol: String(entry?.nseSymbol || '').trim().toUpperCase(),
      bseCode: String(entry?.bseCode || '').trim(),
    });

    const loadMap = (obj?: Record<string, { isin?: string; nseSymbol?: string; bseCode?: string }>) => {
      const map = new Map<string, import('./stock-listing-resolve').StockListingCodes>();
      if (!obj) return map;
      for (const [key, entry] of Object.entries(obj)) {
        const code = String(key || '').trim();
        if (!code) continue;
        map.set(code, toCodes(entry));
      }
      return map;
    };

    bhavcopyListingCache = {
      byIsin: loadMap(raw.byIsin),
      byNse: loadMap(raw.byNse),
      byBse: loadMap(raw.byBse),
    };
    return bhavcopyListingCache;
  } catch {
    bhavcopyListingCache = null;
    return null;
  }
}

/** slug → { isin, nse, bse } for recovering listing codes on holdings rows. */
function loadStockSlugListingIndex(): Map<string, import('./stock-listing-resolve').StockListingCodes> {
  if (stockSlugListingCache !== undefined) return stockSlugListingCache!;

  const filePath = dataFilePath('stock-slug-listing-index.json');
  if (filePath) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<
        string,
        { isin?: string; nseSymbol?: string; nse?: string; bseCode?: string; bse?: string }
      >;
      const map = new Map<string, import('./stock-listing-resolve').StockListingCodes>();
      for (const [slug, codes] of Object.entries(raw)) {
        const key = String(slug || '').trim();
        if (!key) continue;
        map.set(key, {
          isin: String(codes.isin || '').trim().toUpperCase(),
          nseSymbol: String(codes.nseSymbol || codes.nse || '').trim().toUpperCase(),
          bseCode: String(codes.bseCode || codes.bse || '').trim(),
        });
      }
      if (map.size > 0) {
        stockSlugListingCache = map;
        return map;
      }
    } catch {
      /* fall through to build from listing indexes */
    }
  }

  stockSlugListingCache = buildSlugToListingMap(
    loadStockIsinSlugIndex(),
    loadStockNseSlugIndex(),
    loadStockBseSlugIndex(),
  );
  return stockSlugListingCache;
}

/** Resolve slug from listing identifiers only: ISIN → NSE → BSE. */
export function resolveStockSlugFromDisk(
  isin?: string | null,
  nse?: string | null,
  bse?: string | null,
): string | undefined {
  return resolveStockSlugFromListing(
    isin || undefined,
    nse || undefined,
    bse || undefined,
    loadStockIsinSlugIndex(),
    loadStockNseSlugIndex(),
    loadStockBseSlugIndex(),
  );
}

/** Merge slug/isin from canonical per-fund export into a longer holdings list. */
export function enrichHoldingsRowsWithSlugs(
  rows: Record<string, unknown>[],
  slugSource: Record<string, unknown>[],
): Record<string, unknown>[] {
  const listingByKey = new Map<string, { isin?: string; nse?: string; bse?: string }>();
  for (const row of slugSource) {
    const name = String(row.name || '');
    const isin = String(row.isin || '').trim().toUpperCase();
    const nse = String(row.nse_symbol || row.nseSymbol || '').trim().toUpperCase();
    const bse = String(row.bse_code || row.bseCode || '').trim();
    listingByKey.set(holdingRowKey(isin, name), {
      isin: isin || undefined,
      nse: nse || undefined,
      bse: bse || undefined,
    });
  }

  return rows.map((row) => {
    const name = String(row.name || '');
    const isin = String(row.isin || '').trim().toUpperCase();
    const key = holdingRowKey(isin, name);
    const hit = listingByKey.get(key);
    const stock_slug = resolveStockSlugFromDisk(
      isin || hit?.isin,
      String(row.nse_symbol || row.nseSymbol || hit?.nse || ''),
      String(row.bse_code || row.bseCode || hit?.bse || ''),
    );
    return {
      ...row,
      name,
      isin: isin || hit?.isin || '',
      sector: String(row.sector || ''),
      pct: row.pct != null ? Number(row.pct) : 0,
      ...(stock_slug ? { stock_slug } : {}),
    };
  });
}

function mapDiskHoldingRow(
  stock: DiskHoldingStock,
  month?: string,
  fundContext?: import('./listing-codes').FundListingContext,
): Record<string, unknown> | null {
  const listing = enrichHoldingListingCodes(
    stock,
    loadStockSlugListingIndex(),
    loadBhavcopyListingIndex(),
  );
  const normalized = normalizeEquityHoldingRow(
    {
      ...stock,
      isin: listing.isin,
      nseSymbol: listing.nseSymbol,
      bseCode: listing.bseCode,
    },
    { enrichFromSlug: false, fundContext },
  );
  if (!normalized) return null;

  const stockSlug =
    String(stock.stockSlug || '').trim() ||
    resolveStockSlugFromDisk(
      normalized.isin as string,
      normalized.nseSymbol as string,
      normalized.bseCode as string,
    );
  return {
    name: stock.name,
    pct: stock.pct,
    sector: stock.sector || '',
    isin: normalized.isin,
    nse_symbol: normalized.nseSymbol,
    bse_code: normalized.bseCode,
    month,
    ...(stockSlug ? { stock_slug: stockSlug } : {}),
  };
}

interface DiskFundHoldingsEntry {
  name: string;
  amc: string;
  [monthLabel: string]: unknown;
}

interface DiskAmcHoldingsFile {
  holdings: Record<string, DiskFundHoldingsEntry>;
}

interface HoldingsSlugIndexEntry {
  monthLabel: string;
  stocks: DiskHoldingStock[];
}

let holdingsSlugIndexCache: Map<string, HoldingsSlugIndexEntry> | null | undefined;

function monthLabelToDate(monthLabel: string): string {
  const parsed = Date.parse(`${monthLabel} 1`);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return monthLabel;
}

function unpackMonthHoldings(monthData: unknown): { stocks: DiskHoldingStock[]; totalStocks: number } {
  if (!monthData) return { stocks: [], totalStocks: 0 };
  if (Array.isArray(monthData)) {
    return { stocks: monthData as DiskHoldingStock[], totalStocks: monthData.length };
  }
  const packed = monthData as { stocks?: DiskHoldingStock[]; totalStocks?: number };
  const stocks = packed.stocks || [];
  return { stocks, totalStocks: packed.totalStocks ?? stocks.length };
}

function latestMonthLabelForFund(
  fund: DiskFundHoldingsEntry,
  months: string[],
): string | null {
  for (let i = months.length - 1; i >= 0; i--) {
    const month = months[i];
    const { totalStocks } = unpackMonthHoldings(fund[month]);
    if (totalStocks > 0) return month;
  }
  for (const key of Object.keys(fund)) {
    if (key === 'name' || key === 'amc') continue;
    const { totalStocks } = unpackMonthHoldings(fund[key]);
    if (totalStocks > 0) return key;
  }
  return null;
}

export function fundSlugCandidates(fundSlug: string): string[] {
  const aliases = readFundHoldingsAliasesFromDisk() ?? {};
  const candidates = new Set<string>([fundSlug]);
  if (aliases[fundSlug]) candidates.add(aliases[fundSlug]);
  for (const [listable, page] of Object.entries(aliases)) {
    if (page === fundSlug || listable === fundSlug) {
      candidates.add(listable);
      candidates.add(page);
    }
  }
  const base = fundSlug.replace(/-holdings$/, '');
  if (base.endsWith('-direct-plan')) {
    candidates.add(base.replace(/-direct-plan$/, ''));
  } else if (base && !base.endsWith('-direct-plan')) {
    candidates.add(`${base}-direct-plan`);
  }
  return [...candidates];
}

function buildHoldingsSlugIndex(index: HoldingsCompareIndexDisk): Map<string, HoldingsSlugIndexEntry> {
  const map = new Map<string, HoldingsSlugIndexEntry>();
  const months = index.months;

  for (const root of projectRoots()) {
    const amcDir = join(root, 'public', 'data', 'holdings-compare', 'amc');
    if (!existsSync(amcDir)) continue;

    for (const fileName of readdirSync(amcDir)) {
      if (!fileName.endsWith('.json')) continue;
      const filePath = join(amcDir, fileName);
      let file: DiskAmcHoldingsFile;
      try {
        file = JSON.parse(readFileSync(filePath, 'utf-8')) as DiskAmcHoldingsFile;
      } catch {
        continue;
      }

      for (const [slug, fund] of Object.entries(file.holdings || {})) {
        const monthLabel = latestMonthLabelForFund(fund, months);
        if (!monthLabel) continue;
        const { stocks } = unpackMonthHoldings(fund[monthLabel]);
        if (!stocks.length) continue;
        map.set(slug, { monthLabel, stocks });
      }
    }
    break;
  }

  return map;
}

function loadHoldingsSlugIndex(): Map<string, HoldingsSlugIndexEntry> | null {
  if (holdingsSlugIndexCache !== undefined) {
    return holdingsSlugIndexCache;
  }

  const index = readHoldingsCompareIndexFromDisk();
  if (!index?.months?.length) {
    holdingsSlugIndexCache = null;
    return null;
  }

  holdingsSlugIndexCache = buildHoldingsSlugIndex(index);
  return holdingsSlugIndexCache;
}

interface PerFundHoldingsDisk {
  slug: string;
  month?: string;
  stocks: DiskHoldingStock[];
}

function readPerFundHoldingsFile(fundSlug: string): PerFundHoldingsDisk | null {
  for (const root of projectRoots()) {
    const path = join(root, 'public', 'data', 'fund-holdings-by-slug', `${fundSlug}.json`);
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as PerFundHoldingsDisk;
    } catch {
      return null;
    }
  }
  return null;
}

/** Prefer the slug variant with the most stocks (page slug often has a 20-row preview file). */
function bestPerFundHoldingsAmongCandidates(fundSlug: string): { slug: string; file: PerFundHoldingsDisk } | null {
  let best: { slug: string; file: PerFundHoldingsDisk; count: number } | null = null;
  for (const slug of fundSlugCandidates(fundSlug)) {
    const file = readPerFundHoldingsFile(slug);
    if (!file) continue;
    const count = file.stocks?.length ?? 0;
    if (count > 0 && (!best || count > best.count)) {
      best = { slug, file, count };
    }
  }
  return best ? { slug: best.slug, file: best.file } : null;
}

/** Full latest-month holdings from per-fund export (preferred over AMC index chunks). */
export function readFundHoldingsBySlugFromDisk(fundSlug: string): Record<string, unknown>[] | null {
  const hit = bestPerFundHoldingsAmongCandidates(fundSlug);
  if (!hit) return null;
  const month = hit.file.month ? monthLabelToDate(hit.file.month) : undefined;
  const fundContext = {
    fundSlug: hit.slug,
    internationalFund: isInternationalEquityFund(hit.slug),
  };
  return hit.file.stocks
    .map((stock) => mapDiskHoldingRow(stock, month, fundContext))
    .filter((row): row is Record<string, unknown> => row !== null);
}

/** Latest-month top holdings for fund detail pages (from export JSON, no Neon). */
export function readFundHoldingsRowsFromDisk(fundSlug: string): Record<string, unknown>[] | null {
  const slugIndex = loadHoldingsSlugIndex();
  if (!slugIndex) return null;

  const monthIso = (monthLabel: string) => monthLabelToDate(monthLabel);
  let best: { monthLabel: string; stocks: DiskHoldingStock[]; count: number } | null = null;

  for (const slug of fundSlugCandidates(fundSlug)) {
    const hit = slugIndex.get(slug);
    const count = hit?.stocks?.length ?? 0;
    if (count > 0 && (!best || count > best.count)) {
      best = { monthLabel: hit!.monthLabel, stocks: hit!.stocks, count };
    }
  }

  if (!best) return null;
  const month = monthIso(best.monthLabel);
  return best.stocks
    .map((stock) => mapDiskHoldingRow(stock, month))
    .filter((row): row is Record<string, unknown> => row !== null);
}

/** Count of holdings rows we can actually render (never inflated AMC totalStocks metadata). */
export function readFundPortfolioStockCountFromDisk(fundSlug: string): number | null {
  const rows = readFundHoldingsBySlugFromDisk(fundSlug);
  if (rows?.length) return rows.length;

  const fromIndex = readFundHoldingsRowsFromDisk(fundSlug);
  if (fromIndex?.length) return fromIndex.length;

  return null;
}
