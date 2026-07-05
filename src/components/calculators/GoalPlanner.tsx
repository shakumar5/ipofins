import { useState, useMemo } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';
import { useFieldErrors } from './useFieldErrors';

function GoalPlannerInner() {
  const [goalAmount, setGoalAmount] = useState(5_000_000);
  const [timeHorizon, setTimeHorizon] = useState(12);
  const [inflation, setInflation] = useState(6);
  const [expectedReturn, setExpectedReturn] = useState(12);
  const [existingSavings, setExistingSavings] = useState(0);
  const { errors, setError } = useFieldErrors();

  const result = useMemo(() => {
    if (goalAmount <= 0 || timeHorizon <= 0) return null;

    const inflationAdjustedGoal = goalAmount * Math.pow(1 + inflation / 100, timeHorizon);
    const existingGrowth = existingSavings * Math.pow(1 + expectedReturn / 100, timeHorizon);
    const remainingGoal = Math.max(0, inflationAdjustedGoal - existingGrowth);

    const monthlyRate = expectedReturn / 12 / 100;
    const totalMonths = timeHorizon * 12;
    let monthlySIP = 0;
    if (monthlyRate === 0) {
      monthlySIP = totalMonths > 0 ? remainingGoal / totalMonths : 0;
    } else {
      const factor =
        ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate);
      monthlySIP = factor > 0 ? remainingGoal / factor : 0;
    }

    const lumpsumNeeded =
      expectedReturn > 0
        ? remainingGoal / Math.pow(1 + expectedReturn / 100, timeHorizon)
        : remainingGoal;

    if (!Number.isFinite(monthlySIP)) return null;

    let recommendation = '';
    if (timeHorizon >= 10) recommendation = 'Flexi Cap, Mid Cap, or Small Cap Funds (aggressive growth)';
    else if (timeHorizon >= 5) recommendation = 'Large & Mid Cap or Flexi Cap Funds (balanced growth)';
    else if (timeHorizon >= 3) recommendation = 'Large Cap Funds or Balanced Advantage Funds (moderate risk)';
    else recommendation = 'Short Duration Debt Funds or Liquid Funds (capital safety)';

    return {
      inflationAdjustedGoal: Math.round(inflationAdjustedGoal),
      existingGrowth: Math.round(existingGrowth),
      remainingGoal: Math.round(remainingGoal),
      monthlySIP: Math.round(monthlySIP),
      lumpsumNeeded: Math.round(lumpsumNeeded),
      totalInvested: Math.round(monthlySIP * totalMonths),
      wealthGained: Math.round(remainingGoal - monthlySIP * totalMonths),
      recommendation,
    };
  }, [goalAmount, timeHorizon, inflation, expectedReturn, existingSavings]);

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField id="goal-amount" label="Goal Amount (Today's Value)" value={goalAmount}
          min={100_000} max={50_000_000} step={100_000} display={formatCalculatorCurrency(goalAmount)}
          minLabel="₹1L" maxLabel="₹5Cr"
          validation={{ type: 'amount', label: 'Goal amount', min: 100_000, max: 50_000_000 }}
          error={errors.goal} onValidChange={setGoalAmount} onError={setError('goal')} />
        <SliderField id="goal-horizon" label="Time Horizon" value={timeHorizon}
          min={1} max={30} step={1} display={`${timeHorizon} years`} minLabel="1 year" maxLabel="30 years"
          validation={{ type: 'years', min: 1, max: 30 }}
          error={errors.horizon} onValidChange={setTimeHorizon} onError={setError('horizon')} />
        <SliderField id="goal-inflation" label="Expected Inflation" value={inflation}
          min={3} max={10} step={0.5} display={`${inflation}%`} minLabel="3%" maxLabel="10%"
          validation={{ type: 'rate', label: 'Inflation rate', min: 3, max: 10 }}
          error={errors.inflation} onValidChange={setInflation} onError={setError('inflation')} />
        <SliderField id="goal-return" label="Expected Investment Return" value={expectedReturn}
          min={6} max={20} step={0.5} display={`${expectedReturn}%`} minLabel="6%" maxLabel="20%"
          validation={{ type: 'rate', label: 'Expected return', min: 6, max: 20 }}
          error={errors.return} onValidChange={setExpectedReturn} onError={setError('return')} />
        <SliderField id="goal-savings" label="Existing Savings (for this goal)" value={existingSavings}
          min={0} max={10_000_000} step={50_000} display={formatCalculatorCurrency(existingSavings)}
          minLabel="₹0" maxLabel="₹1Cr"
          validation={{ type: 'amount', label: 'Existing savings', min: 0, max: 10_000_000 }}
          error={errors.savings} onValidChange={setExistingSavings} onError={setError('savings')} />
      </div>

      {result && (
        <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" aria-live="polite">
          <div className="text-center p-4 rounded-lg bg-warning-50 dark:bg-warning-900/20">
            <p className="text-xs text-surface-500">Inflation-Adjusted Goal (in {timeHorizon} years)</p>
            <p className="text-2xl font-extrabold font-mono text-warning-600 mt-1">{formatCalculatorCurrency(result.inflationAdjustedGoal)}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
            <div className="text-center p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
              <p className="text-xs text-surface-500">Monthly SIP Required</p>
              <p className="text-xl font-extrabold font-mono text-primary-600 mt-1">{formatCalculatorCurrency(result.monthlySIP)}</p>
            </div>
            <div className="text-center p-3 bg-success-50 dark:bg-success-900/20 rounded-lg">
              <p className="text-xs text-surface-500">OR Lumpsum Required</p>
              <p className="text-xl font-extrabold font-mono text-success-600 mt-1">{formatCalculatorCurrency(result.lumpsumNeeded)}</p>
            </div>
          </div>
          {existingSavings > 0 && (
            <p className="text-center text-xs text-surface-500">
              Your existing {formatCalculatorCurrency(existingSavings)} will grow to{' '}
              {formatCalculatorCurrency(result.existingGrowth)} — reducing your target by that amount.
            </p>
          )}
          <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
            <p className="text-xs font-semibold text-surface-700 dark:text-surface-300 mb-1">Suggested Fund Category</p>
            <p className="text-sm text-primary-600 font-medium">{result.recommendation}</p>
          </div>
          <CalculatorShareRow
            tool="Goal Planner"
            summary={`Goal ${formatCalculatorCurrency(result.inflationAdjustedGoal)} · SIP ${formatCalculatorCurrency(result.monthlySIP)}/mo`}
            shareText={`Financial goal in ${timeHorizon} years: ${formatCalculatorCurrency(result.inflationAdjustedGoal)}; SIP ${formatCalculatorCurrency(result.monthlySIP)}/month.`}
          />
        </div>
      )}
    </div>
  );
}

export default withErrorBoundary(GoalPlannerInner, 'Goal Planner');
