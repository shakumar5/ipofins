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

export function loadHoldingsCompareIndex(): Promise<HoldingsCompareIndex | null> {
  if (!indexPromise) {
    indexPromise = fetch(INDEX_URL)
      .then((r) => (r.ok ? (r.json() as Promise<HoldingsCompareIndex>) : null))
      .catch(() => null);
  }
  return indexPromise;
}

export async function loadHoldingsCompareAmc(
  amcSlug: string,
): Promise<Record<string, HoldingsCompareFund>> {
  const data = await fetchJsonCached<{ holdings: Record<string, HoldingsCompareFund> }>(
    `${AMC_BASE}/${amcSlug}.json`,
  );
  return data.holdings;
}

/** Fallback when split files are not exported yet. */
export async function loadHoldingsCompareLegacy(): Promise<HoldingsCompareData> {
  return fetchJsonCached<HoldingsCompareData>(LEGACY_URL);
}

export function amcSlugFromName(index: HoldingsCompareIndex, amcName: string): string | null {
  return index.amcs.find((a) => a.name === amcName)?.slug ?? null;
}
