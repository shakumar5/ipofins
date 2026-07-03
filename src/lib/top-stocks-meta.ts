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

export const TOP_STOCKS_SOURCE_SLUGS: Record<TopStocksSource, string> = {
  mutual_funds: 'mutual-funds',
  super_investors: 'super-investors',
  dii_fii: 'dii-fii',
  one_percent_club: 'one-percent-club',
};

const SOURCE_SLUG_TO_ID = new Map(
  Object.entries(TOP_STOCKS_SOURCE_SLUGS).map(([id, slug]) => [slug, id as TopStocksSource]),
);

function isFlow(v: string | null): v is TopStocksFlow {
  return TOP_STOCKS_FLOW_OPTIONS.some((o) => o.id === v);
}

function isSource(v: string | null): v is TopStocksSource {
  return TOP_STOCKS_SOURCE_OPTIONS.some((o) => o.id === v);
}

function isCap(v: string | null): v is TopStocksCap {
  return TOP_STOCKS_CAP_OPTIONS.some((o) => o.id === v);
}

/** @deprecated Legacy query URLs — use parseTopStocksFiltersFromPathname. */
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

export function parseTopStocksFiltersFromPathname(pathname: string): TopStocksFilters | null {
  const prefix = `${TOP_STOCKS_BASE}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).replace(/\/$/, '');
  const [sourceSlug, cap, flow] = rest.split('/');
  if (!sourceSlug || !cap || !flow) return null;
  const source = SOURCE_SLUG_TO_ID.get(sourceSlug);
  if (!source || !isCap(cap) || !isFlow(flow)) return null;
  return { source, cap, flow };
}

export function topStocksPath(filters: Partial<TopStocksFilters> = {}): string {
  const f: TopStocksFilters = { ...DEFAULT_TOP_STOCKS_FILTERS, ...filters };
  return `${TOP_STOCKS_BASE}/${TOP_STOCKS_SOURCE_SLUGS[f.source]}/${f.cap}/${f.flow}`;
}

export function loadTopStocksFilterPathParams(): TopStocksFilters[] {
  const combos: TopStocksFilters[] = [];
  for (const source of TOP_STOCKS_SOURCE_OPTIONS) {
    for (const cap of TOP_STOCKS_CAP_OPTIONS) {
      for (const flow of TOP_STOCKS_FLOW_OPTIONS) {
        combos.push({ source: source.id, cap: cap.id, flow: flow.id });
      }
    }
  }
  return combos;
}
