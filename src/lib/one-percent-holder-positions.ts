/**
 * Client-side lazy load for 1% Club holder positions (build export JSON).
 */

import { fetchJsonCached } from './client-data';
import { normalizeHolderSearchKey } from './holder-name-search';

export interface HolderPosition {
  stockSlug: string;
  stockName: string;
  pct: number | null;
  shares: number | null;
  marketValueCr: number | null;
  holderType?: string | null;
}

export type HolderPositionsMap = Record<string, HolderPosition[]>;

export const ONE_PERCENT_HOLDER_POSITIONS_URL = '/data/one-percent-holder-positions.json';

export function holderPositionsKey(name: string, entitySlug: string | null): string {
  return entitySlug ? `entity:${entitySlug}` : `name:${normalizeHolderSearchKey(name)}`;
}

/** Resolve positions even when export key differs slightly from search index key. */
export function resolveHolderPositions(
  map: HolderPositionsMap | null | undefined,
  name: string,
  entitySlug: string | null,
): HolderPosition[] {
  if (!map) return [];

  const candidates = [
    holderPositionsKey(name, entitySlug),
    entitySlug ? `entity:${entitySlug}` : null,
    `name:${normalizeHolderSearchKey(name)}`,
  ].filter(Boolean) as string[];

  for (const key of candidates) {
    const rows = map[key];
    if (rows?.length) return rows;
  }

  if (entitySlug) {
    const prefix = `entity:${entitySlug}`;
    for (const [key, rows] of Object.entries(map)) {
      if (key.startsWith(prefix) && rows.length) return rows;
    }
  }

  return [];
}

let loadPromise: Promise<HolderPositionsMap> | null = null;

export function loadHolderPositionsMap(): Promise<HolderPositionsMap> {
  if (loadPromise) return loadPromise;
  loadPromise = fetchJsonCached<HolderPositionsMap>(ONE_PERCENT_HOLDER_POSITIONS_URL).catch(
    () => ({} as HolderPositionsMap),
  );
  return loadPromise;
}
