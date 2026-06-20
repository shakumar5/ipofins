import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { monthFileSlug } from './client-data';
import type { SmartMoneyTrackerData } from './data/holdings';

export const TRACKER_INDEX_PUBLIC_PATH = '/data/smart-money-tracker-index.json';
export const TRACKER_MONTH_PUBLIC_BASE = '/data/smart-money-tracker';

export interface TrackerIndexDisk {
  months: { label: string; prevLabel: string }[];
  categories: string[];
  sectors: string[];
}

export interface TrackerMonthFileDisk {
  month: string;
  prevMonth: string;
  increased: SmartMoneyTrackerData['byMonth'][string]['increased'];
  decreased: SmartMoneyTrackerData['byMonth'][string]['decreased'];
  fresh_entry: SmartMoneyTrackerData['byMonth'][string]['fresh_entry'];
  complete_exit: SmartMoneyTrackerData['byMonth'][string]['complete_exit'];
}

export function readTrackerIndexFromDisk(cwd = process.cwd()): TrackerIndexDisk | null {
  const indexPath = join(cwd, 'public', 'data', 'smart-money-tracker-index.json');
  if (!existsSync(indexPath)) return null;
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as TrackerIndexDisk;
    if (!index.months?.length) return null;
    return index;
  } catch {
    return null;
  }
}

export function readTrackerMonthFromDisk(month: string, cwd = process.cwd()): TrackerMonthFileDisk | null {
  const monthPath = join(
    cwd,
    'public',
    'data',
    'smart-money-tracker',
    `${monthFileSlug(month)}.json`,
  );
  if (!existsSync(monthPath)) return null;
  try {
    return JSON.parse(readFileSync(monthPath, 'utf8')) as TrackerMonthFileDisk;
  } catch {
    return null;
  }
}

export function buildTrackerDataFromMonth(
  index: TrackerIndexDisk,
  file: TrackerMonthFileDisk,
): SmartMoneyTrackerData {
  return {
    months: index.months,
    categories: index.categories,
    sectors: index.sectors,
    byMonth: {
      [file.month]: {
        month: file.month,
        prevMonth: file.prevMonth,
        increased: file.increased,
        decreased: file.decreased,
        fresh_entry: file.fresh_entry,
        complete_exit: file.complete_exit,
      },
    },
    dataSource: 'holdings_changes',
  };
}

export interface SmartMoneyTrackerBootstrap {
  index: TrackerIndexDisk;
  initialMonth: string;
  preloadMonthUrl: string;
  data: SmartMoneyTrackerData | null;
}

/** Load tracker index + month JSON from disk at build time (no Neon). */
export function loadSmartMoneyTrackerBootstrap(
  preferredMonth?: string | null,
  cwd = process.cwd(),
): SmartMoneyTrackerBootstrap | null {
  const index = readTrackerIndexFromDisk(cwd);
  if (!index) return null;

  const initialMonth =
    preferredMonth && index.months.some((m) => m.label === preferredMonth)
      ? preferredMonth
      : index.months[0]?.label;
  if (!initialMonth) return null;

  const monthFile = readTrackerMonthFromDisk(initialMonth, cwd);

  return {
    index,
    initialMonth,
    preloadMonthUrl: `${TRACKER_MONTH_PUBLIC_BASE}/${monthFileSlug(initialMonth)}.json`,
    data: monthFile ? buildTrackerDataFromMonth(index, monthFile) : null,
  };
}
