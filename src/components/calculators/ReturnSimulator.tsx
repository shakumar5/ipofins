import { useState, useMemo, useCallback } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

function ReturnSimulatorInner() {
  const [investment, setInvestment] = useState(500_000);
  const [years, setYears] = useState(10);
  const [scenarioType, setScenarioType] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const setError = useCallback(
    (field: string) => (msg?: string) => setErrors((e) => ({ ...e, [field]: msg })),
    [],
  );

  const scenarios = {
    conservative: { returnRate: 8, label: 'Conservative', description: 'FD / Debt Funds (~8%)' },
    moderate: { returnRate: 12, label: 'Moderate', description: 'Balanced / Large Cap (~12%)' },
    aggressive: { returnRate: 18, label: 'Aggressive', description: 'Small / Mid Cap (~18%)' },
  };

  const results = useMemo(() => {
    if (investment <= 0 || years <= 0) return [];
    return Object.entries(scenarios).map(([key, scenario]) => {
      const futureValue = investment * Math.pow(1 + scenario.returnRate / 100, years);
      const profit = futureValue - investment;
      if (!Number.isFinite(futureValue)) return { key, ...scenario, futureValue: 0, profit: 0 };
      return { key, ...scenario, futureValue, profit };
    });
  }, [investment, years]);

  const selected = results.find((r) => r.key === scenarioType) ?? results[1];

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField
          id="return-investment"
          label="Lump Sum Investment"
          value={investment}
          min={50_000}
          max={10_000_000}
          step={50_000}
          display={formatCalculatorCurrency(investment)}
          validation={{ type: 'amount', label: 'Investment amount', min: 50_000, max: 10_000_000 }}
          error={errors.investment}
          onValidChange={setInvestment}
          onError={setError('investment')}
        />
        <SliderField
          id="return-years"
          label="Investment Horizon"
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

        <div>
          <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-2">Risk Appetite</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(scenarios).map(([key, scenario]) => (
              <button
                key={key}
                type="button"
                onClick={() => setScenarioType(key as typeof scenarioType)}
                className={`p-3 rounded-lg border text-center transition-all ${
                  scenarioType === key
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-surface-200 dark:border-surface-700 hover:border-surface-300'
                }`}
              >
                <p className="text-xs font-semibold text-surface-900 dark:text-white">{scenario.label}</p>
                <p className="text-[10px] text-surface-500 mt-0.5">{scenario.returnRate}% p.a.</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" aria-live="polite">
          <div className="text-center pb-4 border-b border-surface-200 dark:border-surface-700">
            <p className="text-xs text-surface-500 mb-1">
              {selected.label} Scenario ({selected.description})
            </p>
            <p className="text-3xl font-extrabold font-mono text-primary-600 dark:text-primary-400">
              {formatCalculatorCurrency(selected.futureValue)}
            </p>
            <p className="text-sm text-success-500 font-semibold mt-1">
              +{formatCalculatorCurrency(selected.profit)} profit
            </p>
          </div>
          <div className="space-y-3">
            {results.map((r) => (
              <div
                key={r.key}
                className={`flex items-center justify-between p-3 rounded-lg ${r.key === scenarioType ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-200 dark:ring-primary-800' : ''}`}
              >
                <div>
                  <p className="text-sm font-medium text-surface-900 dark:text-white">{r.label}</p>
                  <p className="text-xs text-surface-500">{r.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono">{formatCalculatorCurrency(r.futureValue)}</p>
                  <p className="text-xs text-success-500">
                    +{investment > 0 ? (((r.futureValue - investment) / investment) * 100).toFixed(0) : '0'}%
                  </p>
                </div>
              </div>
            ))}
          </div>
          <CalculatorShareRow
            tool="Return Simulator"
            summary={`${formatCalculatorCurrency(investment)} @ ${selected.label} → ${formatCalculatorCurrency(selected.futureValue)}`}
            shareText={`Return simulation: ${formatCalculatorCurrency(investment)} invested at ${selected.label} scenario.`}
          />
        </div>
      )}
    </div>
  );
}

export default withErrorBoundary(ReturnSimulatorInner, 'Return Simulator');
