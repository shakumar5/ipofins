import { fetchJsonCached, monthFileSlug, categoryFileSlug } from './client-data';
import type { SmartMoneyMonthData, SmartMoneyTrackerData } from './data/holdings';
import type {
  FundActivityLists,
  SignalFactorScores,
  SmartMoneySignalsData,
  SmartMoneySignalRow,
} from './smart-money-signals';
import { buildInterpretation, dedupeSignalsByStock, hydrateSignalListRow, signalMarketCapFilterOptions } from './smart-money-signals';
import {
  signalCategoryDetailPublicUrl,
  signalSearchPublicUrl,
  type SignalSearchEntry,
  type SignalsSearchIndexFile,
} from './smart-money-signals-meta';

const SIGNALS_INDEX = '/data/smart-money-signals-index.json';
const SIGNALS_BASE = '/data/smart-money-signals';
const TRACKER_INDEX = '/data/smart-money-tracker-index.json';
const TRACKER_BASE = '/data/smart-money-tracker';

interface SignalsIndex {
  months: string[];
  categories: string[];
  layout?: 'by-category' | 'monolith';
  scoringModel?: 'conviction-v2' | 'stock-cap-v2' | 'fund-scheme-v1';
  dataTier?: 'list+detail+search' | 'by-category' | 'monolith';
}

interface SignalsMonthFile {
  month: string;
  category?: string;
  rows: SmartMoneySignalRow[];
}

export interface SmartMoneySignalDetailOverlay {
  stockSlug: string;
  factorScores?: SignalFactorScores;
  factorBreakdown?: SmartMoneySignalRow['factorBreakdown'];
  fundActivity?: FundActivityLists;
  interpretation?: string;
  topFundHolders?: string[];
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
const detailOverlayCache = new Map<string, Promise<Map<string, SmartMoneySignalDetailOverlay>>>();

function signalCategoryUrl(month: string, category: string): string {
  return `${SIGNALS_BASE}/${monthFileSlug(month)}--${categoryFileSlug(category)}.json`;
}

function signalMonthUrl(month: string): string {
  return `${SIGNALS_BASE}/${monthFileSlug(month)}.json`;
}

function signalCategoriesWithAll(
  categories: string[],
  scoringModel?: SignalsIndex['scoringModel'],
): string[] {
  return signalMarketCapFilterOptions(categories, scoringModel);
}

function mergeSignalWithDetail(
  list: SmartMoneySignalRow,
  detail?: SmartMoneySignalDetailOverlay | null,
): SmartMoneySignalRow {
  if (!detail) return list;
  return {
    ...list,
    ...(detail.factorScores ? { factorScores: detail.factorScores } : {}),
    ...(detail.factorBreakdown ? { factorBreakdown: detail.factorBreakdown } : {}),
    ...(detail.fundActivity ? { fundActivity: detail.fundActivity } : {}),
    ...(detail.topFundHolders?.length ? { topFundHolders: detail.topFundHolders } : {}),
    interpretation:
      list.interpretation ||
      detail.interpretation ||
      buildInterpretation(list.stockName, list.signal),
  };
}

async function loadDetailOverlayMap(
  month: string,
  category: string,
): Promise<Map<string, SmartMoneySignalDetailOverlay>> {
  const key = `${month}::${category}`;
  let pending = detailOverlayCache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const file = await fetchJsonCached<{ rows: SmartMoneySignalDetailOverlay[] }>(
          signalCategoryDetailPublicUrl(month, category),
        );
        return new Map(file.rows.map((row) => [row.stockSlug, row]));
      } catch {
        return new Map();
      }
    })();
    detailOverlayCache.set(key, pending);
  }
  return pending;
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
  const merged = chunks.flat();
  if (index.scoringModel === 'conviction-v2' || index.scoringModel === 'stock-cap-v2') return merged;
  return dedupeSignalsByStock(merged);
}

export async function loadSignalsIndex(): Promise<SignalsIndex> {
  if (!signalsIndexPromise) {
    signalsIndexPromise = fetchJsonCached<SignalsIndex>(SIGNALS_INDEX);
  }
  return signalsIndexPromise;
}

export async function loadSignalsSearchIndex(month: string): Promise<SignalSearchEntry[]> {
  const index = await loadSignalsIndex();
  try {
    const rows = await loadSignalsAllCategories(month, index);
    return dedupeSignalsByStock(rows)
      .sort((a, b) => b.convictionScore - a.convictionScore)
      .map((row) => ({
        stockSlug: row.stockSlug,
        stockName: row.stockName,
        sector: row.sector,
        category: row.category,
        convictionScore: row.convictionScore,
        signal: row.signal,
        ...(row.nseSymbol ? { nseSymbol: row.nseSymbol } : {}),
      }));
  } catch {
    const file = await fetchJsonCached<SignalsSearchIndexFile>(signalSearchPublicUrl(month));
    return file.stocks;
  }
}

async function loadSignalsCategoryChunk(month: string, category: string): Promise<SmartMoneySignalRow[]> {
  const file = await fetchJsonCached<SignalsMonthFile>(signalCategoryUrl(month, category));
  const envelope = { month: file.month ?? month, category: file.category ?? category };
  return file.rows.map((row) => hydrateSignalListRow(row, envelope));
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
  const categories = signalCategoriesWithAll(index.categories, index.scoringModel);

  if (category === 'All') {
    const rows = await loadSignalsAllCategories(month, index);
    return { months: index.months, categories, rows };
  }

  const rows = await loadSignalsCategoryRows(month, category, index);
  return { months: index.months, categories, rows };
}

export async function loadSignalRowWithDetail(
  stockSlug: string,
  month: string,
  category: string,
): Promise<SmartMoneySignalRow | null> {
  const rows = await loadSignalsCategoryRows(month, category, await loadSignalsIndex());
  const listRow = rows.find((r) => r.stockSlug === stockSlug);
  if (!listRow) return null;
  const overlays = await loadDetailOverlayMap(month, category);
  return mergeSignalWithDetail(listRow, overlays.get(stockSlug));
}

export async function loadTrackerIndex(): Promise<TrackerIndex> {
  if (!trackerIndexPromise) {
    trackerIndexPromise = fetchJsonCached<TrackerIndex>(TRACKER_INDEX);
  }
  return trackerIndexPromise;
}

export async function loadTrackerMonthData(month: string): Promise<SmartMoneyMonthData | null> {
  try {
    const file = await fetchJsonCached<TrackerMonthFile>(`${TRACKER_BASE}/${monthFileSlug(month)}.json`);
    return {
      month: file.month,
      prevMonth: file.prevMonth,
      increased: file.increased,
      decreased: file.decreased,
      fresh_entry: file.fresh_entry,
      complete_exit: file.complete_exit,
    };
  } catch {
    return null;
  }
}

export async function loadTrackerMonth(
  month: string,
  cachedIndex?: TrackerIndex,
): Promise<SmartMoneyTrackerData> {
  const [index, file] = await Promise.all([
    cachedIndex ? Promise.resolve(cachedIndex) : loadTrackerIndex(),
    fetchJsonCached<TrackerMonthFile>(`${TRACKER_BASE}/${monthFileSlug(month)}.json`),
  ]);
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

export async function findSignalRowsForStock(
  stockSlug: string,
  month: string,
): Promise<SmartMoneySignalRow[]> {
  const index = await loadSignalsIndex();
  const matches: SmartMoneySignalRow[] = [];

  for (const cat of index.categories) {
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
    for (const row of rows) {
      if (row.stockSlug === stockSlug && row.month === month) {
        matches.push(row);
      }
    }
  }

  return matches;
}

export async function findSignalRow(
  stockSlug: string,
  month: string,
  category: string,
): Promise<SmartMoneySignalRow | null> {
  const matches = await findSignalRowsForStock(stockSlug, month);
  if (!matches.length) return null;

  const picked =
    category && category !== 'All'
      ? matches.find((r) => r.category === category) ?? matches[0] ?? null
      : matches[0] ?? null;

  if (!picked) return null;

  const overlays = await loadDetailOverlayMap(month, picked.category);
  return mergeSignalWithDetail(picked, overlays.get(stockSlug));
}
