import type { SmartMoneySignalRow, FactorBreakdown } from '../../lib/smart-money-signals';
import { buildInterpretation, stockCapDisplayLabel, stockSignalMetaLine } from '../../lib/smart-money-signals';



import { stockSignalPath } from '../../lib/stock-signal-meta';

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

  const b = row.factorBreakdown;



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

        <p className="text-sm font-semibold text-surface-900 dark:text-white mb-3">Why?</p>

        <ul className="space-y-2 text-sm text-surface-700 dark:text-surface-300">

          <li>✔ {row.increasedCount} Funds Increased Holdings</li>

          <li>✔ {row.decreasedCount} Funds Reduced Holdings</li>

          <li>✔ {row.freshEntries} Fresh Entries</li>

          <li>✔ {row.completeExits} Complete Exits</li>

          <li>

            ✔ Net Buying: {row.netBuying >= 0 ? '+' : ''}{row.netBuying} (increased − decreased)

          </li>

          <li>

            ✔ Net Weight {row.netWeightChangePct >= 0 ? 'Increased' : 'Decreased'} by{' '}

            {Math.abs(row.netWeightChangePct).toFixed(2)}%

          </li>

          <li>✔ {row.amcsBuying} AMCs Buying ({row.buyingFunds} buying funds)</li>

          {row.consecutivePositiveMonths > 0 && (

            <li>

              ✔ Continuous Accumulation: {row.consecutivePositiveMonths} consecutive month

              {row.consecutivePositiveMonths > 1 ? 's' : ''} (all funds positive weight change)

            </li>

          )}

        </ul>

      </section>



      <Divider />



      <section className="text-center">

        <p className="text-xs uppercase tracking-wide text-surface-500 mb-2">Institutional Confidence</p>

        <Stars count={row.confidenceStars} />

        <p className="mt-2 font-medium text-surface-900 dark:text-white">{row.institutionalConfidence}</p>

        <p className="mt-1 text-xs text-surface-500">

          Based on {row.amcCount} AMC{row.amcCount !== 1 ? 's' : ''} with any activity (display only)

        </p>

      </section>



      <Divider />



      <section>

        <p className="text-xs uppercase tracking-wide text-surface-500 mb-2 text-center">Interpretation</p>

        <p className="text-sm text-surface-700 dark:text-surface-300 text-center leading-relaxed">

          {row.interpretation || buildInterpretation(row.stockName, row.signal)}

        </p>

      </section>



      {b && (
        <>
      <Divider />



      <section className="text-xs text-surface-500 dark:text-surface-400">

        <p className="font-semibold text-surface-700 dark:text-surface-300 mb-2">

          Score Breakdown
          {stockCapDisplayLabel(row.category)
            ? ` (${row.category} peers — percentile vs cap-bucket leader)`
            : ' (percentile vs peer stocks)'}

        </p>

        <div className="space-y-2">

          <FactorRow label="Net Weight Change" factor={b.netWeightChange} suffix="%" />

          <FactorRow label="Net Buying" factor={b.netBuying} />

          <FactorRow label="Fresh Entries" factor={b.freshEntries} />

          <FactorRow label="Exits (inverted)" factor={b.completeExits} invert />

          <FactorRow label="AMC Breadth" factor={b.amcBreadth} />

          <FactorRow label="Continuous Accumulation" factor={b.trend} suffix=" mo" />

        </div>

      </section>
        </>
      )}



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



function FactorRow({

  label,

  factor,

  suffix = '',

  invert = false,

}: {

  label: string;

  factor: FactorBreakdown;

  suffix?: string;

  invert?: boolean;

}) {

  const rawLabel = invert

    ? `${factor.raw}${suffix} (max ${factor.categoryMax}${suffix})`

    : `${factor.raw}${suffix} of ${factor.categoryMax}${suffix} max`;



  return (

    <div className="bg-surface-50 dark:bg-surface-800/50 rounded px-3 py-2">

      <div className="flex justify-between font-medium text-surface-700 dark:text-surface-300">

        <span>{label}</span>

        <span>{factor.points} / {factor.maxPoints}</span>

      </div>

      <p className="text-[11px] mt-0.5 opacity-80">{rawLabel}</p>

    </div>

  );

}

