import { useState, useMemo, type ChangeEvent } from 'react';

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

function formatCurrency(value: number) {
  const rounded = Math.round(value);
  if (rounded >= 10000000) return `₹${(rounded / 10000000).toFixed(2)} Cr`;
  if (rounded >= 100000) return `₹${(rounded / 100000).toFixed(2)} L`;
  return `₹${rounded.toLocaleString('en-IN')}`;
}

type SliderFieldProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  minLabel: string;
  maxLabel: string;
  onChange: (value: number) => void;
};

function SliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  minLabel,
  maxLabel,
  onChange,
}: SliderFieldProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={id} className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
        </label>
        <span className="text-sm font-bold text-surface-900 dark:text-white">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
      />
      <div className="flex justify-between text-xs text-surface-500 mt-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export default function SWPCalculator() {
  const [initialCorpus, setInitialCorpus] = useState(5000000);
  const [monthlyWithdrawal, setMonthlyWithdrawal] = useState(40000);
  const [expectedReturn, setExpectedReturn] = useState(10);
  const [timePeriod, setTimePeriod] = useState(20);

  const result = useMemo(
    () => computeSWP(initialCorpus, monthlyWithdrawal, expectedReturn, timePeriod),
    [initialCorpus, monthlyWithdrawal, expectedReturn, timePeriod],
  );

  const withdrawnPct =
    result.endValue > 0 ? (result.totalWithdrawn / result.endValue) * 100 : 0;
  const remainingPct =
    result.endValue > 0 ? (result.remainingBalance / result.endValue) * 100 : 0;

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField
          id="swp-corpus"
          label="Initial Corpus"
          value={initialCorpus}
          min={100000}
          max={50000000}
          step={100000}
          display={formatCurrency(initialCorpus)}
          minLabel="₹1 L"
          maxLabel="₹5 Cr"
          onChange={setInitialCorpus}
        />
        <SliderField
          id="swp-withdrawal"
          label="Monthly Withdrawal"
          value={monthlyWithdrawal}
          min={1000}
          max={500000}
          step={1000}
          display={`₹${monthlyWithdrawal.toLocaleString('en-IN')}`}
          minLabel="₹1,000"
          maxLabel="₹5,00,000"
          onChange={setMonthlyWithdrawal}
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
          onChange={setExpectedReturn}
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
          onChange={setTimePeriod}
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
        <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 rounded-lg px-4 py-3">
          Your corpus is projected to last the full <strong>{timePeriod} years</strong> with{' '}
          <strong>{formatCurrency(result.remainingBalance)}</strong> still invested at the end.
        </p>
      )}

      <div
        className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4"
        aria-live="polite"
      >
        <div className="h-4 rounded-full overflow-hidden bg-surface-200 dark:bg-surface-700 flex">
          <div
            className="bg-blue-500 transition-[width] duration-300"
            style={{ width: `${withdrawnPct}%` }}
          />
          <div
            className="bg-green-500 transition-[width] duration-300"
            style={{ width: `${remainingPct}%` }}
          />
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-surface-600 dark:text-surface-400">Withdrawn</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-surface-600 dark:text-surface-400">Remaining</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Total Withdrawn</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">
              {formatCurrency(result.totalWithdrawn)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Remaining Corpus</p>
            <p className="text-lg font-bold text-green-500 mt-1">
              {formatCurrency(result.remainingBalance)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Growth Earned</p>
            <p className="text-lg font-bold text-surface-900 dark:text-white mt-1">
              {formatCurrency(result.growthEarned)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Starting Corpus</p>
            <p className="text-lg font-bold text-surface-900 dark:text-white mt-1">
              {formatCurrency(initialCorpus)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
