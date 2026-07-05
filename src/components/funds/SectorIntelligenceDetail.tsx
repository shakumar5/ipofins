import type { SmartMoneyMonthData } from '../../lib/data/holdings';
import type { SectorIntelligenceData, SectorIntelligenceRow } from '../../lib/sector-intelligence';
import { sectorIntelligencePath } from '../../lib/sector-intelligence-meta';
import { withErrorBoundary } from '../withErrorBoundary';
import SectorStockMovesPanel from './SectorStockMovesPanel';

interface Props {
  row: SectorIntelligenceRow;
  data: Pick<SectorIntelligenceData, 'currentMonth' | 'previousMonth' | 'fundCount' | 'totalEquityAum'>;
  monthMoves?: SmartMoneyMonthData | null;
}

function formatCr(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L Cr`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k Cr`;
  return `₹${value.toFixed(0)} Cr`;
}

function aumChangeColor(pct: number): string {
  if (pct >= 5) return 'text-green-600 dark:text-green-400';
  if (pct > 0) return 'text-green-500';
  if (pct <= -5) return 'text-red-600 dark:text-red-400';
  if (pct < 0) return 'text-orange-500';
  return 'text-surface-500';
}

function trendColor(direction: string): string {
  if (direction === 'up') return 'text-green-600 dark:text-green-400';
  if (direction === 'down') return 'text-red-500 dark:text-red-400';
  return 'text-surface-500';
}

function SectorIntelligenceDetailInner({ row, data, monthMoves = null }: Props) {
  return (
    <div className="space-y-6">
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-xs text-surface-500 uppercase tracking-wide">Sector rank #{row.rank}</p>
            <p className="text-2xl font-bold text-surface-900 dark:text-white mt-1">{row.sector}</p>
            <p className="text-sm font-medium text-surface-700 dark:text-surface-300 mt-2">
              {row.signalEmoji} {row.signal}
            </p>
            <p className="text-sm text-surface-500 mt-1">
              {data.previousMonth} → {data.currentMonth}
            </p>
          </div>
          <div className="rounded-xl bg-surface-50 dark:bg-surface-800/60 p-4 text-center min-w-[120px]">
            <p className="text-xs text-surface-500 mb-1">Conviction</p>
            <p className="text-3xl font-bold text-primary-600 tabular-nums">{row.convictionScore}</p>
            <p className="text-xs text-surface-400">/ 100</p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className="text-xs text-surface-500 mb-1">AUM change</p>
          <p className={`text-2xl font-bold tabular-nums ${aumChangeColor(row.aumChangePct)}`}>
            {row.aumChangePct >= 0 ? '+' : ''}
            {row.aumChangePct}%
          </p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-surface-500 mb-1">Weight Δ</p>
          <p className={`text-2xl font-bold tabular-nums ${aumChangeColor(row.weightChangePpt)}`}>
            {row.weightChangePpt >= 0 ? '+' : ''}
            {row.weightChangePpt} ppt
          </p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-surface-500 mb-1">Trend</p>
          <p className={`text-xl font-bold tabular-nums ${trendColor(row.trendDirection)}`}>{row.trendLabel}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-surface-500 mb-1">Funds</p>
          <p className="text-2xl font-bold tabular-nums text-surface-900 dark:text-white">{row.fundCount}</p>
          <p className="text-xs text-surface-500 mt-1">
            {row.fundsIncreasing}↑ / {row.fundsDecreasing}↓
          </p>
        </div>
      </div>

      <div className="card p-5 space-y-2 text-sm text-surface-600 dark:text-surface-300">
        <p>
          <strong className="text-surface-900 dark:text-white">{row.sector}</strong> represents{' '}
          <strong>{row.currentPct}%</strong> of aggregated mutual fund equity exposure ({formatCr(row.currentValue)} in{' '}
          {data.currentMonth}, vs {formatCr(row.previousValue)} in {data.previousMonth}).
        </p>
        <p className="text-xs text-surface-500">
          Based on {data.fundCount} equity funds · Total equity universe {formatCr(data.totalEquityAum)}
        </p>
      </div>

      {monthMoves ? (
        <section className="card p-5">
          <h2 className="text-sm font-bold text-surface-900 dark:text-white mb-3">
            Top stock moves in {row.sector} ({monthMoves.month})
          </h2>
          <SectorStockMovesPanel sector={row.sector} monthMoves={monthMoves} />
        </section>
      ) : null}

      <p className="text-sm">
        <a href={sectorIntelligencePath()} className="text-primary-600 hover:underline">
          ← All sectors
        </a>
        {' · '}
        <a href="/mutual-funds/smart-money/smart-money-signal" className="text-primary-600 hover:underline">
          Smart Money Signal
        </a>
        {' · '}
        <a href="/mutual-funds/mutual-fund-holdings-changes" className="text-primary-600 hover:underline">
          Holdings Changes
        </a>
      </p>
    </div>
  );
}

export default withErrorBoundary(SectorIntelligenceDetailInner, 'Sector Intelligence');
