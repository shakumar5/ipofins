import { stockListingKey, type StockListingIdentity } from './stock-listing-key';

function holdingPct<T extends { pct?: number | null; pctOfCompany?: number | null }>(row: T): number {
  return row.pctOfCompany ?? row.pct ?? 0;
}

/** Keep one row per ISIN/NSE/BSE identity; prefer QoQ data, then higher stake, then shorter slug. */
export function dedupeHoldingsByStock<
  T extends StockListingIdentity & {
    stockSlug: string;
    stockName?: string;
    pct?: number | null;
    pctOfCompany?: number | null;
    prevPct?: number | null;
    changeType?: string | null;
  },
>(rows: T[]): T[] {
  function rowScore(row: T): number {
    let score = holdingPct(row);
    if (row.prevPct != null) score += 1000;
    if (row.changeType && row.changeType !== 'unchanged') score += 100;
    return score;
  }

  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = stockListingKey(row);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const rowScoreVal = rowScore(row);
    const prevScoreVal = rowScore(prev);
    if (rowScoreVal > prevScoreVal) {
      byKey.set(key, row);
      continue;
    }
    if (rowScoreVal === prevScoreVal && row.stockSlug.localeCompare(prev.stockSlug) < 0) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

export { stockListingKey, stockListingKeySql } from './stock-listing-key';
