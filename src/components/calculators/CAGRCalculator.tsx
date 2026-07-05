import { useState, useMemo, useCallback } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

function CAGRCalculatorInner() {
  const [initialValue, setInitialValue] = useState(100_000);
  const [finalValue, setFinalValue] = useState(250_000);
  const [years, setYears] = useState(5);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const setError = useCallback(
    (field: string) => (msg?: string) => setErrors((e) => ({ ...e, [field]: msg })),
    [],
  );

  const crossFieldError = useMemo(() => {
    if (finalValue <= initialValue) {
      return 'Final value must be greater than initial investment to calculate positive CAGR.';
    }
    return undefined;
  }, [initialValue, finalValue]);

  const result = useMemo(() => {
    if (initialValue <= 0 || finalValue <= 0 || years <= 0 || finalValue <= initialValue) {
      return null;
    }
    const cagr = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
    const absoluteReturn = ((finalValue - initialValue) / initialValue) * 100;
    if (!Number.isFinite(cagr) || !Number.isFinite(absoluteReturn)) return null;
    return { cagr, absoluteReturn };
  }, [initialValue, finalValue, years]);

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField
          id="cagr-initial"
          label="Initial Investment"
          value={initialValue}
          min={10_000}
          max={10_000_000}
          step={10_000}
          display={formatCalculatorCurrency(initialValue)}
          minLabel="₹10K"
          maxLabel="₹1 Cr"
          validation={{ type: 'amount', label: 'Initial investment', min: 10_000, max: 10_000_000 }}
          error={errors.initial}
          onValidChange={setInitialValue}
          onError={setError('initial')}
        />
        <SliderField
          id="cagr-final"
          label="Final Value"
          value={finalValue}
          min={10_000}
          max={50_000_000}
          step={10_000}
          display={formatCalculatorCurrency(finalValue)}
          minLabel="₹10K"
          maxLabel="₹5 Cr"
          validation={{ type: 'amount', label: 'Final value', min: 10_000, max: 50_000_000 }}
          error={errors.final ?? crossFieldError}
          onValidChange={setFinalValue}
          onError={setError('final')}
        />
        <SliderField
          id="cagr-years"
          label="Time Period"
          value={years}
          min={1}
          max={30}
          step={1}
          display={`${years} years`}
          minLabel="1 year"
          maxLabel="30 years"
          validation={{ type: 'years', min: 1, max: 30 }}
          error={errors.years}
          onValidChange={setYears}
          onError={setError('years')}
        />
      </div>

      {result ? (
        <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6" aria-live="polite">
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center p-4 bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
              <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">CAGR</p>
              <p className="text-3xl font-extrabold font-mono text-primary-600 dark:text-primary-400">
                {result.cagr.toFixed(2)}%
              </p>
              <p className="text-xs text-surface-500 mt-1">per annum</p>
            </div>
            <div className="text-center p-4 bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
              <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">Absolute Return</p>
              <p
                className={`text-3xl font-extrabold font-mono ${result.absoluteReturn >= 0 ? 'text-success-500' : 'text-danger-500'}`}
              >
                {result.absoluteReturn.toFixed(1)}%
              </p>
              <p className="text-xs text-surface-500 mt-1">total</p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
            <p className="text-xs text-primary-700 dark:text-primary-300 text-center">
              Your investment grew from {formatCalculatorCurrency(initialValue)} to{' '}
              {formatCalculatorCurrency(finalValue)} at {result.cagr.toFixed(2)}% CAGR over {years} years
            </p>
          </div>
          <CalculatorShareRow
            tool="CAGR Calculator"
            summary={`${formatCalculatorCurrency(initialValue)} → ${formatCalculatorCurrency(finalValue)} in ${years}yr = ${result.cagr.toFixed(2)}% CAGR`}
            shareText={`Investment CAGR: ${result.cagr.toFixed(2)}% over ${years} years (${formatCalculatorCurrency(initialValue)} → ${formatCalculatorCurrency(finalValue)}).`}
          />
        </div>
      ) : (
        <p className="text-sm text-danger-600 dark:text-danger-400 text-center py-4" role="alert">
          {crossFieldError ?? 'Adjust inputs to see CAGR results.'}
        </p>
      )}
    </div>
  );
}

export default withErrorBoundary(CAGRCalculatorInner, 'CAGR Calculator');
