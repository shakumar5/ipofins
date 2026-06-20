import type { SmartMoneyTrackerData } from './data/holdings';
import type { TrackerIndexDisk } from './smart-money-tracker-server';

export const SMART_MONEY_TRACKER_INDEX_BOOTSTRAP_ID = 'smart-money-tracker-index-bootstrap';
export const SMART_MONEY_TRACKER_DATA_BOOTSTRAP_ID = 'smart-money-tracker-data-bootstrap';

export function readTrackerIndexBootstrapFromDom(): TrackerIndexDisk | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(SMART_MONEY_TRACKER_INDEX_BOOTSTRAP_ID);
  if (!el) return null;
  const raw = el.getAttribute('data-json') || el.textContent;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as TrackerIndexDisk;
    if (!parsed.months?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveTrackerIndexBootstrap(
  propIndex?: TrackerIndexDisk | null,
): TrackerIndexDisk | null {
  const fromDom = readTrackerIndexBootstrapFromDom();
  if (fromDom) return fromDom;
  if (propIndex?.months?.length) return propIndex;
  return null;
}

export function readTrackerDataBootstrapFromDom(): SmartMoneyTrackerData | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(SMART_MONEY_TRACKER_DATA_BOOTSTRAP_ID);
  if (!el) return null;
  const raw = el.getAttribute('data-json') || el.textContent;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as SmartMoneyTrackerData;
    if (!parsed.months?.length || !parsed.byMonth || !Object.keys(parsed.byMonth).length) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Prefer inline JSON (reliable), then Astro prop, for SSR/bootstrap. */
export function resolveTrackerDataBootstrap(
  propData?: SmartMoneyTrackerData | null,
): SmartMoneyTrackerData | null {
  const fromDom = readTrackerDataBootstrapFromDom();
  if (fromDom) return fromDom;
  if (propData?.months?.length && propData.byMonth && Object.keys(propData.byMonth).length) {
    return propData;
  }
  return null;
}

export function buildTrackerDataFromIndexMonth(
  index: TrackerIndexDisk,
  monthFile: {
    month: string;
    prevMonth: string;
    increased: SmartMoneyTrackerData['byMonth'][string]['increased'];
    decreased: SmartMoneyTrackerData['byMonth'][string]['decreased'];
    fresh_entry: SmartMoneyTrackerData['byMonth'][string]['fresh_entry'];
    complete_exit: SmartMoneyTrackerData['byMonth'][string]['complete_exit'];
  },
): SmartMoneyTrackerData {
  return {
    months: index.months,
    categories: index.categories,
    sectors: index.sectors,
    byMonth: {
      [monthFile.month]: {
        month: monthFile.month,
        prevMonth: monthFile.prevMonth,
        increased: monthFile.increased,
        decreased: monthFile.decreased,
        fresh_entry: monthFile.fresh_entry,
        complete_exit: monthFile.complete_exit,
      },
    },
    dataSource: 'holdings_changes',
  };
}

export const TRACKER_INDEX_PUBLIC_PATH = '/data/smart-money-tracker-index.json';
