/** Client-side fetch for full fund holdings (per-slug export JSON). */

export interface FundHoldingRow {
  name: string;
  sector: string;
  pct: number | string;
  stockSlug?: string;
}

let stockNameSlugIndex: Map<string, string> | null = null;

function normalizeStockNameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function loadStockNameSlugIndex(): Promise<Map<string, string>> {
  if (stockNameSlugIndex) return stockNameSlugIndex;
  const map = new Map<string, string>();
  try {
    const res = await fetch('/data/top-stocks.json');
    if (res.ok) {
      const data = (await res.json()) as {
        buckets?: Record<string, { stockSlug?: string; stockName?: string }[]>;
      };
      for (const rows of Object.values(data.buckets || {})) {
        for (const row of rows) {
          if (!row.stockSlug || !row.stockName) continue;
          const key = normalizeStockNameKey(row.stockName);
          if (!map.has(key)) map.set(key, row.stockSlug);
        }
      }
    }
  } catch {
    /* ignore */
  }
  stockNameSlugIndex = map;
  return map;
}

function resolveClientStockSlug(
  name: string,
  explicit: string | undefined,
  index: Map<string, string>,
): string | undefined {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  return index.get(normalizeStockNameKey(name));
}

export async function fetchFundHoldingsBySlug(fundSlug: string): Promise<FundHoldingRow[]> {
  const res = await fetch(`/data/fund-holdings-by-slug/${fundSlug}.json`);
  if (!res.ok) return [];
  const data = (await res.json()) as { stocks?: FundHoldingRow[] };
  const index = await loadStockNameSlugIndex();
  return (data.stocks || []).map((h) => ({
    name: String(h.name || ''),
    sector: String(h.sector || ''),
    pct: h.pct != null ? Number(h.pct) : 0,
    stockSlug: resolveClientStockSlug(String(h.name || ''), h.stockSlug, index),
  }));
}
