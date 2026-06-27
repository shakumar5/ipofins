/** Dedupe holdings when `stocks` has multiple rows for the same ISIN / NSE symbol. */

export function stockCanonicalKey(parts: {
  isin?: string | null;
  nseSymbol?: string | null;
  stockSlug: string;
}): string {
  const isin = String(parts.isin ?? '').trim().toUpperCase();
  if (isin) return `isin:${isin}`;
  const nse = String(parts.nseSymbol ?? '').trim().toUpperCase();
  if (nse) return `nse:${nse}`;
  return `slug:${parts.stockSlug}`;
}

function holdingPct<T extends { pct?: number | null; pctOfCompany?: number | null }>(row: T): number {
  return row.pctOfCompany ?? row.pct ?? 0;
}

/** Keep one row per listed company; prefer higher stake, then shorter slug (stable). */
export function dedupeHoldingsByStock<
  T extends {
    stockSlug: string;
    stockName?: string;
    isin?: string | null;
    nseSymbol?: string | null;
    pct?: number | null;
    pctOfCompany?: number | null;
  },
>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = stockCanonicalKey(row);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const rowPct = holdingPct(row);
    const prevPct = holdingPct(prev);
    if (rowPct > prevPct) {
      byKey.set(key, row);
      continue;
    }
    if (rowPct === prevPct && row.stockSlug.localeCompare(prev.stockSlug) < 0) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}