import { useMemo, useState } from 'react';
import { withErrorBoundary } from '../withErrorBoundary';
import { filterHolderSearchQuery } from '../../lib/holder-name-search';
import { filterStockSearchQuery, matchStockSearchQuery } from '../../lib/stock-search-match';
import type { HolderPosition } from '../../lib/one-percent-holder-positions';
import { stockSignalPath } from '../../lib/stock-signal-meta';import HolderHoldingsTable from './HolderHoldingsTable';
import StockNotOnRadarCard from './StockNotOnRadarCard';

export type SearchMode = 'stock' | 'name';

export interface StockOption {
  slug: string;
  name: string;
  nseSymbol?: string | null;
  isin?: string | null;
  bseCode?: string | null;
}

export interface SearchHolder {
  slug: string;
  name: string;
  entitySlug: string | null;
  profileUrl: string | null;
  stockCount: number;
  positions: HolderPosition[];
}
interface Props {
  stocks: StockOption[];
  mfStocks: StockOption[];
  holders: SearchHolder[];
  stockBase: string;
}

function OnePercentSearchInner({
  stocks,
  mfStocks,
  holders,
  stockBase,
}: Props) {
  const [mode, setMode] = useState<SearchMode>('stock');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [expandedHolder, setExpandedHolder] = useState<SearchHolder | null>(null);

  const stockResults = useMemo(() => {    if (!query.trim() || mode !== 'stock') return [];
    return filterStockSearchQuery(query, stocks, 12);
  }, [query, mode, stocks]);

  const mfMatch = useMemo(() => {
    if (!query.trim() || mode !== 'stock' || stockResults.length > 0) return null;
    return matchStockSearchQuery(query, mfStocks);
  }, [query, mode, mfStocks, stockResults.length]);

  const holderResults = useMemo(() => {
    if (!query.trim() || mode !== 'name') return [];
    return filterHolderSearchQuery(query, holders, 12);
  }, [query, mode, holders]);

  const showStockEmpty = mode === 'stock' && query.trim().length >= 2 && stockResults.length === 0;
  const showHolderEmpty = mode === 'name' && query.trim().length >= 2 && holderResults.length === 0;
  const mfStockSignalUrl = mfMatch ? stockSignalPath(mfMatch.slug) : null;
  const mfDisplayName = mfMatch?.name ?? query.trim();

  function goStock(slug: string) {
    window.location.href = `${stockBase}/${slug}`;
  }

  function goMfStockSignal(slug: string) {
    window.location.href = stockSignalPath(slug);
  }

  function selectHolder(h: SearchHolder) {
    setExpandedHolder(h);
    setQuery(h.name);
    setOpen(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'stock') {
      if (stockResults[0]) {
        goStock(stockResults[0].slug);
        return;
      }
      if (mfMatch) {
        goMfStockSignal(mfMatch.slug);
      }
      return;
    }
    if (mode === 'name' && holderResults[0]) selectHolder(holderResults[0]);
  }

  const expandedPositions = expandedHolder?.positions ?? [];
  return (
    <div className="card">
      <div className="relative z-30 flex gap-2 mb-4" role="tablist" aria-label="Search mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'stock'}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === 'stock'
              ? 'bg-primary-600 text-white'
              : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200'
          }`}
          onClick={() => {
            setMode('stock');
            setQuery('');
            setOpen(false);
            setExpandedHolder(null);
          }}
        >
          By stock
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'name'}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === 'name'
              ? 'bg-primary-600 text-white'
              : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200'
          }`}
          onClick={() => {
            setMode('name');
            setQuery('');
            setOpen(false);
            setExpandedHolder(null);
          }}
        >
          By investor name
        </button>
      </div>

      <form onSubmit={onSubmit} className="relative">
        <label htmlFor="opc-search" className="sr-only">
          {mode === 'stock' ? 'Search stock' : 'Search investor name'}
        </label>
        <input
          id="opc-search"
          type="search"
          autoComplete="off"
          placeholder={mode === 'stock' ? 'Search Reliance, TCS, Tata Motors...' : 'Search any ≥1% holder — promoters, FII, DII, funds, individuals...'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (expandedHolder && e.target.value !== expandedHolder.name) {
              setExpandedHolder(null);
            }
          }}
          onFocus={() => setOpen(true)}
          className="w-full px-4 py-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-white text-sm"
        />
        {open && showStockEmpty && mfMatch && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg overflow-hidden">
            <button
              type="button"
              className="w-full text-left px-4 py-3 text-sm hover:bg-primary-50 dark:hover:bg-primary-950/30 border-b border-surface-100 dark:border-surface-800"
              onClick={() => goMfStockSignal(mfMatch.slug)}
            >
              <span className="font-medium text-surface-900 dark:text-white">{mfMatch.name}</span>
              <span className="ml-2 text-xs text-primary-600 dark:text-primary-400">MF Stock Signal</span>
            </button>
            <div className="p-3">
              <StockNotOnRadarCard
                stockName={mfDisplayName}
                context="search"
                mfStockSignalUrl={mfStockSignalUrl}
              />
            </div>
          </div>
        )}
        {open && showStockEmpty && !mfMatch && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg p-3">
            <StockNotOnRadarCard stockName={query.trim()} context="search" />
          </div>
        )}
        {open && showHolderEmpty && (          <div
            className="absolute z-20 mt-1 w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg px-4 py-3 text-sm text-surface-600 dark:text-surface-300"
            role="status"
          >
            No investor name matched &quot;{query.trim()}&quot; in our latest shareholding filings.
          </div>
        )}
        {open && holderResults.length > 0 && mode === 'name' && (          <ul
            className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg"
            role="listbox"
          >
            {holderResults.map((h) => (
              <li key={`${h.entitySlug || h.slug}-${h.name}`}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-900 dark:text-white"
                  onClick={() => selectHolder(h)}
                >
                  <span className="font-medium">{h.name}</span>
                  <span className="ml-2 text-xs text-surface-500 tabular-nums">
                    {h.stockCount} stock{h.stockCount === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && stockResults.length > 0 && mode === 'stock' && (
          <ul
            className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg"
            role="listbox"
          >
            {stockResults.map((s) => (
              <li key={s.slug}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-900 dark:text-white"
                  onClick={() => goStock(s.slug)}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {expandedHolder && mode === 'name' && (
        <div className="mt-4 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
          <div className="px-4 py-3 bg-surface-50 dark:bg-surface-800/50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-surface-900 dark:text-white">{expandedHolder.name}</h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                {expandedPositions.length || expandedHolder.stockCount} stock
                {(expandedPositions.length || expandedHolder.stockCount) === 1 ? '' : 's'} with ≥1% stake (latest quarter)
              </p>
            </div>
            <div className="flex items-center gap-3">
              {expandedHolder.profileUrl && (
                <a
                  href={expandedHolder.profileUrl}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  View all holdings →
                </a>
              )}
              <button
                type="button"
                className="text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
                onClick={() => {
                  setExpandedHolder(null);
                  setQuery('');
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <HolderHoldingsTable
            positions={expandedPositions}
            stockBase={stockBase}
          />        </div>
      )}

      <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">
        {mode === 'stock'
          ? 'Find every shareholder owning ≥1% of a listed stock. No 1% Club match? We will send you to MF Stock Signal when available.'
          : 'Search any ≥1% holder from quarterly filings — promoters, FII, DII, mutual funds, or individuals. Select a name to see all their disclosed holdings.'}
      </p>
    </div>
  );
}

export default withErrorBoundary(OnePercentSearchInner, '1% Club Search');
