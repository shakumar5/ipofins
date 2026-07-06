/**
 * Single resolver for fund detail holdings — per-fund export JSON only.
 */
import { readFundHoldingsBySlugFromDisk } from './holdings-compare-server';

export interface ResolvedFundHoldings {
  rows: Record<string, unknown>[];
  stockCount: number;
}

/** Latest-month holdings for a fund page (disk export, no Neon). */
export function resolveFundHoldingsFromDisk(fundSlug: string): ResolvedFundHoldings {
  const rows = readFundHoldingsBySlugFromDisk(fundSlug) ?? [];
  return {
    rows,
    stockCount: rows.length,
  };
}
