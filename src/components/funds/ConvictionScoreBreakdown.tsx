import type { SmartMoneySignalRow } from '../../lib/smart-money-signals';
import { stockCapDisplayLabel } from '../../lib/smart-money-signals';

interface Props {
  row: SmartMoneySignalRow;
}

function FactorRow({
  label,
  factor,
}: {
  label: string;
  factor: { raw: number; categoryMax: number; points: number; maxPoints: number };
}) {
  return (
    <div className="bg-surface-50 dark:bg-surface-800/50 rounded px-3 py-2">
      <div className="flex justify-between font-medium text-surface-700 dark:text-surface-300 text-sm">
        <span>{label}</span>
        <span className="tabular-nums">
          {factor.points} / {factor.maxPoints}
        </span>
      </div>
      <p className="text-[11px] mt-0.5 text-surface-500 dark:text-surface-400">
        Raw {factor.raw} · category leader {factor.categoryMax}
      </p>
    </div>
  );
}

function FundList({ title, funds, tone }: { title: string; funds: string[]; tone: 'green' | 'red' | 'blue' | 'orange' }) {
  if (!funds.length) return null;
  const toneClass =
    tone === 'green'
      ? 'text-green-700 dark:text-green-400'
      : tone === 'red'
        ? 'text-red-600 dark:text-red-400'
        : tone === 'blue'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-orange-600 dark:text-orange-400';

  return (
    <div>
      <p className={`text-xs font-semibold mb-1.5 ${toneClass}`}>
        {title} ({funds.length})
      </p>
      <ul className="text-xs text-surface-600 dark:text-surface-300 space-y-1 max-h-40 overflow-y-auto">
        {funds.map((fund) => (
          <li key={fund} className="truncate">
            {fund}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ConvictionScoreBreakdown({ row }: Props) {
  const b = row.factorBreakdown;
  const cap = stockCapDisplayLabel(row.category);

  if (!b) return null;

  return (
    <details className="group mt-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/30">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center justify-between gap-2">
        <span>View full score breakdown &amp; fund activity</span>
        <span className="text-surface-400 group-open:rotate-180 transition-transform" aria-hidden>
          ▾
        </span>
      </summary>

      <div className="px-4 pb-4 pt-1 space-y-4 border-t border-surface-200 dark:border-surface-700">
        <p className="text-xs text-surface-500">
          Scored vs peers in {cap || row.category} · Final {row.convictionScore}/100
        </p>

        <div className="space-y-2">
          <FactorRow label="Net Weight Change" factor={b.netWeightChange} />
          <FactorRow label="Net Buying Funds" factor={b.netBuying} />
          <FactorRow label="Fresh Entries" factor={b.freshEntries} />
          <FactorRow label="Complete Exits" factor={b.completeExits} />
          <FactorRow label="AMC Breadth" factor={b.amcBreadth} />
          <FactorRow label="Trend Consistency" factor={b.trend} />
        </div>

        {row.fundActivity && (
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <FundList title="Funds increased" funds={row.fundActivity.increased} tone="green" />
            <FundList title="Funds reduced" funds={row.fundActivity.decreased} tone="red" />
            <FundList title="Fresh entries" funds={row.fundActivity.freshEntry} tone="blue" />
            <FundList title="Complete exits" funds={row.fundActivity.completeExit} tone="orange" />
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-surface-600 dark:text-surface-300">
          <div>
            <dt className="text-surface-400">Funds holding</dt>
            <dd className="font-semibold text-surface-800 dark:text-surface-100">{row.fundsHolding}</dd>
          </div>
          <div>
            <dt className="text-surface-400">Net weight MoM</dt>
            <dd className="font-semibold text-surface-800 dark:text-surface-100">
              {row.netWeightChangePct >= 0 ? '+' : ''}
              {row.netWeightChangePct.toFixed(2)}%
            </dd>
          </div>
          <div>
            <dt className="text-surface-400">AMCs buying</dt>
            <dd className="font-semibold text-surface-800 dark:text-surface-100">{row.amcsBuying}</dd>
          </div>
          <div>
            <dt className="text-surface-400">Trend streak</dt>
            <dd className="font-semibold text-surface-800 dark:text-surface-100">
              {row.consecutivePositiveMonths} month{row.consecutivePositiveMonths !== 1 ? 's' : ''}
            </dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
