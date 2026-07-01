import type { TopStocksCap, TopStocksFlow, TopStocksSource } from './top-stocks-shared';
import {
  TOP_STOCKS_CAP_OPTIONS,
  TOP_STOCKS_FLOW_OPTIONS,
  TOP_STOCKS_SOURCE_OPTIONS,
} from './top-stocks-shared';

export const TOP_STOCKS_BASE = '/top-stocks';

export interface TopStocksFilters {
  flow: TopStocksFlow;
  source: TopStocksSource;
  cap: TopStocksCap;
}

export const DEFAULT_TOP_STOCKS_FILTERS: TopStocksFilters = {
  flow: 'accumulation',
  source: 'mutual_funds',
  cap: 'large',
};

function isFlow(v: string | null): v is TopStocksFlow {
  return TOP_STOCKS_FLOW_OPTIONS.some((o) => o.id === v);
}

function isSource(v: string | null): v is TopStocksSource {
  return TOP_STOCKS_SOURCE_OPTIONS.some((o) => o.id === v);
}

function isCap(v: string | null): v is TopStocksCap {
  return TOP_STOCKS_CAP_OPTIONS.some((o) => o.id === v);
}

export function parseTopStocksFiltersFromSearch(search: string): TopStocksFilters {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const flowParam = params.get('flow');
  const sourceParam = params.get('source');
  const capParam = params.get('cap');
  return {
    flow: isFlow(flowParam) ? flowParam : DEFAULT_TOP_STOCKS_FILTERS.flow,
    source: isSource(sourceParam) ? sourceParam : DEFAULT_TOP_STOCKS_FILTERS.source,
    cap: isCap(capParam) ? capParam : DEFAULT_TOP_STOCKS_FILTERS.cap,
  };
}

export function topStocksPath(filters: Partial<TopStocksFilters> = {}): string {
  const f: TopStocksFilters = { ...DEFAULT_TOP_STOCKS_FILTERS, ...filters };
  const params = new URLSearchParams();
  params.set('flow', f.flow);
  params.set('source', f.source);
  params.set('cap', f.cap);
  return `${TOP_STOCKS_BASE}?${params.toString()}`;
}