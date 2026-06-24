import { useState } from 'react';

export interface FundHoldingRow {
  name: string;
  sector: string;
  pct: number | string;
}

interface Props {
  holdings: FundHoldingRow[];
  latestMonth?: string;
  portfolioStockCount?: number | null;
}

const INITIAL_ROWS = 20;
const ROWS_PAGE = 20;

export default function FundHoldingsTable({ holdings, latestMonth, portfolioStockCount }: Props) {
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_ROWS);
  const visibleHoldings = holdings.slice(0, visibleLimit);
  const totalCount = portfolioStockCount && portfolioStockCount > holdings.length
    ? portfolioStockCount
    : holdings.length;
  const hasMore = visibleLimit < holdings.length;

  return (
    <div>
      <p className="text-xs text-surface-500 mb-4">
        Showing {Math.min(visibleLimit, holdings.length)} of {totalCount} stocks
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
      {hasMore && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setVisibleLimit((n) => n + ROWS_PAGE)}
            className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            Show more ({holdings.length - visibleLimit} remaining)
          </button>
        </div>
      )}
      <p className="text-xs text-surface-400 mt-3">
        All returns shown are for Direct-Growth plan. Data from AMC monthly portfolio disclosure.
      </p>
    </div>
  );
}
