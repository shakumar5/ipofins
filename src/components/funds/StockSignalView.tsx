import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SmartMoneySignalRow, SmartMoneySignalsData } from '../../lib/smart-money-signals';
import { buildInterpretation } from '../../lib/smart-money-signals';
import {
  parseStockSignalSlugFromPathname,
  stockSignalPath,
} from '../../lib/stock-signal-meta';

const MIN_SEARCH_LEN = 2;
const SUGGESTION_LIMIT = 8;

interface Props {
  data: SmartMoneySignalsData;
  initialStockSlug?: string | null;
  loading?: boolean;
}

function Stars({ count }: { count: number }) {
  return (
    <span className="text-amber-500 tracking-wider" aria-label={`${count} out of 5 stars`}>
      {'★'.repeat(count)}{'☆'.repeat(5 - count)}
    </span>
  );
}

function StockDetail({ row }: { row: SmartMoneySignalRow }) {
  const detailUrl = `/mutual-funds/smart-money/signal/${row.stockSlug}?month=${encodeURIComponent(row.month)}&category=${encodeURIComponent(row.category)}`;

  return (
    <div className="card p-5 md:p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-surface-900 dark:text-white">{row.stockName}</h2>
        <p className="text-sm text-surface-500 mt-1">{row.sector} · {row.category} · {row.month}</p>
      </div>

      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">Smart Money</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-surface-50 dark:bg-surface-800/60 p-4 text-center">
            <p className="text-xs text-surface-500 mb-1">Conviction Score</p>
            <p className="text-3xl font-bold text-primary-600 tabular-nums">{row.convictionScore}</p>
            <p className="text-xs text-surface-400">/ 100</p>
          </div>
          <div className="rounded-xl bg-surface-50 dark:bg-surface-800/60 p-4 text-center">
            <p className="text-xs text-surface-500 mb-1">Smart Money Signal</p>
            <p className="text-lg font-semibold text-surface-900 dark:text-white">
              {row.signalEmoji} {row.signal}
            </p>
          </div>
          <div className="rounded-xl bg-surface-50 dark:bg-surface-800/60 p-4 text-center">
            <p className="text-xs text-surface-500 mb-1">Institutional Confidence</p>
            <Stars count={row.confidenceStars} />
            <p className="text-sm font-medium text-surface-900 dark:text-white mt-1">{row.institutionalConfidence}</p>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">Mutual Fund Activity</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Metric label="Funds Holding" value={row.fundsHolding} />
          <Metric label="Funds Increased" value={row.increasedCount} positive />
          <Metric label="Funds Reduced" value={row.decreasedCount} negative />
          <Metric label="Fresh Entries" value={row.freshEntries} positive />
          <Metric label="Complete Exits" value={row.completeExits} negative />
          <Metric label="Net Buying" value={row.netBuying} signed />
        </div>
      </section>

      {row.topFundHolders.length > 0 && (
        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">Top Fund Holders</h3>
          <ul className="space-y-2">
            {row.topFundHolders.map((fund) => (
              <li
                key={fund}
                className="flex items-center gap-2 text-sm text-surface-800 dark:text-surface-200 bg-surface-50 dark:bg-surface-800/50 rounded-lg px-3 py-2"
              >
                <span className="text-primary-500">●</span>
                {fund}
              </li>
            ))}
          </ul>
          <p className="text-xs text-surface-400 mt-2">
            Ranked by portfolio weight (% of NAV) in {row.category} funds for {row.month}
          </p>
        </section>
      )}

      <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed border-t border-surface-200 dark:border-surface-700 pt-4">
        {row.interpretation || buildInterpretation(row.stockName, row.signal)}
      </p>

      <a
        href={detailUrl}
        className="inline-flex mt-4 text-sm font-medium text-primary-600 hover:underline"
      >
        View full score breakdown →
      </a>
    </div>
  );
}

function Metric({
  label,
  value,
  positive,
  negative,
  signed,
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
  signed?: boolean;
}) {
  let color = 'text-surface-900 dark:text-white';
  if (signed && value > 0) color = 'text-green-600 dark:text-green-400';
  if (signed && value < 0) color = 'text-red-500';
  if (positive && value > 0) color = 'text-green-600 dark:text-green-400';
  if (negative && value > 0) color = 'text-orange-500';

  return (
    <div className="rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2.5">
      <p className="text-[11px] text-surface-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>
        {signed && value > 0 ? '+' : ''}{value}
      </p>
    </div>
  );
}

function bestRowPerSlug(rows: SmartMoneySignalRow[]): SmartMoneySignalRow[] {
  const bySlug = new Map<string, SmartMoneySignalRow>();
  for (const row of rows) {
    const prev = bySlug.get(row.stockSlug);
    if (!prev || row.convictionScore > prev.convictionScore) bySlug.set(row.stockSlug, row);
  }
  return [...bySlug.values()].sort((a, b) => b.convictionScore - a.convictionScore);
}

export default function StockSignalView({ data, initialStockSlug = null, loading }: Props) {
  const month = data.months[0] || '';
  const [search, setSearch] = useState('');
  const [activeSlug, setActiveSlug] = useState<string | null>(initialStockSlug);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const monthRows = useMemo(
    () => data.rows.filter((r) => r.month === month),
    [data.rows, month],
  );

  const navigateToSlug = useCallback((slug: string, replace = false) => {
    const path = stockSignalPath(slug);
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setActiveSlug(slug);
    setSelectedCategory(null);
    setSearch('');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      const slug = parseStockSignalSlugFromPathname(window.location.pathname);
      setActiveSlug(slug);
      if (slug) setSelectedCategory(null);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  useEffect(() => {
    if (initialStockSlug && initialStockSlug !== activeSlug) {
      setActiveSlug(initialStockSlug);
    }
  }, [initialStockSlug, activeSlug]);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < MIN_SEARCH_LEN) return [];
    const matched = monthRows.filter((r) => r.stockName.toLowerCase().includes(q));
    return bestRowPerSlug(matched).slice(0, SUGGESTION_LIMIT);
  }, [monthRows, search]);

  const slugRows = useMemo(() => {
    if (!activeSlug) return [];
    return monthRows
      .filter((r) => r.stockSlug === activeSlug)
      .sort((a, b) => b.convictionScore - a.convictionScore);
  }, [monthRows, activeSlug]);

  const selectedRow = useMemo(() => {
    if (!slugRows.length) return null;
    if (selectedCategory) {
      return slugRows.find((r) => r.category === selectedCategory) || slugRows[0];
    }
    return slugRows[0];
  }, [slugRows, selectedCategory]);

  const otherCategories = useMemo(() => {
    if (!selectedRow) return [];
    return slugRows.filter((r) => r.category !== selectedRow.category);
  }, [slugRows, selectedRow]);

  const searchQuery = search.trim();
  const showIdle = !activeSlug && searchQuery.length < MIN_SEARCH_LEN;
  const showNoSearchResults = !activeSlug && searchQuery.length >= MIN_SEARCH_LEN && suggestions.length === 0;
  const showNotInMf = Boolean(activeSlug && slugRows.length === 0 && !loading);

  return (
    <div>
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <label htmlFor="stock-signal-search" className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">
          Search stock
        </label>
        <div className="relative">
          <input
            id="stock-signal-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. HDFC Bank, Reliance, TCS"
            className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-900 shadow-lg divide-y divide-surface-100 dark:divide-surface-700">
              {suggestions.map((row) => (
                <li key={row.stockSlug}>
                  <button
                    type="button"
                    onClick={() => navigateToSlug(row.stockSlug)}
                    className="w-full text-left px-3 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-800/60"
                  >
                    <span className="text-sm font-medium text-surface-900 dark:text-white">{row.stockName}</span>
                    <span className="text-xs text-surface-500 ml-2">{row.sector}</span>
                    <span className="float-right text-sm font-semibold text-primary-600 tabular-nums">{row.convictionScore}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {month && (
          <p className="text-xs text-surface-500 mt-2">Latest disclosure month: {month}</p>
        )}
      </div>

      {showIdle && (
        <p className="text-center py-12 text-surface-500 text-sm">
          Search a stock to see how mutual funds are buying or selling it.
        </p>
      )}

      {showNoSearchResults && (
        <div className="text-center py-12 text-surface-500 text-sm max-w-md mx-auto">
          <p>
            No stocks match &ldquo;{searchQuery}&rdquo;. Try the full company name.
          </p>
          <p className="text-xs text-surface-400 mt-2">
            We only show stocks that appear in AMC monthly portfolio disclosures.
          </p>
        </div>
      )}

      {showNotInMf && (
        <div className="text-center py-12 text-surface-500 text-sm max-w-md mx-auto">
          <p className="font-medium text-surface-700 dark:text-surface-300">
            Not held in disclosed mutual fund portfolios
          </p>
          <p className="text-xs text-surface-400 mt-2">
            This stock is not in our mutual fund holdings database for {month || 'the latest month'}.
            Recent IPOs, private companies, or stocks with zero MF holdings may not appear.
          </p>
          <a href={stockSignalPath()} className="text-primary-600 text-sm mt-4 inline-block hover:underline">
            ← Search another stock
          </a>
        </div>
      )}

      {selectedRow && (
        <>
          {otherCategories.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-surface-500">Also scored in:</span>
              {otherCategories.map((row) => (
                <button
                  key={row.category}
                  type="button"
                  onClick={() => setSelectedCategory(row.category)}
                  className="px-2.5 py-1 rounded-md bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30"
                >
                  {row.category} ({row.convictionScore})
                </button>
              ))}
            </div>
          )}
          <StockDetail row={selectedRow} />
        </>
      )}
    </div>
  );
}
