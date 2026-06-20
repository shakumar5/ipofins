import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  signalCategoryFileName,
  type SignalsIndexDisk,
  type SmartMoneySignalsBootstrap,
} from './smart-money-signals-meta';
import {
  dedupeSignalsByStock,
  signalMarketCapFilterOptions,
  type SmartMoneySignalRow,
  type SmartMoneySignalsData,
} from './smart-money-signals';

export type { SignalsIndexDisk, SmartMoneySignalsBootstrap } from './smart-money-signals-meta';
export {
  SIGNALS_CATEGORY_PUBLIC_BASE,
  SIGNALS_INDEX_PUBLIC_PATH,
  signalCategoryFileName,
  signalCategoryPublicUrl,
} from './smart-money-signals-meta';

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
