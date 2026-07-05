import { useState, useMemo, useCallback } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

function StepUpSIPCalculatorInner() {
  const [monthlyInvestment, setMonthlyInvestment] = useState(5000);
  const [annualStepUp, setAnnualStepUp] = useState(10);
  const [expectedReturn, setExpectedReturn] = useState(12);
  const [timePeriod, setTimePeriod] = useState(20);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const setError = useCallback(
    (field: string) => (msg?: string) => setErrors((e) => ({ ...e, [field]: msg })),
    [],
  );

  const result = useMemo(() => {
    if (timePeriod <= 0 || monthlyInvestment <= 0) return null;
    const monthlyRate = expectedReturn / 12 / 100;
    let totalInvested = 0;
    let totalValue = 0;
    let currentSIP = monthlyInvestment;

    for (let year = 1; year <= timePeriod; year++) {
      for (let month = 1; month <= 12; month++) {
        totalInvested += currentSIP;
        totalValue = (totalValue + currentSIP) * (1 + monthlyRate);
      }
      currentSIP = currentSIP * (1 + annualStepUp / 100);
    }

    let normalValue = 0;
    for (let month = 1; month <= timePeriod * 12; month++) {
      normalValue = (normalValue + monthlyInvestment) * (1 + monthlyRate);
    }

    if (!Number.isFinite(totalValue)) return null;

    return {
      invested: Math.round(totalInvested),
      futureValue: Math.round(totalValue),
      returns: Math.round(totalValue - totalInvested),
      normalValue: Math.round(normalValue),
      extraWealth: Math.round(totalValue - normalValue),
    };
  }, [monthlyInvestment, annualStepUp, expectedReturn, timePeriod]);

  const investedPercentage =
    result && result.futureValue > 0 ? (result.invested / result.futureValue) * 100 : 50;

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField
          id="stepup-sip"
          label="Monthly Investment"
          value={monthlyInvestment}
          min={500}
          max={100_000}
          step={500}
          display={`₹${monthlyInvestment.toLocaleString('en-IN')}`}
          minLabel="₹500"
          maxLabel="₹1,00,000"
          validation={{ type: 'amount', label: 'Monthly investment', min: 500, max: 100_000 }}
          error={errors.sip}
          onValidChange={setMonthlyInvestment}
          onError={setError('sip')}
        />
        <SliderField
          id="stepup-rate"
          label="Annual Step-Up"
          value={annualStepUp}
          min={0}
          max={30}
          step={1}
          display={`${annualStepUp}%`}
          minLabel="0%"
          maxLabel="30%"
          validation={{ type: 'rate', label: 'Annual step-up', min: 0, max: 30 }}
          error={errors.stepUp}
          onValidChange={setAnnualStepUp}
          onError={setError('stepUp')}
        />
        <SliderField
          id="stepup-return"
          label="Expected Annual Return"
          value={expectedReturn}
          min={1}
          max={30}
          step={0.5}
          display={`${expectedReturn}%`}
          minLabel="1%"
          maxLabel="30%"
          validation={{ type: 'rate', label: 'Expected return', min: 1, max: 30 }}
          error={errors.rate}
          onValidChange={setExpectedReturn}
          onError={setError('rate')}
        />
        <SliderField
          id="stepup-years"
          label="Time Period"
          value={timePeriod}
          min={1}
          max={40}
          step={1}
          display={`${timePeriod} years`}
          minLabel="1 year"
          maxLabel="40 years"
          validation={{ type: 'years', min: 1, max: 40 }}
          error={errors.years}
          onValidChange={setTimePeriod}
          onError={setError('years')}
        />
      </div>

      {result && (
        <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" aria-live="polite">
          <div className="h-4 rounded-full overflow-hidden bg-surface-200 dark:bg-surface-700 flex">
            <div className="bg-primary-500 transition-all duration-500" style={{ width: `${investedPercentage}%` }} />
            <div className="bg-success-500 transition-all duration-500" style={{ width: `${100 - investedPercentage}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
            <div className="text-center">
              <p className="text-xs text-surface-500">Invested</p>
              <p className="text-lg font-bold font-mono mt-1">{formatCalculatorCurrency(result.invested)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-surface-500">Returns</p>
              <p className="text-lg font-bold font-mono text-success-500 mt-1">{formatCalculatorCurrency(result.returns)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-surface-500">Total Value</p>
              <p className="text-xl font-extrabold font-mono text-primary-600 mt-1">{formatCalculatorCurrency(result.futureValue)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="text-center bg-white dark:bg-surface-900 rounded-lg p-3">
              <p className="text-xs text-surface-500">Regular SIP Value</p>
              <p className="text-sm font-bold font-mono mt-1">{formatCalculatorCurrency(result.normalValue)}</p>
            </div>
            <div className="text-center bg-success-50 dark:bg-success-900/20 rounded-lg p-3">
              <p className="text-xs text-success-600">Extra Wealth from Step-Up</p>
              <p className="text-sm font-bold font-mono text-success-600 mt-1">+{formatCalculatorCurrency(result.extraWealth)}</p>
            </div>
          </div>
          <CalculatorShareRow
            tool="Step-Up SIP Calculator"
            summary={`₹${monthlyInvestment.toLocaleString('en-IN')}/mo + ${annualStepUp}% step-up → ${formatCalculatorCurrency(result.futureValue)}`}
            shareText={`Step-up SIP: start ₹${monthlyInvestment.toLocaleString('en-IN')}/month, increase ${annualStepUp}% yearly, ${expectedReturn}% return for ${timePeriod} years.`}
          />
        </div>
      )}
    </div>
  );
}

export default withErrorBoundary(StepUpSIPCalculatorInner, 'Step-Up SIP Calculator');
