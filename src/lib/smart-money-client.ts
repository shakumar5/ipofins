import { fetchJsonCached, monthDataUrl } from './client-data';
import type { SmartMoneyTrackerData } from './data/holdings';
import type { SmartMoneySignalsData, SmartMoneySignalRow } from './smart-money-signals';

const SIGNALS_INDEX = '/data/smart-money-signals-index.json';
const SIGNALS_BASE = '/data/smart-money-signals';
const TRACKER_INDEX = '/data/smart-money-tracker-index.json';
const TRACKER_BASE = '/data/smart-money-tracker';

interface SignalsIndex {
  months: string[];
  categories: string[];
}

interface SignalsMonthFile {
  month: string;
  rows: SmartMoneySignalRow[];
}

interface TrackerIndex {
  months: { label: string; prevLabel: string }[];
  categories: string[];
  sectors: string[];
}

interface TrackerMonthFile {
  month: string;
  prevMonth: string;
  increased: SmartMoneyTrackerData['byMonth'][string]['increased'];
  decreased: SmartMoneyTrackerData['byMonth'][string]['decreased'];
  fresh_entry: SmartMoneyTrackerData['byMonth'][string]['fresh_entry'];
  complete_exit: SmartMoneyTrackerData['byMonth'][string]['complete_exit'];
}

let signalsIndexPromise: Promise<SignalsIndex> | null = null;
let trackerIndexPromise: Promise<TrackerIndex> | null = null;

export async function loadSignalsIndex(): Promise<SignalsIndex> {
  if (!signalsIndexPromise) {
    signalsIndexPromise = fetchJsonCached<SignalsIndex>(SIGNALS_INDEX);
  }
  return signalsIndexPromise;
}

export async function loadSignalsMonth(month: string): Promise<SmartMoneySignalsData> {
  const index = await loadSignalsIndex();
  const file = await fetchJsonCached<SignalsMonthFile>(monthDataUrl(SIGNALS_BASE, month));
  return {
    months: index.months,
    categories: index.categories,
    rows: file.rows,
  };
}

export async function loadTrackerIndex(): Promise<TrackerIndex> {
  if (!trackerIndexPromise) {
    trackerIndexPromise = fetchJsonCached<TrackerIndex>(TRACKER_INDEX);
  }
  return trackerIndexPromise;
}

export async function loadTrackerMonth(month: string): Promise<SmartMoneyTrackerData> {
  const index = await loadTrackerIndex();
  const file = await fetchJsonCached<TrackerMonthFile>(monthDataUrl(TRACKER_BASE, month));
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

export async function findSignalRow(
  stockSlug: string,
  month: string,
  category: string,
): Promise<SmartMoneySignalRow | null> {
  const data = await loadSignalsMonth(month);
  const matches = data.rows.filter((r) => r.stockSlug === stockSlug);
  if (!matches.length) return null;
  return (
    matches.find((r) => r.month === month && r.category === category) ||
    matches.find((r) => r.month === month) ||
    matches.find((r) => r.category === category) ||
    matches[0]
  );
}
