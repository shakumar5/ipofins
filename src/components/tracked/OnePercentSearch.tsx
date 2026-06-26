import { useMemo, useState } from 'react';
import { matchStockSearchQuery } from '../../lib/tracked-entities';
import { stockSignalPath } from '../../lib/stock-signal-meta';
import StockNotOnRadarCard from './StockNotOnRadarCard';

export type SearchMode = 'stock' | 'name';

export interface StockOption {
  slug: string;
  name: string;
}

export interface HolderOption {
  slug: string;
  name: string;
  entitySlug: string | null;
  profileUrl: string;
}

interface Props {
  stocks: StockOption[];
  mfStocks: StockOption[];
  holders: HolderOption[];
  stockBase: string;
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

  const stockResults = useMemo(() => {
    if (!query.trim() || mode !== 'stock') return [];
    const q = query.trim().toLowerCase();
    return stocks
      .filter((s) => s.name.toLowerCase().includes(q) || s.slug.includes(q.replace(/\s+/g, '-')))
      .slice(0, 12);
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

  const results = mode === 'stock' ? stockResults : holderResults;
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

  function goHolder(h: HolderOption) {
    window.location.href = h.profileUrl;
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
    if (mode === 'name' && holderResults[0]) goHolder(holderResults[0]);
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
          onClick={() => { setMode('stock'); setQuery(''); setOpen(false); }}
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
          onClick={() => { setMode('name'); setQuery(''); setOpen(false); }}
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
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
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
        {open && results.length > 0 && (
          <ul
            className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg"
            role="listbox"
          >
            {mode === 'stock'
              ? stockResults.map((s) => (
                  <li key={s.slug}>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-900 dark:text-white"
                      onClick={() => goStock(s.slug)}
                    >
                      {s.name}
                    </button>
                  </li>
                ))
              : holderResults.map((h) => (
                  <li key={`${h.entitySlug || h.slug}-${h.name}`}>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-900 dark:text-white"
                      onClick={() => goHolder(h)}
                    >
                      {h.name}
                      {h.entitySlug && (
                        <span className="ml-2 text-xs text-success-600 dark:text-success-400">curated</span>
                      )}
                    </button>
                  </li>
                ))}
          </ul>
        )}
      </form>
      <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">
        {mode === 'stock'
          ? 'Find every non-promoter shareholder owning ≥1% of a listed stock. No 1% Club match? We’ll send you to MF Stock Signal when available.'
          : 'See all stocks where an investor name appears in quarterly shareholding filings.'}
      </p>
    </div>
  );
}
