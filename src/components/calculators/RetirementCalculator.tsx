import { useState, useMemo } from 'react';
import { formatCalculatorCurrency } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import SliderField from './SliderField';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';
import { useFieldErrors } from './useFieldErrors';

function RetirementCalculatorInner() {
  const [currentAge, setCurrentAge] = useState(30);
  const [retirementAge, setRetirementAge] = useState(60);
  const [monthlyExpense, setMonthlyExpense] = useState(50_000);
  const [inflation, setInflation] = useState(6);
  const [preReturnRate, setPreReturnRate] = useState(12);
  const [postReturnRate, setPostReturnRate] = useState(8);
  const [lifeExpectancy, setLifeExpectancy] = useState(85);
  const { errors, setError } = useFieldErrors();

  const ageError = useMemo(() => {
    if (retirementAge <= currentAge) return 'Retirement age must be greater than current age.';
    if (lifeExpectancy <= retirementAge) return 'Life expectancy must be greater than retirement age.';
    return undefined;
  }, [currentAge, retirementAge, lifeExpectancy]);

  const result = useMemo(() => {
    if (retirementAge <= currentAge || lifeExpectancy <= retirementAge) return null;

    const yearsToRetirement = retirementAge - currentAge;
    const yearsInRetirement = lifeExpectancy - retirementAge;
    const monthlyExpenseAtRetirement = monthlyExpense * Math.pow(1 + inflation / 100, yearsToRetirement);
    const annualExpenseAtRetirement = monthlyExpenseAtRetirement * 12;

    const realRate = (1 + postReturnRate / 100) / (1 + inflation / 100) - 1;
    let corpusNeeded = 0;
    if (realRate > 0) {
      corpusNeeded =
        (annualExpenseAtRetirement * (1 - Math.pow(1 + realRate, -yearsInRetirement))) / realRate;
    } else {
      corpusNeeded = annualExpenseAtRetirement * yearsInRetirement;
    }

    const monthlyRate = preReturnRate / 12 / 100;
    const totalMonths = yearsToRetirement * 12;
    let monthlySIPNeeded = 0;
    if (monthlyRate === 0) {
      monthlySIPNeeded = totalMonths > 0 ? corpusNeeded / totalMonths : 0;
    } else {
      const factor =
        ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate);
      monthlySIPNeeded = factor > 0 ? corpusNeeded / factor : 0;
    }

    if (!Number.isFinite(corpusNeeded) || !Number.isFinite(monthlySIPNeeded)) return null;

    const totalInvested = monthlySIPNeeded * totalMonths;
    return {
      yearsToRetirement,
      yearsInRetirement,
      monthlyExpenseAtRetirement: Math.round(monthlyExpenseAtRetirement),
      corpusNeeded: Math.round(corpusNeeded),
      monthlySIPNeeded: Math.round(monthlySIPNeeded),
      totalInvested: Math.round(totalInvested),
      wealthGained: Math.round(corpusNeeded - totalInvested),
    };
  }, [currentAge, retirementAge, monthlyExpense, inflation, preReturnRate, postReturnRate, lifeExpectancy]);

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <SliderField id="ret-age" label="Current Age" value={currentAge} min={18} max={55} step={1}
          display={`${currentAge} years`} minLabel="18" maxLabel="55"
          validation={{ type: 'integer', label: 'Current age', min: 18, max: 55 }}
          error={errors.currentAge} onValidChange={setCurrentAge} onError={setError('currentAge')} />
        <SliderField id="ret-retire" label="Retirement Age" value={retirementAge} min={40} max={70} step={1}
          display={`${retirementAge} years`} minLabel="40" maxLabel="70"
          validation={{ type: 'integer', label: 'Retirement age', min: 40, max: 70 }}
          error={errors.retirementAge ?? ageError} onValidChange={setRetirementAge} onError={setError('retirementAge')} />
        <SliderField id="ret-expense" label="Monthly Expense (Today)" value={monthlyExpense} min={10_000} max={500_000} step={5000}
          display={`₹${monthlyExpense.toLocaleString('en-IN')}`} minLabel="₹10K" maxLabel="₹5L"
          validation={{ type: 'amount', label: 'Monthly expense', min: 10_000, max: 500_000 }}
          error={errors.expense} onValidChange={setMonthlyExpense} onError={setError('expense')} />
        <SliderField id="ret-inflation" label="Expected Inflation" value={inflation} min={3} max={10} step={0.5}
          display={`${inflation}%`} minLabel="3%" maxLabel="10%"
          validation={{ type: 'rate', label: 'Inflation rate', min: 3, max: 10 }}
          error={errors.inflation} onValidChange={setInflation} onError={setError('inflation')} />
        <SliderField id="ret-pre" label="Pre-Retirement Returns" value={preReturnRate} min={6} max={20} step={0.5}
          display={`${preReturnRate}%`} minLabel="6%" maxLabel="20%"
          validation={{ type: 'rate', label: 'Pre-retirement return', min: 6, max: 20 }}
          error={errors.preReturn} onValidChange={setPreReturnRate} onError={setError('preReturn')} />
        <SliderField id="ret-post" label="Post-Retirement Returns" value={postReturnRate} min={4} max={12} step={0.5}
          display={`${postReturnRate}%`} minLabel="4%" maxLabel="12%"
          validation={{ type: 'rate', label: 'Post-retirement return', min: 4, max: 12 }}
          error={errors.postReturn} onValidChange={setPostReturnRate} onError={setError('postReturn')} />
        <SliderField id="ret-life" label="Life Expectancy" value={lifeExpectancy} min={70} max={100} step={1}
          display={`${lifeExpectancy} years`} minLabel="70" maxLabel="100"
          validation={{ type: 'integer', label: 'Life expectancy', min: 70, max: 100 }}
          error={errors.lifeExpectancy} onValidChange={setLifeExpectancy} onError={setError('lifeExpectancy')} />
      </div>

      {result ? (
        <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" aria-live="polite">
          <div className="text-center p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20">
            <p className="text-xs text-surface-500">Retirement Corpus Needed</p>
            <p className="text-2xl font-extrabold font-mono text-primary-600 mt-1">{formatCalculatorCurrency(result.corpusNeeded)}</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-success-50 dark:bg-success-900/20">
            <p className="text-xs text-surface-500">Monthly SIP Required (starting today)</p>
            <p className="text-2xl font-extrabold font-mono text-success-600 mt-1">{formatCalculatorCurrency(result.monthlySIPNeeded)}</p>
            <p className="text-xs text-surface-500 mt-1">for {result.yearsToRetirement} years at {preReturnRate}% expected returns</p>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
            <div className="text-center">
              <p className="text-xs text-surface-500">Monthly Expense at Retirement</p>
              <p className="text-sm font-bold font-mono mt-1">{formatCalculatorCurrency(result.monthlyExpenseAtRetirement)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-surface-500">Years in Retirement</p>
              <p className="text-sm font-bold font-mono mt-1">{result.yearsInRetirement} years</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-surface-500">Total Investment</p>
              <p className="text-sm font-bold font-mono mt-1">{formatCalculatorCurrency(result.totalInvested)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-surface-500">Wealth from Compounding</p>
              <p className="text-sm font-bold font-mono text-success-500 mt-1">{formatCalculatorCurrency(result.wealthGained)}</p>
            </div>
          </div>
          <CalculatorShareRow
            tool="Retirement Calculator"
            summary={`Corpus ${formatCalculatorCurrency(result.corpusNeeded)} · SIP ${formatCalculatorCurrency(result.monthlySIPNeeded)}/mo`}
            shareText={`Retirement plan: need ${formatCalculatorCurrency(result.corpusNeeded)} corpus; SIP ${formatCalculatorCurrency(result.monthlySIPNeeded)}/month for ${result.yearsToRetirement} years.`}
          />
        </div>
      ) : (
        ageError && (
          <p className="text-sm text-danger-600 text-center py-4" role="alert">{ageError}</p>
        )
      )}
    </div>
  );
}

export default withErrorBoundary(RetirementCalculatorInner, 'Retirement Calculator');
