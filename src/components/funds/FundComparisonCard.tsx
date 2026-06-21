import { memo } from 'react';
import type { FundComparison } from '../../lib/holdings-compare-diff';

function fmtPct(value: number): string {
  return Number(value.toFixed(2)).toString();
}

interface Props {
  fund: FundComparison;
}

function FundComparisonCard({ fund }: Props) {
  return (
    <div className="border border-surface-200 dark:border-surface-600 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-600">
        <h3 className="font-semibold text-surface-900 dark:text-white text-sm">{fund.fundName}</h3>
        <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
          {fund.additions.length} additions • {fund.removals.length} removals • {fund.increased.length} increased • {fund.decreased.length} decreased
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-200 dark:divide-surface-600">
        <div className="p-4 md:border-b md:border-surface-200 dark:md:border-surface-600">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">New Additions</span>
          </div>
          {fund.additions.length === 0 ? (
            <p className="text-xs text-surface-400 italic">No new stocks added</p>
          ) : (
            <div className="space-y-2">
              {fund.additions.map((h) => (
                <div key={`add-${h.name}`} className="flex justify-between gap-2 text-xs py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                  <span className="font-medium text-surface-900 dark:text-white">{h.name}</span>
                  <span className="text-green-600 font-semibold shrink-0">+{fmtPct(h.pct)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 md:border-b md:border-surface-200 dark:md:border-surface-600">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">Removed</span>
          </div>
          {fund.removals.length === 0 ? (
            <p className="text-xs text-surface-400 italic">No stocks removed</p>
          ) : (
            <div className="space-y-2">
              {fund.removals.map((h) => (
                <div key={`rem-${h.name}`} className="flex justify-between gap-2 text-xs py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                  <span className="font-medium text-surface-900 dark:text-white">{h.name}</span>
                  <span className="text-red-500 font-semibold shrink-0">{fmtPct(h.pct)}% → 0%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-blue-500 rounded-full" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase">Increased</span>
          </div>
          {fund.increased.length === 0 ? (
            <p className="text-xs text-surface-400 italic">No weight increases</p>
          ) : (
            <div className="space-y-2">
              {fund.increased.map((h) => (
                <div key={`inc-${h.name}`} className="flex justify-between gap-2 text-xs py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                  <span className="font-medium text-surface-900 dark:text-white">{h.name}</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold shrink-0">
                    {fmtPct(h.oldPct)}% → {fmtPct(h.newPct)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-amber-500 rounded-full" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase">Decreased</span>
          </div>
          {fund.decreased.length === 0 ? (
            <p className="text-xs text-surface-400 italic">No weight decreases</p>
          ) : (
            <div className="space-y-2">
              {fund.decreased.map((h) => (
                <div key={`dec-${h.name}`} className="flex justify-between gap-2 text-xs py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                  <span className="font-medium text-surface-900 dark:text-white">{h.name}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold shrink-0">
                    {fmtPct(h.oldPct)}% → {fmtPct(h.newPct)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(FundComparisonCard);
