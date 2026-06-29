/**
 * Build-time cache: read exported holder positions JSON once per process.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HolderPosition, HolderPositionsMap } from './one-percent-holder-positions';

export interface CachedHolderPosition extends HolderPosition {
  nseSymbol: string | null;
  isin: string | null;
  bseCode: string | null;
}

const EXPORT_PATH = join(process.cwd(), 'public', 'data', 'one-percent-holder-positions.json');

let exportMapCache: Map<string, CachedHolderPosition[]> | null | undefined;

function mapExportRecord(record: HolderPositionsMap): Map<string, CachedHolderPosition[]> {
  const map = new Map<string, CachedHolderPosition[]>();
  for (const [key, list] of Object.entries(record)) {
    map.set(
      key,
      list.map((p) => ({
        stockSlug: p.stockSlug,
        stockName: p.stockName,
        nseSymbol: (p as { nseSymbol?: string | null }).nseSymbol ?? null,
        isin: (p as { isin?: string | null }).isin ?? null,
        bseCode: (p as { bseCode?: string | null }).bseCode ?? null,
        pct: p.pct ?? null,
        shares: p.shares ?? null,
        marketValueCr: p.marketValueCr ?? null,
        holderType: p.holderType ?? null,
      })),
    );
  }
  return map;
}

export function loadHolderPositionsMapFromExport(): Map<string, CachedHolderPosition[]> | null {
  if (exportMapCache !== undefined) return exportMapCache;
  if (!existsSync(EXPORT_PATH)) {
    exportMapCache = null;
    return null;
  }
  try {
    const record = JSON.parse(readFileSync(EXPORT_PATH, 'utf8')) as HolderPositionsMap;
    exportMapCache = mapExportRecord(record);
    return exportMapCache;
  } catch {
    exportMapCache = null;
    return null;
  }
}

/** Normalize any holder-position map (export cache or SQL) into HolderPositionsMap. */
export function holderPositionsMapToRecord(
  map: Map<string, readonly HolderPosition[]>,
): HolderPositionsMap {
  const record: HolderPositionsMap = {};
  for (const [key, list] of map) {
    record[key] = list.map((p) => ({
      stockSlug: p.stockSlug,
      stockName: p.stockName,
      pct: p.pct ?? null,
      shares: p.shares ?? null,
      marketValueCr: p.marketValueCr ?? null,
      holderType: p.holderType ?? null,
    }));
  }
  return record;
}
