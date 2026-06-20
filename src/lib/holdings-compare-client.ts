import { fetchJsonCached } from './client-data';

const INDEX_URL = '/data/holdings-compare-index.json';
const AMC_BASE = '/data/holdings-compare/amc';
const LEGACY_URL = '/data/holdings-compare.json';

export interface HoldingsCompareHolding {
  name: string;
  isin: string;
  sector: string;
  pct: number;
}

export interface HoldingsCompareFund {
  name: string;
  amc: string;
  [month: string]: HoldingsCompareHolding[] | string;
}

export interface HoldingsCompareIndex {
  months: string[];
  amcs: { name: string; slug: string; fundCount: number }[];
}

export interface HoldingsCompareData {
  months: string[];
  amcs: Record<string, string[]>;
  holdings: Record<string, HoldingsCompareFund>;
}

let indexPromise: Promise<HoldingsCompareIndex | null> | null = null;

export function resetHoldingsCompareIndexCache(): void {
  indexPromise = null;
}

export function loadHoldingsCompareIndex(force = false): Promise<HoldingsCompareIndex | null> {
  if (force) indexPromise = null;
  if (!indexPromise) {
    indexPromise = fetchJsonCached<HoldingsCompareIndex>(INDEX_URL)
      .then((data) => data)
      .catch(() => {
        indexPromise = null;
        return null;
      });
  }
  return indexPromise;
}

export async function loadHoldingsCompareAmc(
  amcSlug: string,
): Promise<Record<string, HoldingsCompareFund>> {
  const url = `${AMC_BASE}/${amcSlug}.json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'default' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { holdings?: Record<string, HoldingsCompareFund> };
    if (!data?.holdings || Object.keys(data.holdings).length === 0) {
      throw new Error(`No holdings found for AMC "${amcSlug}"`);
    }
    return data.holdings;
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error';
    throw new Error(`Failed to load ${url} (${msg})`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Fallback when split files are not exported yet. */
export async function loadHoldingsCompareLegacy(): Promise<HoldingsCompareData> {
  return fetchJsonCached<HoldingsCompareData>(LEGACY_URL);
}

export function amcSlugFromName(index: HoldingsCompareIndex, amcName: string): string | null {
  return index.amcs.find((a) => a.name === amcName)?.slug ?? null;
}
