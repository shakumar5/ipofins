/** Client-side fetch for full fund holdings (per-slug export JSON). */

export interface FundHoldingRow {
  name: string;
  sector: string;
  pct: number | string;
  stockSlug?: string;
}

export async function fetchFundHoldingsBySlug(fundSlug: string): Promise<FundHoldingRow[]> {
  const res = await fetch(`/data/fund-holdings-by-slug/${fundSlug}.json`);
  if (!res.ok) return [];
  const data = (await res.json()) as { stocks?: FundHoldingRow[] };
  return (data.stocks || []).map((h) => ({
    name: String(h.name || ''),
    sector: String(h.sector || ''),
    pct: h.pct != null ? Number(h.pct) : 0,
    stockSlug: h.stockSlug ? String(h.stockSlug) : undefined,
  }));
}
