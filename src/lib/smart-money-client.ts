import { fetchJsonCached, monthFileSlug, categoryFileSlug } from './client-data';
import type { SmartMoneyTrackerData } from './data/holdings';
import type { SmartMoneySignalsData, SmartMoneySignalRow } from './smart-money-signals';

const SIGNALS_INDEX = '/data/smart-money-signals-index.json';
const SIGNALS_BASE = '/data/smart-money-signals';
const TRACKER_INDEX = '/data/smart-money-tracker-index.json';
const TRACKER_BASE = '/data/smart-money-tracker';

interface SignalsIndex {
  months: string[];
  categories: string[];
  layout?: 'by-category' | 'monolith';
}

interface SignalsMonthFile {
  month: string;
  category?: string;
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

function signalCategoryUrl(month: string, category: string): string {
  return `${SIGNALS_BASE}/${monthFileSlug(month)}--${categoryFileSlug(category)}.json`;
}

function signalMonthUrl(month: string): string {
  return `${SIGNALS_BASE}/${monthFileSlug(month)}.json`;
}

function signalCategoriesWithAll(categories: string[]): string[] {
  const rest = categories.filter((c) => c !== 'All');
  return ['All', ...rest];
}

async function loadSignalsCategoryRows(
  month: string,
  category: string,
  index: SignalsIndex,
): Promise<SmartMoneySignalRow[]> {
  try {
    return await loadSignalsCategoryChunk(month, category);
  } catch {
    if (index.layout === 'by-category') return [];
    return loadSignalsMonolithFiltered(month, category);
  }
}

async function loadSignalsAllCategories(
  month: string,
  index: SignalsIndex,
): Promise<SmartMoneySignalRow[]> {
  const chunks = await Promise.all(
    index.categories.map((cat) => loadSignalsCategoryRows(month, cat, index)),
  );
  return chunks.flat();
}

export async function loadSignalsIndex(): Promise<SignalsIndex> {
  if (!signalsIndexPromise) {
    signalsIndexPromise = fetchJsonCached<SignalsIndex>(SIGNALS_INDEX);
  }
  return signalsIndexPromise;
}

async function loadSignalsCategoryChunk(month: string, category: string): Promise<SmartMoneySignalRow[]> {
  const file = await fetchJsonCached<SignalsMonthFile>(signalCategoryUrl(month, category));
  return file.rows;
}

async function loadSignalsMonolithFiltered(
  month: string,
  category: string,
): Promise<SmartMoneySignalRow[]> {
  const file = await fetchJsonCached<SignalsMonthFile>(signalMonthUrl(month));
  return file.rows.filter((r) => r.category === category);
}

export async function loadSignalsMonth(
  month: string,
  category = 'All',
): Promise<SmartMoneySignalsData> {
  const index = await loadSignalsIndex();
  const categories = signalCategoriesWithAll(index.categories);

  if (category === 'All') {
    const rows = await loadSignalsAllCategories(month, index);
    return { months: index.months, categories, rows };
  }

  const rows = await loadSignalsCategoryRows(month, category, index);
  return { months: index.months, categories, rows };
}

export async function loadTrackerIndex(): Promise<TrackerIndex> {
  if (!trackerIndexPromise) {
    trackerIndexPromise = fetchJsonCached<TrackerIndex>(TRACKER_INDEX);
  }
  return trackerIndexPromise;
}

export async function loadTrackerMonth(month: string): Promise<SmartMoneyTrackerData> {
  const index = await loadTrackerIndex();
  const file = await fetchJsonCached<TrackerMonthFile>(`${TRACKER_BASE}/${monthFileSlug(month)}.json`);
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
  const index = await loadSignalsIndex();
  const tryCategories =
    category && category !== 'All'
      ? [category]
      : index.categories;

  for (const cat of tryCategories) {
    let rows: SmartMoneySignalRow[];
    try {
      rows =
        index.layout === 'by-category'
          ? await loadSignalsCategoryChunk(month, cat)
          : await loadSignalsCategoryChunk(month, cat).catch(() =>
              loadSignalsMonolithFiltered(month, cat),
            );
    } catch {
      continue;
    }
    const matches = rows.filter((r) => r.stockSlug === stockSlug && r.month === month);
    if (!matches.length) continue;
    return (
      matches.find((r) => r.category === category) ||
      matches[0]
    );
  }
  return null;
}
