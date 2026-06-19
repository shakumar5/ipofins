import { useMemo } from 'react';
import type { SectorIntelligenceData } from '../../lib/sector-intelligence';

interface Props {
  data: SectorIntelligenceData;
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

export default function SectorIntelligenceTable({ data }: Props) {
  const rows = data.rows;

  const topAccumulating = useMemo(() => rows.filter((r) => r.convictionScore >= 75).slice(0, 3), [rows]);
  const topDistributing = useMemo(
    () => [...rows].sort((a, b) => a.convictionScore - b.convictionScore).slice(0, 3),
    [rows],
  );

  if (!data.currentMonth || !rows.length) {
    return (
      <p className="text-center py-12 text-surface-500 dark:text-surface-400 text-sm">
        Sector intelligence requires at least two months of holdings data. Run the monthly pipeline after adding new disclosures.
      </p>
    );
  }

  return (
    <div>
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-surface-900 dark:text-white">Comparison period</p>
            <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
              {data.previousMonth} → {data.currentMonth}
            </p>
          </div>
          <div className="text-sm text-surface-500 dark:text-surface-400 space-y-0.5">
            <p><span className="font-medium text-surface-700 dark:text-surface-300">{data.fundCount}</span> equity funds aggregated</p>
            <p>Total equity exposure: <span className="font-medium text-surface-700 dark:text-surface-300">{formatCr(data.totalEquityAum)}</span></p>
            <p className="text-xs">Sectors below {data.minSectorPct}% of total equity are hidden</p>
          </div>
        </div>
      </div>

      {(topAccumulating.length > 0 || topDistributing.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {topAccumulating.length > 0 && (
            <div className="card p-4 border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-2">Top accumulation</p>
              <ul className="space-y-1 text-sm">
                {topAccumulating.map((r) => (
                  <li key={r.sector} className="flex justify-between gap-2">
                    <span className="font-medium text-surface-900 dark:text-white">{r.sector}</span>
                    <span className="text-green-600 tabular-nums">{r.signalEmoji} +{r.aumChangePct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {topDistributing.length > 0 && (
            <div className="card p-4 border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 mb-2">Top distribution</p>
              <ul className="space-y-1 text-sm">
                {topDistributing.map((r) => (
                  <li key={r.sector} className="flex justify-between gap-2">
                    <span className="font-medium text-surface-900 dark:text-white">{r.sector}</span>
                    <span className="text-red-500 tabular-nums">{r.signalEmoji} {r.aumChangePct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto card p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-800/50 text-left text-xs text-surface-500 uppercase">
            <tr>
              <th className="px-4 py-3 w-12">Rank</th>
              <th className="px-4 py-3">Sector</th>
              <th className="px-4 py-3 text-right">Conviction</th>
              <th className="px-4 py-3">Signal</th>
              <th className="px-4 py-3 text-right">AUM Change</th>
              <th className="px-4 py-3 text-right">Weight Δ</th>
              <th className="px-4 py-3 text-center">Trend</th>
              <th className="px-4 py-3 text-right hidden lg:table-cell">Funds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {rows.map((row) => (
              <tr key={row.sector} className="hover:bg-surface-50 dark:hover:bg-surface-800/40">
                <td className="px-4 py-3 text-surface-400 tabular-nums">{row.rank}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-surface-900 dark:text-white">{row.sector}</p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    {row.currentPct}% of equity · {row.fundsIncreasing}↑ / {row.fundsDecreasing}↓ funds
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-bold tabular-nums text-surface-900 dark:text-white">{row.convictionScore}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-xs font-medium">
                    <span>{row.signalEmoji}</span>
                    <span className="text-surface-700 dark:text-surface-300">{row.signal}</span>
                  </span>
                </td>
                <td className={`px-4 py-3 text-right font-bold tabular-nums ${aumChangeColor(row.aumChangePct)}`}>
                  {row.aumChangePct >= 0 ? '+' : ''}{row.aumChangePct}%
                </td>
                <td className={`px-4 py-3 text-right tabular-nums text-xs ${aumChangeColor(row.weightChangePpt)}`}>
                  {row.weightChangePpt >= 0 ? '+' : ''}{row.weightChangePpt} ppt
                </td>
                <td className={`px-4 py-3 text-center font-semibold tabular-nums ${trendColor(row.trendDirection)}`}>
                  {row.trendLabel}
                </td>
                <td className="px-4 py-3 text-right text-xs text-surface-500 hidden lg:table-cell tabular-nums">
                  {row.fundCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700 text-xs text-surface-500 dark:text-surface-400 space-y-2">
        <p>
          <strong className="text-surface-700 dark:text-surface-300">AUM Change</strong> is the month-on-month % change in total ₹ exposure to that sector across all funds with holdings.
          <strong className="text-surface-700 dark:text-surface-300"> Weight Δ</strong> is the change in the sector&apos;s share of total equity (percentage points).
        </p>
        <p>
          <strong className="text-surface-700 dark:text-surface-300">Conviction Score</strong> blends sector AUM momentum (75%) with fund-breadth — how many funds increased exposure (25%).
          Same signal bands as <a href="/mutual-funds/smart-money" className="text-primary-600 hover:underline">Smart Money Signal</a>.
        </p>
        <p>
          <strong className="text-surface-700 dark:text-surface-300">Trend</strong> counts consecutive months of rising sector weight (↑ 3M = three straight months of allocation increase).
          See individual stock moves in <a href="/mutual-funds/mutual-fund-holdings-changes" className="text-primary-600 hover:underline">Holdings Changes</a>.
        </p>
      </div>
    </div>
  );
}
