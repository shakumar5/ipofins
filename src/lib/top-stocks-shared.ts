/**
 * Top Stocks — shared types and bucket helpers (safe for client bundles).
 */

export type TopStocksSource =
  | 'mutual_funds'
  | 'super_investors'
  | 'dii_fii'
  | 'one_percent_club';
export type TopStocksFlow = 'accumulation' | 'distribution';
export type TopStocksCap = 'large' | 'mid' | 'small' | 'micro';

export const TOP_STOCKS_SOURCE_OPTIONS: { id: TopStocksSource; label: string }[] = [
  { id: 'mutual_funds', label: 'Mutual Funds' },
  { id: 'super_investors', label: 'Super Investors' },
  { id: 'dii_fii', label: 'DII & FII' },
  { id: 'one_percent_club', label: '1% Club' },
];

export const TOP_STOCKS_FLOW_OPTIONS: { id: TopStocksFlow; label: string }[] = [
  { id: 'accumulation', label: 'Accumulation' },
  { id: 'distribution', label: 'Distribution' },
];

export const TOP_STOCKS_CAP_OPTIONS: { id: TopStocksCap; label: string }[] = [
  { id: 'large', label: 'Large Cap' },
  { id: 'mid', label: 'Mid Cap' },
  { id: 'small', label: 'Small Cap' },
  { id: 'micro', label: 'Micro Cap' },
];

export interface TopStockRow {
  stockSlug: string;
  stockName: string;
  sector: string;
  boughtCr: number;
  soldCr: number;
  netCr: number;
}

export interface TopStocksPayload {
  periods: Record<TopStocksSource, string>;
  buckets: Record<string, TopStockRow[]>;
  hasData: boolean;
}

export const TOP_STOCKS_DATA_URL = '/data/top-stocks.json';

export interface RawFlowRow {
  stock_slug: string;
  stock_name: string;
  sector: string | null;
  market_cap_category: string | null;
  bought_cr: number | string | null;
  sold_cr: number | string | null;
}

export function bucketKey(source: TopStocksSource, cap: TopStocksCap, flow: TopStocksFlow): string {
  return `${source}:${cap}:${flow}`;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRawRow(r: RawFlowRow): Omit<TopStockRow, 'netCr'> & { cap: TopStocksCap | null; netCr: number } {
  const boughtCr = Math.round(toNum(r.bought_cr) * 100) / 100;
  const soldCr = Math.round(toNum(r.sold_cr) * 100) / 100;
  const cap = r.market_cap_category as TopStocksCap | null;
  return {
    stockSlug: String(r.stock_slug),
    stockName: String(r.stock_name),
    sector: r.sector ? String(r.sector) : '',
    boughtCr,
    soldCr,
    netCr: Math.round((boughtCr - soldCr) * 100) / 100,
    cap: cap && TOP_STOCKS_CAP_OPTIONS.some((c) => c.id === cap) ? cap : null,
  };
}

export function buildBuckets(source: TopStocksSource, rows: RawFlowRow[]): Record<string, TopStockRow[]> {
  const byCap = new Map<TopStocksCap, TopStockRow[]>();
  for (const opt of TOP_STOCKS_CAP_OPTIONS) {
    byCap.set(opt.id, []);
  }

  for (const raw of rows) {
    const row = mapRawRow(raw);
    if (!row.cap) continue;
    byCap.get(row.cap)!.push({
      stockSlug: row.stockSlug,
      stockName: row.stockName,
      sector: row.sector,
      boughtCr: row.boughtCr,
      soldCr: row.soldCr,
      netCr: row.netCr,
    });
  }

  const out: Record<string, TopStockRow[]> = {};
  for (const opt of TOP_STOCKS_CAP_OPTIONS) {
    const list = byCap.get(opt.id)!;
    out[bucketKey(source, opt.id, 'accumulation')] = [...list]
      .filter((r) => r.netCr > 0)
      .sort((a, b) => b.netCr - a.netCr)
      .slice(0, 50);
    out[bucketKey(source, opt.id, 'distribution')] = [...list]
      .filter((r) => r.netCr < 0)
      .sort((a, b) => a.netCr - b.netCr)
      .slice(0, 50);
  }
  return out;
}

export function emptyTopStocksPayload(): TopStocksPayload {
  return {
    periods: { mutual_funds: '', super_investors: '', dii_fii: '', one_percent_club: '' },
    buckets: {},
    hasData: false,
  };
}

export function getTopStocksRows(
  payload: TopStocksPayload,
  source: TopStocksSource,
  cap: TopStocksCap,
  flow: TopStocksFlow,
): TopStockRow[] {
  return payload.buckets[bucketKey(source, cap, flow)] ?? [];
}

export { bucketKey as topStocksBucketKey };
