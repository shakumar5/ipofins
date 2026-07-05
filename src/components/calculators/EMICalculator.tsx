import { useState, useMemo, useCallback } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

function EMICalculatorInner() {
  const [principal, setPrincipal] = useState(2_500_000);
  const [rate, setRate] = useState(8.5);
  const [tenure, setTenure] = useState(20);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const setError = useCallback(
    (field: string) => (msg?: string) => setErrors((e) => ({ ...e, [field]: msg })),
    [],
  );

  const result = useMemo(() => {
    const monthlyRate = rate / 12 / 100;
    const months = tenure * 12;
    if (!Number.isFinite(principal) || principal <= 0 || months <= 0) {
      return null;
    }
    const emi =
      monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
          (Math.pow(1 + monthlyRate, months) - 1);
    if (!Number.isFinite(emi)) return null;
    const totalPayment = emi * months;
    const totalInterest = totalPayment - principal;
    return { emi, totalPayment, totalInterest, months };
  }, [principal, rate, tenure]);

  const principalPercentage =
    result && result.totalPayment > 0 ? (principal / result.totalPayment) * 100 : 50;

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField
          id="emi-principal"
          label="Loan Amount"
          value={principal}
          min={100_000}
          max={50_000_000}
          step={100_000}
          display={formatCalculatorCurrency(principal)}
          minLabel="₹1 L"
          maxLabel="₹5 Cr"
          validation={{ type: 'amount', label: 'Loan amount', min: 100_000, max: 50_000_000 }}
          error={errors.principal}
          onValidChange={setPrincipal}
          onError={setError('principal')}
        />
        <SliderField
          id="emi-rate"
          label="Interest Rate"
          value={rate}
          min={4}
          max={20}
          step={0.1}
          display={`${rate}% p.a.`}
          minLabel="4%"
          maxLabel="20%"
          validation={{ type: 'rate', label: 'Interest rate', min: 4, max: 20 }}
          error={errors.rate}
          onValidChange={setRate}
          onError={setError('rate')}
        />
        <SliderField
          id="emi-tenure"
          label="Loan Tenure"
          value={tenure}
          min={1}
          max={30}
          step={1}
          display={`${tenure} years`}
          minLabel="1 year"
          maxLabel="30 years"
          validation={{ type: 'years', min: 1, max: 30 }}
          error={errors.tenure}
          onValidChange={setTenure}
          onError={setError('tenure')}
        />
      </div>

      {result ? (
        <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" aria-live="polite">
          <div className="text-center pb-4 border-b border-surface-200 dark:border-surface-700">
            <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">Monthly EMI</p>
            <p className="text-4xl font-extrabold font-mono text-primary-600 dark:text-primary-400">
              {formatCalculatorCurrency(result.emi)}
            </p>
          </div>

          <div className="h-4 rounded-full overflow-hidden bg-surface-200 dark:bg-surface-700 flex">
            <div className="bg-primary-500 transition-all duration-500" style={{ width: `${principalPercentage}%` }} />
            <div className="bg-orange-500 transition-all duration-500" style={{ width: `${100 - principalPercentage}%` }} />
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-primary-500" aria-hidden="true" />
              <span className="text-surface-600 dark:text-surface-400">Principal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-orange-500" aria-hidden="true" />
              <span className="text-surface-600 dark:text-surface-400">Interest</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="text-center">
              <p className="text-xs text-surface-500 dark:text-surface-400">Principal</p>
              <p className="text-sm font-bold font-mono text-surface-900 dark:text-white mt-1">
                {formatCalculatorCurrency(principal)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-surface-500 dark:text-surface-400">Interest</p>
              <p className="text-sm font-bold font-mono text-orange-500 mt-1">
                {formatCalculatorCurrency(result.totalInterest)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-surface-500 dark:text-surface-400">Total</p>
              <p className="text-sm font-bold font-mono text-surface-900 dark:text-white mt-1">
                {formatCalculatorCurrency(result.totalPayment)}
              </p>
            </div>
          </div>
          <CalculatorShareRow
            tool="EMI Calculator"
            summary={`₹${formatCalculatorCurrency(principal)} loan @ ${rate}% for ${tenure}yr → EMI ${formatCalculatorCurrency(result.emi)}`}
            shareText={`My home loan EMI: ${formatCalculatorCurrency(result.emi)}/month on ₹${formatCalculatorCurrency(principal)} at ${rate}% for ${tenure} years.`}
          />
        </div>
      ) : (
        <p className="text-sm text-surface-500 text-center py-4">Adjust inputs to see EMI breakdown.</p>
      )}
    </div>
  );
}

export default withErrorBoundary(EMICalculatorInner, 'EMI Calculator');
