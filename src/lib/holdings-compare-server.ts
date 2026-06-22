/**
 * Build-time / SSR fallback for holdings compare pages when Neon is unavailable.
 * Reads exported static JSON from public/data/.
 */

import { existsSync, readFileSync } from 'fs';
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

let portfolioOverlapCache: PortfolioOverlapDisk | null | undefined;

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
