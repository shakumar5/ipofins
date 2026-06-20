import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { categoryFileSlug, monthFileSlug } from './client-data';
import {
  dedupeSignalsByStock,
  signalMarketCapFilterOptions,
  type SmartMoneySignalRow,
  type SmartMoneySignalsData,
} from './smart-money-signals';

export const SIGNALS_INDEX_PUBLIC_PATH = '/data/smart-money-signals-index.json';
export const SIGNALS_CATEGORY_PUBLIC_BASE = '/data/smart-money-signals';

export interface SignalsIndexDisk {
  months: string[];
  categories: string[];
  layout?: 'by-category' | 'monolith';
  scoringModel?: 'conviction-v2' | 'stock-cap-v2' | 'fund-scheme-v1';
  exportedAt?: string;
}

export function signalCategoryFileName(month: string, category: string): string {
  return `${monthFileSlug(month)}--${categoryFileSlug(category)}.json`;
}

export function signalCategoryPublicUrl(month: string, category: string): string {
  return `${SIGNALS_CATEGORY_PUBLIC_BASE}/${signalCategoryFileName(month, category)}`;
}

export function readSignalsIndexFromDisk(cwd = process.cwd()): SignalsIndexDisk | null {
  const indexPath = join(cwd, 'public', 'data', 'smart-money-signals-index.json');
  if (!existsSync(indexPath)) return null;
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as SignalsIndexDisk;
    if (!index.months?.length) return null;
    return index;
  } catch {
    return null;
  }
}

export function readSignalsCategoryFromDisk(
  month: string,
  category: string,
  cwd = process.cwd(),
): { month: string; category: string; rows: SmartMoneySignalRow[] } | null {
  const filePath = join(
    cwd,
    'public',
    'data',
    'smart-money-signals',
    signalCategoryFileName(month, category),
  );
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as {
      month: string;
      category: string;
      rows: SmartMoneySignalRow[];
    };
  } catch {
    return null;
  }
}

/** Merge per-cap signal chunks the same way the client does for month + All. */
export function loadSignalsMonthFromDisk(
  month: string,
  index: SignalsIndexDisk,
  cwd = process.cwd(),
): SmartMoneySignalsData | null {
  const chunks = index.categories.map(
    (cat) => readSignalsCategoryFromDisk(month, cat, cwd)?.rows ?? [],
  );
  const merged = chunks.flat();
  if (!merged.length) return null;

  const rows =
    index.scoringModel === 'conviction-v2' || index.scoringModel === 'stock-cap-v2'
      ? merged
      : dedupeSignalsByStock(merged);
  const categories = signalMarketCapFilterOptions(index.categories, index.scoringModel);

  return {
    months: index.months,
    categories,
    rows,
  };
}

export interface SmartMoneySignalsBootstrap {
  index: SignalsIndexDisk;
  initialMonth: string;
  data: SmartMoneySignalsData | null;
}

/** Load signals index + latest month rows from disk at build time (no Neon). */
export function loadSmartMoneySignalsBootstrap(cwd = process.cwd()): SmartMoneySignalsBootstrap | null {
  const index = readSignalsIndexFromDisk(cwd);
  if (!index) return null;

  const initialMonth = index.months[0];
  if (!initialMonth) return null;

  return {
    index,
    initialMonth,
    data: loadSignalsMonthFromDisk(initialMonth, index, cwd),
  };
}
