import { useMemo } from 'react';

import type { SmartMoneyMonthData } from '../../lib/data/holdings';
import { buildSectorStockMoves, type SectorStockMoveSummary } from '../../lib/holdings-utils';
import { stockSignalPath } from '../../lib/stock-signal-meta';

const MOVE_LISTS: {
  key: keyof ReturnType<typeof buildSectorStockMoves>;
  label: string;
  metric: 'funds' | 'weight';
}[] = [
  { key: 'mostBought', label: 'Most bought', metric: 'weight' },
  { key: 'increased', label: 'Most funds adding', metric: 'funds' },
  { key: 'fresh', label: 'Fresh entries', metric: 'funds' },
  { key: 'decreased', label: 'Decreased', metric: 'weight' },
  { key: 'exits', label: 'Complete exits', metric: 'funds' },
];

function formatMoveMetric(stock: SectorStockMoveSummary, metric: 'funds' | 'weight'): string {
  if (metric === 'funds') return `${stock.fundCount} fund${stock.fundCount === 1 ? '' : 's'}`;
  const sign = stock.weightTotal >= 0 ? '+' : '';
  return `${sign}${stock.weightTotal.toFixed(2)}%`;
}

interface Props {
  sector: string;
  monthMoves: SmartMoneyMonthData;
}

export default function SectorStockMovesPanel({ sector, monthMoves }: Props) {
  const moves = useMemo(() => buildSectorStockMoves(sector, monthMoves, 5), [sector, monthMoves]);
  const hasAny = MOVE_LISTS.some(({ key }) => moves[key].length > 0);

  if (!hasAny) {
    return (
      <p className="text-xs text-surface-500 dark:text-surface-400 py-2">
        No stock-level moves in this sector for {monthMoves.month}.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {MOVE_LISTS.map(({ key, label, metric }) => (
        <div
          key={key}
          className="rounded-lg bg-surface-50 dark:bg-surface-800/60 p-2.5 border border-surface-100 dark:border-surface-700"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400 mb-1.5">
            {label}
          </p>
          {moves[key].length === 0 ? (
            <p className="text-xs text-surface-400">—</p>
          ) : (
            <ul className="space-y-1">
              {moves[key].map((stock) => (
                <li key={stock.stockSlug}>
                  <a
                    href={stockSignalPath(stock.stockSlug)}
                    className="flex items-start justify-between gap-2 text-xs hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    <span className="font-medium text-surface-900 dark:text-white line-clamp-2">
                      {stock.stockName}
                    </span>
                    <span className="text-surface-500 tabular-nums shrink-0">
                      {formatMoveMetric(stock, metric)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
