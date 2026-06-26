/**
 * Client-side lazy load for 1% Club holder positions (build export JSON).
 */

import { fetchJsonCached } from '../client-data';

export interface HolderPosition {
  stockSlug: string;
  stockName: string;
  pct: number | null;
  shares: number | null;
  marketValueCr: number | null;
}

export type HolderPositionsMap = Record<string, HolderPosition[]>;

export const ONE_PERCENT_HOLDER_POSITIONS_URL = '/data/one-percent-holder-positions.json';

export function normalizeHolderSearchKey(name: string): string {
  return String(name || '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function holderPositionsKey(name: string, entitySlug: string | null): string {
  return entitySlug ? `entity:${entitySlug}` : `name:${normalizeHolderSearchKey(name)}`;
}

let loadPromise: Promise<HolderPositionsMap> | null = null;

export function loadHolderPositionsMap(): Promise<HolderPositionsMap> {
  if (loadPromise) return loadPromise;
  loadPromise = fetchJsonCached<HolderPositionsMap>(ONE_PERCENT_HOLDER_POSITIONS_URL).catch(() => ({}));
  return loadPromise;
}
