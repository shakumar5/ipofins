import { useState, useMemo, useCallback } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

function computeSWP(
  initialCorpus: number,
  monthlyWithdrawal: number,
  expectedReturn: number,
  timePeriod: number,
) {
  const months = timePeriod * 12;
  const monthlyRate = expectedReturn / 12 / 100;
  let balance = initialCorpus;
  let totalWithdrawn = 0;
  let monthsLasted = months;
  let depleted = false;

  for (let m = 0; m < months; m++) {
    balance *= 1 + monthlyRate;
    if (balance <= monthlyWithdrawal) {
      totalWithdrawn += balance;
      balance = 0;
      monthsLasted = m + 1;
      depleted = true;
      break;
    }
    balance -= monthlyWithdrawal;
    totalWithdrawn += monthlyWithdrawal;
  }

  const endValue = totalWithdrawn + balance;
  const growthEarned = endValue - initialCorpus;

  return {
    totalWithdrawn,
    remainingBalance: balance,
    endValue,
    growthEarned,
    monthsLasted,
    depleted,
    yearsLasted: Math.floor(monthsLasted / 12),
    monthsRemainder: monthsLasted % 12,
  };
}

function SWPCalculatorInner() {
  const [initialCorpus, setInitialCorpus] = useState(5_000_000);
  const [monthlyWithdrawal, setMonthlyWithdrawal] = useState(40_000);
  const [expectedReturn, setExpectedReturn] = useState(10);
  const [timePeriod, setTimePeriod] = useState(20);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const setError = useCallback(
    (field: string) => (msg?: string) => setErrors((e) => ({ ...e, [field]: msg })),
    [],
  );

  const withdrawalWarning = useMemo(() => {
    if (monthlyWithdrawal > initialCorpus / 12) {
      return 'Monthly withdrawal exceeds 1/12 of corpus — corpus may deplete quickly.';
    }
    return undefined;
  }, [initialCorpus, monthlyWithdrawal]);

  const result = useMemo(
    () => computeSWP(initialCorpus, monthlyWithdrawal, expectedReturn, timePeriod),
    [initialCorpus, monthlyWithdrawal, expectedReturn, timePeriod],
  );

  const withdrawnPct = result.endValue > 0 ? (result.totalWithdrawn / result.endValue) * 100 : 0;
  const remainingPct = result.endValue > 0 ? (result.remainingBalance / result.endValue) * 100 : 0;

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField
          id="swp-corpus"
          label="Initial Corpus"
          value={initialCorpus}
          min={100_000}
          max={50_000_000}
          step={100_000}
          display={formatCalculatorCurrency(initialCorpus)}
          minLabel="₹1 L"
          maxLabel="₹5 Cr"
          validation={{ type: 'amount', label: 'Initial corpus', min: 100_000, max: 50_000_000 }}
          error={errors.corpus}
          onValidChange={setInitialCorpus}
          onError={setError('corpus')}
        />
        <SliderField
          id="swp-withdrawal"
          label="Monthly Withdrawal"
          value={monthlyWithdrawal}
          min={1000}
          max={500_000}
          step={1000}
          display={`₹${monthlyWithdrawal.toLocaleString('en-IN')}`}
          minLabel="₹1,000"
          maxLabel="₹5,00,000"
          validation={{ type: 'amount', label: 'Monthly withdrawal', min: 1000, max: 500_000 }}
          error={errors.withdrawal ?? withdrawalWarning}
          onValidChange={setMonthlyWithdrawal}
          onError={setError('withdrawal')}
        />
        <SliderField
          id="swp-return"
          label="Expected Annual Return"
          value={expectedReturn}
          min={1}
          max={20}
          step={0.5}
          display={`${expectedReturn}%`}
          minLabel="1%"
          maxLabel="20%"
          validation={{ type: 'rate', label: 'Expected return', min: 1, max: 20 }}
          error={errors.rate}
          onValidChange={setExpectedReturn}
          onError={setError('rate')}
        />
        <SliderField
          id="swp-period"
          label="Withdrawal Period"
          value={timePeriod}
          min={1}
          max={40}
          step={1}
          display={`${timePeriod} years`}
          minLabel="1 year"
          maxLabel="40 years"
          validation={{ type: 'years', min: 1, max: 40 }}
          error={errors.period}
          onValidChange={setTimePeriod}
          onError={setError('period')}
        />
      </div>

      {result.depleted ? (
        <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-4 py-3">
          At this withdrawal rate, your corpus may run out in{' '}
          <strong>
            {result.yearsLasted > 0 ? `${result.yearsLasted} yr ` : ''}
            {result.monthsRemainder > 0 ? `${result.monthsRemainder} mo` : ''}
          </strong>
          . Lower the monthly withdrawal or assume a higher return to extend duration.
        </p>
      ) : (
        <p className="text-sm text-success-700 dark:text-success-400 bg-success-50 dark:bg-success-950/40 rounded-lg px-4 py-3">
          Your corpus is projected to last the full <strong>{timePeriod} years</strong> with{' '}
          <strong>{formatCalculatorCurrency(result.remainingBalance)}</strong> still invested at the end.
        </p>
      )}

      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" aria-live="polite">
        <div className="h-4 rounded-full overflow-hidden bg-surface-200 dark:bg-surface-700 flex">
          <div className="bg-primary-500 transition-[width] duration-300" style={{ width: `${withdrawnPct}%` }} />
          <div className="bg-success-500 transition-[width] duration-300" style={{ width: `${remainingPct}%` }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="text-center">
            <p className="text-xs text-surface-500">Total Withdrawn</p>
            <p className="text-lg font-bold font-mono text-primary-600 mt-1">{formatCalculatorCurrency(result.totalWithdrawn)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500">Remaining Corpus</p>
            <p className="text-lg font-bold font-mono text-success-500 mt-1">{formatCalculatorCurrency(result.remainingBalance)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500">Growth Earned</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCalculatorCurrency(result.growthEarned)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500">Starting Corpus</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCalculatorCurrency(initialCorpus)}</p>
          </div>
        </div>
      </div>

      <CalculatorShareRow
        tool="SWP Calculator"
        summary={`${formatCalculatorCurrency(initialCorpus)} corpus, ${formatCalculatorCurrency(monthlyWithdrawal)}/mo SWP @ ${expectedReturn}% → ${formatCalculatorCurrency(result.remainingBalance)} left`}
        shareText={`SWP plan: ${formatCalculatorCurrency(monthlyWithdrawal)}/month from ${formatCalculatorCurrency(initialCorpus)} corpus at ${expectedReturn}% for ${timePeriod} years.`}
      />
    </div>
  );
}

export default withErrorBoundary(SWPCalculatorInner, 'SWP Calculator');
