import { useCallback, useEffect, useMemo, useState, useDeferredValue } from 'react';

import type { SmartMoneySignalRow } from '../../lib/smart-money-signals';
import { buildInterpretation, stockSignalMetaLine } from '../../lib/smart-money-signals';
import { loadSignalRowWithDetail } from '../../lib/smart-money-client';
import type { SignalSearchEntry } from '../../lib/smart-money-signals-meta';
import { stockMatchesSearchQuery } from '../../lib/stock-search-match';
import {
  parseStockSignalSlugFromPathname,
  stockSignalPath,
} from '../../lib/stock-signal-meta';
import { signalDetailHref } from '../../lib/list-back-nav';

import ConvictionScoreBreakdown from './ConvictionScoreBreakdown';

const MIN_SEARCH_LEN = 2;
const SUGGESTION_LIMIT = 8;

interface Props {
  month: string;
  months: string[];
  searchStocks: SignalSearchEntry[];
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

function StockDetail({ row, detailLoading, stockSlug }: { row: SmartMoneySignalRow; detailLoading?: boolean; stockSlug?: string | null }) {
  const detailUrl = signalDetailHref(row.stockSlug, 'stock-signal', row.month, row.category, {
    ...(stockSlug ? { stockSlug } : {}),
  });

  return (
    <div className="card p-5 md:p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-surface-900 dark:text-white">{row.stockName}</h2>
        <p className="text-sm text-surface-500 mt-1">{stockSignalMetaLine(row)}</p>
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
            Ranked by portfolio weight (% of NAV) across all mutual funds for {row.month}
          </p>
        </section>
      )}

      <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed border-t border-surface-200 dark:border-surface-700 pt-4">
        {row.interpretation || buildInterpretation(row.stockName, row.signal)}
      </p>

      {detailLoading ? (
        <p className="text-xs text-surface-500 mt-4">Loading score breakdown…</p>
      ) : (
        <ConvictionScoreBreakdown row={row} />
      )}

      <a
        href={detailUrl}
        className="inline-flex mt-4 text-sm font-medium text-primary-600 hover:underline"
      >
        Open full signal page →
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

export default function StockSignalView({
  month,
  searchStocks,
  initialStockSlug = null,
  loading,
}: Props) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [activeSlug, setActiveSlug] = useState<string | null>(initialStockSlug);
  const [selectedRow, setSelectedRow] = useState<SmartMoneySignalRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const navigateToSlug = useCallback((slug: string, replace = false) => {
    const path = stockSignalPath(slug);
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setActiveSlug(slug);
    setSearch('');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      const slug = parseStockSignalSlugFromPathname(window.location.pathname);
      setActiveSlug(slug);
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

  useEffect(() => {
    if (!activeSlug || !month) {
      setSelectedRow(null);
      return;
    }

    const entry = searchStocks.find((s) => s.stockSlug === activeSlug);
    if (!entry) {
      setSelectedRow(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    loadSignalRowWithDetail(activeSlug, month, entry.category)
      .then((row) => {
        if (!cancelled) setSelectedRow(row);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSlug, month, searchStocks]);

  const suggestions = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (q.length < MIN_SEARCH_LEN) return [];
    return searchStocks
      .filter((s) => stockMatchesSearchQuery(s.stockName, s.stockSlug, q, s.nseSymbol))
      .sort((a, b) => b.convictionScore - a.convictionScore)
      .slice(0, SUGGESTION_LIMIT);
  }, [searchStocks, deferredSearch]);

  const searchQuery = search.trim();
  const deferredQuery = deferredSearch.trim();
  const searchPending = deferredQuery !== searchQuery;
  const showIdle = !activeSlug && searchQuery.length < MIN_SEARCH_LEN;
  const showNoSearchResults = !activeSlug && deferredQuery.length >= MIN_SEARCH_LEN && suggestions.length === 0 && !searchPending;
  const inSearchIndex = activeSlug ? searchStocks.some((s) => s.stockSlug === activeSlug) : false;
  const showNotInMf = Boolean(activeSlug && !inSearchIndex && !loading && !detailLoading);

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
          {searchPending && searchQuery.length >= MIN_SEARCH_LEN && (
            <p className="text-xs text-surface-400 mt-2">Searching…</p>
          )}
          {suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-900 shadow-lg divide-y divide-surface-100 dark:divide-surface-700">
              {suggestions.map((entry) => (
                <li key={entry.stockSlug}>
                  <button
                    type="button"
                    onClick={() => navigateToSlug(entry.stockSlug)}
                    className="w-full text-left px-3 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-800/60"
                  >
                    <span className="text-sm font-medium text-surface-900 dark:text-white">{entry.stockName}</span>
                    <span className="text-xs text-surface-500 ml-2">{entry.sector}</span>
                    <span className="float-right text-sm font-semibold text-primary-600 tabular-nums">{entry.convictionScore}</span>
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

      {selectedRow && <StockDetail row={selectedRow} detailLoading={detailLoading} stockSlug={activeSlug} />}
    </div>
  );
}
