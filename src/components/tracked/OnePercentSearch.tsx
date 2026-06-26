import { useMemo, useState } from 'react';
import { filterStockSearchQuery, matchStockSearchQuery } from '../../lib/stock-search-match';
import { formatPct } from '../../lib/tracked-display';
import { stockSignalPath } from '../../lib/stock-signal-meta';
import StockNotOnRadarCard from './StockNotOnRadarCard';

export type SearchMode = 'stock' | 'name';

export interface StockOption {
  slug: string;
  name: string;
  nseSymbol?: string | null;
}

export interface HolderPosition {
  stockSlug: string;
  stockName: string;
  pct: number | null;
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

function HolderPositionsPanel({
  holder,
  stockBase,
}: {
  holder: SearchHolder;
  stockBase: string;
}) {
  if (!holder.positions.length) {
    return (
      <p className="text-sm text-surface-600 dark:text-surface-300 px-4 py-3">
        No ≥1% holdings found for &quot;{holder.name}&quot; in the latest quarter.
      </p>
    );
  }
  return (
    <div className="px-4 py-3 border-t border-surface-100 dark:border-surface-800">
      <p className="text-xs text-surface-500 dark:text-surface-400 mb-2">
        {holder.positions.length} stock{holder.positions.length === 1 ? '' : 's'} ≥1% (latest quarter)
      </p>
      <ul className="max-h-48 overflow-y-auto space-y-1">
        {holder.positions.map((p: HolderPosition) => (
          <li key={p.stockSlug}>
            <a
              href={`${stockBase}/${p.stockSlug}`}
              className="flex items-center justify-between gap-2 text-sm py-1 hover:text-primary-600 dark:hover:text-primary-400"
            >
              <span className="font-medium text-surface-900 dark:text-white truncate">{p.stockName}</span>
              <span className="text-xs tabular-nums text-surface-500 shrink-0">{formatPct(p.pct)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OnePercentSearch({
  stocks,
  mfStocks,
  holders,
  stockBase,
}: Props) {
  const [mode, setMode] = useState<SearchMode>('stock');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [expandedHolder, setExpandedHolder] = useState<SearchHolder | null>(null);

  const stockResults = useMemo(() => {
    if (!query.trim() || mode !== 'stock') return [];
    return filterStockSearchQuery(query, stocks, 12);
  }, [query, mode, stocks]);

  const mfMatch = useMemo(() => {
    if (!query.trim() || mode !== 'stock' || stockResults.length > 0) return null;
    return matchStockSearchQuery(query, mfStocks);
  }, [query, mode, mfStocks, stockResults.length]);

  const holderResults = useMemo(() => {
    if (!query.trim() || mode !== 'name') return [];
    const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
    return holders
      .filter((h) => h.name.toLowerCase().includes(q))
      .slice(0, 12);
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
    if (h.profileUrl) {
      window.location.href = h.profileUrl;
      return;
    }
    setExpandedHolder((prev) => (prev?.slug === h.slug ? null : h));
    setOpen(true);
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

  return (
    <div className="card">
      <div className="flex gap-2 mb-4" role="tablist" aria-label="Search mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'stock'}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === 'stock'
              ? 'bg-primary-600 text-white'
              : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200'
          }`}
          onClick={() => { setMode('stock'); setQuery(''); setOpen(false); setExpandedHolder(null); }}
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
          onClick={() => { setMode('name'); setQuery(''); setOpen(false); setExpandedHolder(null); }}
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
          placeholder={mode === 'stock' ? 'Search Reliance, TCS, Tata Motors…' : 'Search Vijay Kedia, Dolly Khanna…'}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setExpandedHolder(null); }}
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
              <span className="ml-2 text-xs text-primary-600 dark:text-primary-400">MF Stock Signal →</span>
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
        {open && showHolderEmpty && (
          <div
            className="absolute z-20 mt-1 w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg px-4 py-3 text-sm text-surface-600 dark:text-surface-300"
            role="status"
          >
            No investor name matched &quot;{query.trim()}&quot; in our latest shareholding filings.
          </div>
        )}
        {open && holderResults.length > 0 && mode === 'name' && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg overflow-hidden">
            <ul role="listbox" className="max-h-64 overflow-y-auto">
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
                    {h.entitySlug && (
                      <span className="ml-2 text-xs text-success-600 dark:text-success-400">curated</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {expandedHolder && holderResults.some((h) => h.slug === expandedHolder.slug) && (
              <HolderPositionsPanel holder={expandedHolder} stockBase={stockBase} />
            )}
          </div>
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
      {expandedHolder && mode === 'name' && !open && (
        <div className="mt-3 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
          <div className="px-4 py-2 bg-surface-50 dark:bg-surface-800/50 flex items-center justify-between">
            <span className="text-sm font-medium text-surface-900 dark:text-white">{expandedHolder.name}</span>
            <button
              type="button"
              className="text-xs text-surface-500 hover:text-surface-700"
              onClick={() => setExpandedHolder(null)}
            >
              Close
            </button>
          </div>
          <HolderPositionsPanel holder={expandedHolder} stockBase={stockBase} />
        </div>
      )}
      <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">
        {mode === 'stock'
          ? 'Find every non-promoter shareholder owning ≥1% of a listed stock. No 1% Club match? We’ll send you to MF Stock Signal when available.'
          : 'Search any ≥1% holder from quarterly filings. Curated super investors open their profile; others show holdings inline.'}
      </p>
    </div>
  );
}
