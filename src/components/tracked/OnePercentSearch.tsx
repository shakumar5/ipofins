import { useMemo, useState } from 'react';

export type SearchMode = 'stock' | 'name';

export interface StockOption {
  slug: string;
  name: string;
}

export interface HolderOption {
  slug: string;
  name: string;
  entitySlug: string | null;
}

interface Props {
  stocks: StockOption[];
  holders: HolderOption[];
  stockBase: string;
  holderBase: string;
  superInvestorBase: string;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export default function OnePercentSearch({
  stocks,
  holders,
  stockBase,
  holderBase,
  superInvestorBase,
}: Props) {
  const [mode, setMode] = useState<SearchMode>('stock');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const q = norm(query);

  const stockResults = useMemo(() => {
    if (!q || mode !== 'stock') return [];
    return stocks
      .filter((s) => norm(s.name).includes(q) || s.slug.includes(q.replace(/\s+/g, '-')))
      .slice(0, 12);
  }, [q, mode, stocks]);

  const holderResults = useMemo(() => {
    if (!q || mode !== 'name') return [];
    return holders
      .filter((h) => norm(h.name).includes(q))
      .slice(0, 12);
  }, [q, mode, holders]);

  const results = mode === 'stock' ? stockResults : holderResults;

  function goStock(slug: string) {
    window.location.href = `${stockBase}/${slug}`;
  }

  function goHolder(h: HolderOption) {
    if (h.entitySlug) {
      window.location.href = `${superInvestorBase}/${h.entitySlug}`;
      return;
    }
    window.location.href = `${holderBase}/${h.slug}`;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'stock' && stockResults[0]) goStock(stockResults[0].slug);
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
                  <li key={h.slug}>
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
          ? 'Find every non-promoter shareholder owning ≥1% of a listed stock.'
          : 'See all stocks where an investor name appears in quarterly shareholding filings.'}
      </p>
    </div>
  );
}
