import { useEffect, useState } from 'react';
import { fetchFundHoldingsBySlug, type FundHoldingRow } from '../../lib/fund-holdings-client';

export type { FundHoldingRow };

interface Props {
  holdings: FundHoldingRow[];
  fundSlug?: string;
  latestMonth?: string;
  portfolioStockCount?: number | null;
}

const INITIAL_ROWS = 20;
const ROWS_PAGE = 20;

export default function FundHoldingsTable({
  holdings: initialHoldings,
  fundSlug,
  latestMonth,
  portfolioStockCount,
}: Props) {
  const [allHoldings, setAllHoldings] = useState(initialHoldings);
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_ROWS);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchExhausted, setFetchExhausted] = useState(false);

  useEffect(() => {
    setAllHoldings(initialHoldings);
    setVisibleLimit(INITIAL_ROWS);
    setFetchExhausted(false);
  }, [initialHoldings, fundSlug]);

  useEffect(() => {
    if (!fundSlug || !portfolioStockCount || initialHoldings.length >= portfolioStockCount) return;
    let cancelled = false;
    void fetchFundHoldingsBySlug(fundSlug).then((rows) => {
      if (cancelled) return;
      if (rows.length > initialHoldings.length) {
        setAllHoldings(rows);
      }
      if (!portfolioStockCount || rows.length >= portfolioStockCount) {
        setFetchExhausted(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fundSlug, portfolioStockCount, initialHoldings]);

  const reportedTotal =
    portfolioStockCount && portfolioStockCount > allHoldings.length
      ? portfolioStockCount
      : allHoldings.length;
  const totalCount = fetchExhausted ? allHoldings.length : reportedTotal;
  const visibleHoldings = allHoldings.slice(0, visibleLimit);
  const hasMoreLoaded = visibleLimit < allHoldings.length;
  const canFetchMore = Boolean(
    !fetchExhausted && fundSlug && portfolioStockCount && allHoldings.length < portfolioStockCount,
  );
  const showMoreButton = hasMoreLoaded || canFetchMore;
  const remaining = Math.min(totalCount, canFetchMore ? totalCount : allHoldings.length) - visibleLimit;

  async function handleShowMore() {
    if (visibleLimit < allHoldings.length) {
      setVisibleLimit((n) => n + ROWS_PAGE);
      return;
    }
    if (!fundSlug) return;
    setLoadingMore(true);
    try {
      const rows = await fetchFundHoldingsBySlug(fundSlug);
      if (rows.length > allHoldings.length) {
        setAllHoldings(rows);
      }
      if (!portfolioStockCount || rows.length >= portfolioStockCount) {
        setFetchExhausted(true);
      }
      setVisibleLimit((n) => n + ROWS_PAGE);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <p className="text-xs text-surface-500 mb-4">
        Showing {Math.min(visibleLimit, allHoldings.length)} of {totalCount} stocks
        {latestMonth ? ` held by this fund as of ${latestMonth}` : ''} (Source: AMC monthly disclosure)
      </p>
      <div className="card overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-surface-500 uppercase border-b border-surface-200 dark:border-surface-700">
          <div className="col-span-1">#</div>
          <div className="col-span-5">Stock</div>
          <div className="col-span-3">Sector</div>
          <div className="col-span-3 text-right">Weight (%)</div>
        </div>
        {visibleHoldings.map((h, i) => (
          <div
            key={`${h.name}-${i}`}
            className={`grid grid-cols-12 gap-4 px-4 py-2.5 text-sm items-center ${i % 2 === 0 ? '' : 'bg-surface-50 dark:bg-surface-800/50'}`}
          >
            <div className="col-span-1 text-xs text-surface-400">{i + 1}</div>
            <div className="col-span-5">
              <p className="font-medium text-surface-900 dark:text-white text-sm">{h.name}</p>
              <p className="text-[10px] text-surface-400 md:hidden">{h.sector}</p>
            </div>
            <div className="col-span-3 text-xs text-surface-500 hidden md:block">{h.sector}</div>
            <div className="col-span-3 text-right">
              <span className="text-sm font-semibold text-primary-600">{h.pct}%</span>
            </div>
          </div>
        ))}
      </div>
      {showMoreButton && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => void handleShowMore()}
            disabled={loadingMore}
            className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : `Show more (${Math.max(remaining, 0)} remaining)`}
          </button>
        </div>
      )}
      <p className="text-xs text-surface-400 mt-3">
        All returns shown are for Direct-Growth plan. Data from AMC monthly portfolio disclosure.
      </p>
    </div>
  );
}
