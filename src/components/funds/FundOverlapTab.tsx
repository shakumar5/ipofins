import { useDeferredValue, useMemo, useState } from 'react';
import { fundOverlapDetailHref } from '../../lib/list-back-nav';

interface FundOverlapItem {
  slug: string;
  name: string;
}

interface Props {
  funds: FundOverlapItem[];
}

const PAGE_SIZE = 40;

export default function FundOverlapTab({ funds }: Props) {
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return funds;
    return funds.filter((f) => f.name.toLowerCase().includes(q) || f.slug.includes(q));
  }, [funds, deferredQuery]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  if (funds.length === 0) {
    return (
      <p className="text-surface-500 py-12 text-center text-sm">
        Overlap data not available yet. Run the monthly holdings pipeline and compute overlaps.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-surface-500 mb-4">
        {funds.length} funds with holdings — select one to see overlap with other schemes that also have holdings data.
        For 2–4 fund comparison use{' '}
        <a href="/mutual-funds/portfolio-overlap-checker" className="text-primary-600 hover:underline">
          Portfolio Overlap Checker
        </a>
        .
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setVisibleCount(PAGE_SIZE);
        }}
        placeholder="Search funds…"
        className="w-full mb-4 px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
      />

      {deferredQuery !== query && (
        <p className="text-xs text-surface-400 mb-2">Searching…</p>
      )}

      <p className="text-xs text-surface-500 mb-3">
        Showing {visible.length} of {filtered.length} funds
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {visible.map((fund) => (
          <a
            key={fund.slug}
            href={fundOverlapDetailHref(fund.slug, 'fund-overlap')}
            className="card-compact block hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
          >
            <span className="text-sm font-medium text-surface-900 dark:text-white">{fund.name}</span>
          </a>
        ))}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200 hover:bg-surface-200 dark:hover:bg-surface-700"
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-sm text-surface-500 py-8">No funds match your search.</p>
      )}
    </div>
  );
}
