import { useCallback, useEffect, useMemo, useState } from 'react';
import FilterSelect from '../funds/FilterSelect';
import {
  TOP_STOCKS_CAP_OPTIONS,
  TOP_STOCKS_FLOW_OPTIONS,
  TOP_STOCKS_SOURCE_OPTIONS,
  getTopStocksRows,
  type TopStocksCap,
  type TopStocksFlow,
  type TopStocksPayload,
  type TopStocksSource,
} from '../../lib/top-stocks-shared';
import {
  DEFAULT_TOP_STOCKS_FILTERS,
  parseTopStocksFiltersFromSearch,
  topStocksPath,
  type TopStocksFilters,
} from '../../lib/top-stocks-meta';
import { formatCr, onePercentStockUrl } from '../../lib/tracked-entities';
import { stockSignalPath } from '../../lib/stock-signal-meta';

interface Props {
  payload: TopStocksPayload;
  initialFilters?: TopStocksFilters;
}

function readFiltersFromLocation(): TopStocksFilters {
  if (typeof window === 'undefined') return DEFAULT_TOP_STOCKS_FILTERS;
  return parseTopStocksFiltersFromSearch(window.location.search);
}

function stockHref(source: TopStocksSource, stockSlug: string): string {
  if (source === 'mutual_funds') return stockSignalPath(stockSlug);
  return onePercentStockUrl(stockSlug);
}

export default function TopStocksBoard({ payload, initialFilters }: Props) {
  const [flow, setFlow] = useState<TopStocksFlow>(
    () => initialFilters?.flow ?? DEFAULT_TOP_STOCKS_FILTERS.flow,
  );
  const [source, setSource] = useState<TopStocksSource>(
    () => initialFilters?.source ?? DEFAULT_TOP_STOCKS_FILTERS.source,
  );
  const [cap, setCap] = useState<TopStocksCap>(
    () => initialFilters?.cap ?? DEFAULT_TOP_STOCKS_FILTERS.cap,
  );

  const applyFilters = useCallback((next: TopStocksFilters) => {
    setFlow(next.flow);
    setSource(next.source);
    setCap(next.cap);
  }, []);

  const syncUrl = useCallback((next: TopStocksFilters) => {
    if (typeof window === 'undefined') return;
    const path = topStocksPath(next);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== path) {
      window.history.replaceState(null, '', path);
    }
  }, []);

  const updateFilters = useCallback(
    (patch: Partial<TopStocksFilters>) => {
      const next: TopStocksFilters = { flow, source, cap, ...patch };
      applyFilters(next);
      syncUrl(next);
    },
    [applyFilters, cap, flow, source, syncUrl],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromUrl = () => applyFilters(readFiltersFromLocation());
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('pageshow', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('pageshow', syncFromUrl);
    };
  }, [applyFilters]);

  const rows = useMemo(
    () => getTopStocksRows(payload, source, cap, flow),
    [payload, source, cap, flow],
  );

  const period = payload.periods[source];
  const flowLabel = flow === 'accumulation' ? 'accumulated' : 'distributed';
  const sourceLabel = TOP_STOCKS_SOURCE_OPTIONS.find((o) => o.id === source)?.label ?? source;
  const capLabel = TOP_STOCKS_CAP_OPTIONS.find((o) => o.id === cap)?.label ?? cap;

  if (!payload.hasData) {
    return (
      <div className="card text-center py-12">
        <p className="text-surface-600 dark:text-surface-400 max-w-lg mx-auto">
          Top Stocks rankings will appear once holdings and shareholding data is loaded.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FilterSelect
          id="top-stocks-flow"
          label="Flow"
          value={flow}
          onChange={(e) => updateFilters({ flow: e.target.value as TopStocksFlow })}
        >
          {TOP_STOCKS_FLOW_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="top-stocks-source"
          label="Source"
          value={source}
          onChange={(e) => updateFilters({ source: e.target.value as TopStocksSource })}
        >
          {TOP_STOCKS_SOURCE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="top-stocks-cap"
          label="Market cap"
          value={cap}
          onChange={(e) => updateFilters({ cap: e.target.value as TopStocksCap })}
        >
          {TOP_STOCKS_CAP_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </FilterSelect>
      </div>

      {period && (
        <p className="text-sm text-surface-600 dark:text-surface-400">
          Latest period:{' '}
          <span className="font-medium text-surface-800 dark:text-surface-200">{period}</span>
          {' · '}
          Top 50 {capLabel} stocks by net rupees {flowLabel} ({sourceLabel})
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-surface-600 dark:text-surface-400">
            No {flow === 'accumulation' ? 'net buying' : 'net selling'} in {capLabel} for{' '}
            {sourceLabel}
            {period ? ` (${period})` : ''}.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-700 text-left text-surface-600 dark:text-surface-400">
                <th className="px-4 py-3 font-medium w-12">#</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium text-right">Bought</th>
                <th className="px-4 py-3 font-medium text-right">Sold</th>
                <th className="px-4 py-3 font-medium text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.stockSlug}
                  className="border-b border-surface-100 dark:border-surface-800 last:border-0"
                >
                  <td className="px-4 py-3 text-surface-500">{i + 1}</td>
                  <td className="px-4 py-3">
                    <a
                      href={stockHref(source, row.stockSlug)}
                      className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {row.stockName}
                    </a>
                    {row.sector ? (
                      <span className="block text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                        {row.sector}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCr(row.boughtCr)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-rose-700 dark:text-rose-400">
                    {formatCr(row.soldCr)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCr(row.netCr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
