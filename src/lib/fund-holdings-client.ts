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

function ingestStockRows(
  map: Map<string, string>,
  rows: { stockSlug?: string; stockName?: string }[] | undefined,
): void {
  for (const row of rows || []) {
    if (!row.stockSlug || !row.stockName) continue;
    const key = normalizeStockNameKey(row.stockName);
    if (!map.has(key)) map.set(key, row.stockSlug);
  }
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
        ingestStockRows(map, rows);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const indexRes = await fetch('/data/smart-money-signals-index.json');
    if (indexRes.ok) {
      const index = (await indexRes.json()) as { months?: { label: string }[] };
      const latest = index.months?.[0]?.label;
      if (latest) {
        const monthSlug = latest.toLowerCase().replace(/\s+/g, '-');
        const searchRes = await fetch(`/data/smart-money-signals/${monthSlug}--search.json`);
        if (searchRes.ok) {
          ingestStockRows(map, (await searchRes.json()) as { stockSlug?: string; stockName?: string }[]);
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
