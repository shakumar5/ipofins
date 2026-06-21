import type { SmartMoneySignalRow } from '../../lib/smart-money-signals';
import { buildInterpretation, stockSignalMetaLine } from '../../lib/smart-money-signals';
import { stockSignalPath } from '../../lib/stock-signal-meta';
import ConvictionScoreBreakdown from './ConvictionScoreBreakdown';

interface Props {
  row: SmartMoneySignalRow;
  backHref?: string;
  backLabel?: string;
}

function Stars({ count }: { count: number }) {
  return (
    <span className="text-amber-500 text-lg tracking-wider" aria-label={`${count} out of 5 stars`}>
      {'★'.repeat(count)}{'☆'.repeat(5 - count)}
    </span>
  );
}

function Divider() {
  return <hr className="border-surface-200 dark:border-surface-700 my-6" />;
}

export default function SmartMoneySignalDetail({ row, backHref, backLabel }: Props) {
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-white text-center">{row.stockName}</h1>
      <p className="text-center text-sm text-surface-500 mt-1">{stockSignalMetaLine(row)}</p>

      <Divider />

      <section className="text-center">
        <p className="text-xs uppercase tracking-wide text-surface-500 mb-2">Smart Money Signal</p>
        <p className="text-xl font-semibold text-surface-900 dark:text-white">
          {row.signalEmoji} {row.signal}
        </p>
      </section>

      <Divider />

      <section className="text-center">
        <p className="text-xs uppercase tracking-wide text-surface-500 mb-2">Conviction Score</p>
        <p className="text-4xl font-bold text-primary-600">
          {row.convictionScore}{' '}
          <span className="text-lg font-normal text-surface-400">/ 100</span>
        </p>
      </section>

      <Divider />

      <section>
        <p className="text-sm font-semibold text-surface-900 dark:text-white mb-3">Summary</p>
        <ul className="space-y-2 text-sm text-surface-700 dark:text-surface-300">
          <li>✔ {row.fundsHolding} funds holding · {row.increasedCount} increased · {row.decreasedCount} reduced</li>
          <li>✔ {row.freshEntries} fresh entries · {row.completeExits} complete exits</li>
          <li>
            ✔ Net weight {row.netWeightChangePct >= 0 ? 'up' : 'down'}{' '}
            {Math.abs(row.netWeightChangePct).toFixed(2)}% (aggregate MoM)
          </li>
          <li>
            ✔ {row.amcsBuying} AMCs buying
          </li>
          {row.consecutivePositiveMonths > 0 && (
            <li>
              ✔ Trend: {row.consecutivePositiveMonths} consecutive month
              {row.consecutivePositiveMonths > 1 ? 's' : ''} — all holders increased weight
            </li>
          )}
        </ul>
      </section>

      <ConvictionScoreBreakdown row={row} />

      <Divider />

      <section className="text-center">
        <p className="text-xs uppercase tracking-wide text-surface-500 mb-2">Confidence</p>
        <Stars count={row.confidenceStars} />
        <p className="mt-2 font-medium text-surface-900 dark:text-white">{row.institutionalConfidence}</p>
        <p className="mt-1 text-xs text-surface-500">Derived from conviction score</p>
      </section>

      <Divider />

      <section>
        <p className="text-xs uppercase tracking-wide text-surface-500 mb-2 text-center">Interpretation</p>
        <p className="text-sm text-surface-700 dark:text-surface-300 text-center leading-relaxed">
          {row.interpretation || buildInterpretation(row.stockName, row.signal)}
        </p>
      </section>

      <p className="mt-8 text-center text-xs text-surface-400">
        {stockSignalMetaLine(row)} · Source: AMC monthly portfolio disclosures · Not investment advice.
      </p>

      <p className="mt-4 text-center">
        <a
          href={backHref || stockSignalPath(row.stockSlug)}
          className="text-sm font-medium text-primary-600 hover:underline"
        >
          {backLabel || '← Back to Stock Signal'}
        </a>
      </p>
    </div>
  );
}
