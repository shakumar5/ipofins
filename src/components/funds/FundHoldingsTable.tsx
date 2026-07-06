import { useEffect, useMemo, useState } from 'react';
import { fetchFundHoldingsBySlug, type FundHoldingRow } from '../../lib/fund-holdings-client';
import StockSignalLink from './StockSignalLink';

export type { FundHoldingRow };

interface Props {
  holdings: FundHoldingRow[];
  fundSlug?: string;
  latestMonth?: string;
  portfolioStockCount?: number | null;
}

const ROWS_PAGE = 40;

export default function FundHoldingsTable({
  holdings: initialHoldings,
  fundSlug,
  latestMonth,
  portfolioStockCount,
}: Props) {
  const expectedTotal = portfolioStockCount ?? initialHoldings.length;
  const startsComplete = initialHoldings.length >= expectedTotal;

  const [allHoldings, setAllHoldings] = useState(initialHoldings);
  const [visibleLimit, setVisibleLimit] = useState(
    startsComplete ? initialHoldings.length : Math.min(ROWS_PAGE, initialHoldings.length),
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchExhausted, setFetchExhausted] = useState(startsComplete);

  useEffect(() => {
    const total = portfolioStockCount ?? initialHoldings.length;
    const complete = initialHoldings.length >= total;
    setAllHoldings(initialHoldings);
    setVisibleLimit(complete ? initialHoldings.length : Math.min(ROWS_PAGE, initialHoldings.length));
    setFetchExhausted(complete);
  }, [initialHoldings, fundSlug, portfolioStockCount]);

  useEffect(() => {
    if (!fundSlug || fetchExhausted) return;
    if (portfolioStockCount && initialHoldings.length >= portfolioStockCount) return;

    let cancelled = false;
    void fetchFundHoldingsBySlug(fundSlug).then((rows) => {
      if (cancelled || !rows.length) return;
      setAllHoldings((prev) => (rows.length > prev.length ? rows : prev));
      if (!portfolioStockCount || rows.length >= portfolioStockCount) {
        setFetchExhausted(true);
        setVisibleLimit(rows.length);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fundSlug, portfolioStockCount, initialHoldings.length, fetchExhausted]);

  const totalCount = useMemo(() => {
    if (fetchExhausted) return allHoldings.length;
    if (portfolioStockCount && portfolioStockCount > allHoldings.length) return portfolioStockCount;
    return allHoldings.length;
  }, [allHoldings.length, fetchExhausted, portfolioStockCount]);

  const visibleHoldings = allHoldings.slice(0, visibleLimit);
  const hasMoreLoaded = visibleLimit < allHoldings.length;
  const canFetchMore = Boolean(
    !fetchExhausted && fundSlug && portfolioStockCount && allHoldings.length < portfolioStockCount,
  );
  const showMoreButton = hasMoreLoaded || canFetchMore;
  const remaining = totalCount - visibleLimit;

  async function handleShowMore() {
    if (visibleLimit < allHoldings.length) {
      setVisibleLimit((n) => Math.min(n + ROWS_PAGE, allHoldings.length));
      return;
    }
    if (!fundSlug) return;
    setLoadingMore(true);
    try {
      const rows = await fetchFundHoldingsBySlug(fundSlug);
      if (rows.length > allHoldings.length) {
        setAllHoldings(rows);
        setVisibleLimit(rows.length);
      }
      if (!portfolioStockCount || rows.length >= portfolioStockCount) {
        setFetchExhausted(true);
      } else {
        setVisibleLimit((n) => n + ROWS_PAGE);
      }
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
              <StockSignalLink stockSlug={h.stockSlug} className="font-medium text-sm">
                {h.name}
              </StockSignalLink>
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
