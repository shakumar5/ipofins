/**
 * Holdings Changes pages — static JSON only (no Neon).
 * Data is exported to public/data/ on every build via export-client-data.mjs.
 */

import {
  holdingsStatsFromIndex,
  monthsFromIndex,
  readHoldingsCompareIndexFromDisk,
  type HoldingsCompareIndexDisk,
} from './holdings-compare-server';

export type HoldingsPageBootstrap = {
  index: HoldingsCompareIndexDisk;
  stats: {
    amcCount: number;
    fundsCovered: number;
    latestMonth: string;
  };
  /** Newest month first (for month tabs / listings). */
  monthsNewestFirst: string[];
};

export function loadHoldingsPageBootstrap(): HoldingsPageBootstrap | null {
  const index = readHoldingsCompareIndexFromDisk();
  if (!index?.amcs?.length || !index.months?.length) return null;
  return {
    index,
    stats: holdingsStatsFromIndex(index),
    monthsNewestFirst: monthsFromIndex(index),
  };
}

export function amcListFromIndex(index: HoldingsCompareIndexDisk) {
  return index.amcs.map((a) => ({
    name: a.name,
    slug: a.slug,
    fundCount: a.fundCount,
  }));
}
