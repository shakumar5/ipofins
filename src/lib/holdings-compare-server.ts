/**
 * Build-time / SSR fallback for holdings compare pages when Neon is unavailable.
 * Reads exported static JSON from public/data/.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
    const path = join(root, 'public', 'data', name);
    if (existsSync(path)) return path;
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

/** Funds with static holdings detail pages (canonical funds.slug values). */
export function readFundHoldingsIndexFromDisk(): FundHoldingsIndexDisk[] | null {
  if (fundHoldingsIndexCache !== undefined) return fundHoldingsIndexCache;
  const path = dataFilePath('fund-holdings-index.json');
  if (!path) {
    fundHoldingsIndexCache = null;
    return null;
  }
  try {
    fundHoldingsIndexCache = JSON.parse(readFileSync(path, 'utf-8')) as FundHoldingsIndexDisk[];
    return fundHoldingsIndexCache;
  } catch {
    fundHoldingsIndexCache = null;
    return null;
  }
}

export function readFundHoldingsMetaFromDisk(): FundHoldingsMetaDisk | null {
  if (fundHoldingsMetaCache !== undefined) return fundHoldingsMetaCache;
  const path = dataFilePath('fund-holdings-meta.json');
  if (!path) {
    fundHoldingsMetaCache = null;
    return null;
  }
  try {
    fundHoldingsMetaCache = JSON.parse(readFileSync(path, 'utf-8')) as FundHoldingsMetaDisk;
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
  sector: string;
  pct: number;
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

/** Full latest-month holdings from per-fund export (preferred over AMC index chunks). */
export function readFundHoldingsBySlugFromDisk(fundSlug: string): Record<string, unknown>[] | null {
  for (const slug of fundSlugCandidates(fundSlug)) {
    const file = readPerFundHoldingsFile(slug);
    if (!file?.stocks?.length) continue;
    const month = file.month ? monthLabelToDate(file.month) : undefined;
    return file.stocks.map((stock) => ({
      name: stock.name,
      pct: stock.pct,
      sector: stock.sector || '',
      month,
    }));
  }
  return null;
}

/** Latest-month top holdings for fund detail pages (from export JSON, no Neon). */
export function readFundHoldingsRowsFromDisk(fundSlug: string): Record<string, unknown>[] | null {
  const slugIndex = loadHoldingsSlugIndex();
  if (!slugIndex) return null;

  const monthIso = (monthLabel: string) => monthLabelToDate(monthLabel);

  for (const slug of fundSlugCandidates(fundSlug)) {
    const hit = slugIndex.get(slug);
    if (!hit?.stocks?.length) continue;
    const month = monthIso(hit.monthLabel);
    return hit.stocks.map((stock) => ({
      name: stock.name,
      pct: stock.pct,
      sector: stock.sector || '',
      month,
    }));
  }

  return null;
}

export function readFundPortfolioStockCountFromDisk(fundSlug: string): number | null {
  const meta = readFundHoldingsMetaFromDisk();
  if (!meta?.stockCounts) return null;

  for (const slug of fundSlugCandidates(fundSlug)) {
    const count = meta.stockCounts[slug];
    if (count != null && count > 0) return count;
  }

  return null;
}
