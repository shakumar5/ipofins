import { useState, useMemo, useEffect, useCallback } from 'react';
import { validateAmount, validateRate, validateYears } from '../../utils/calculator-validation';
import { withErrorBoundary } from '../withErrorBoundary';
import CalculatorShareRow from '../dashboard/CalculatorShareRow';

function getUrlParams() {
  if (typeof window === 'undefined') return { sip: 5000, rate: 12, years: 10 };
  const p = new URLSearchParams(window.location.search);
  return {
    sip: Number(p.get('sip') ?? 5000) || 5000,
    rate: Number(p.get('rate') ?? 12) || 12,
    years: Number(p.get('years') ?? 10) || 10,
  };
}

function SIPCalculatorInner() {
  const init = getUrlParams();
  const [monthlyInvestment, setMonthlyInvestment] = useState(Math.min(Math.max(init.sip, 500), 100000));
  const [expectedReturn, setExpectedReturn] = useState(Math.min(Math.max(init.rate, 1), 30));
  const [timePeriod, setTimePeriod] = useState(Math.min(Math.max(init.years, 1), 40));

  const [errors, setErrors] = useState<{ sip?: string; rate?: string; years?: string }>({});

  // Sync URL params on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('sip', String(monthlyInvestment));
    url.searchParams.set('rate', String(expectedReturn));
    url.searchParams.set('years', String(timePeriod));
    window.history.replaceState({}, '', url.toString());
  }, [monthlyInvestment, expectedReturn, timePeriod]);

  const result = useMemo(() => {
    const monthlyRate = expectedReturn / 12 / 100;
    const months = timePeriod * 12;
    const invested = monthlyInvestment * months;
    const futureValue =
      monthlyInvestment * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
    const returns = futureValue - invested;
    return { invested, futureValue, returns };
  }, [monthlyInvestment, expectedReturn, timePeriod]);

  const formatCurrency = (value: number) => {
    if (!Number.isFinite(value)) return '—';
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
  };

  const investedPercentage = result.futureValue > 0
    ? (result.invested / result.futureValue) * 100
    : 50;

  const handleSipChange = useCallback((val: number) => {
    const v = validateAmount(val, 'Monthly SIP', 500, 100000);
    setErrors(e => ({ ...e, sip: v.error }));
    if (v.isValid) setMonthlyInvestment(val);
  }, []);

  const handleRateChange = useCallback((val: number) => {
    const v = validateRate(val, 'Return rate', 1, 30);
    setErrors(e => ({ ...e, rate: v.error }));
    if (v.isValid) setExpectedReturn(val);
  }, []);

  const handleYearsChange = useCallback((val: number) => {
    const v = validateYears(val, 1, 40);
    setErrors(e => ({ ...e, years: v.error }));
    if (v.isValid) setTimePeriod(val);
  }, []);

  const shareText = `My SIP Plan: ₹${monthlyInvestment.toLocaleString('en-IN')}/month for ${timePeriod} years at ${expectedReturn}% → ${formatCurrency(result.futureValue)} corpus. Calculate yours:`;

  return (
    <div className="space-y-8">
      {/* Inputs */}
      <div className="space-y-6">
        {/* Monthly Investment */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="sip-amount" className="text-sm font-medium text-surface-700 dark:text-surface-300">
              Monthly Investment
            </label>
            <span className="text-sm font-bold font-mono text-surface-900 dark:text-white">
              ₹{monthlyInvestment.toLocaleString('en-IN')}
            </span>
          </div>
          <input
            id="sip-amount"
            type="range"
            min="500"
            max="100000"
            step="500"
            value={monthlyInvestment}
            onChange={(e) => handleSipChange(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
            aria-valuemin={500}
            aria-valuemax={100000}
            aria-valuenow={monthlyInvestment}
            aria-label={`Monthly SIP investment: ₹${monthlyInvestment.toLocaleString('en-IN')}`}
          />
          <div className="flex justify-between text-xs text-surface-500 mt-1">
            <span>₹500</span><span>₹1,00,000</span>
          </div>
          {errors.sip && <p className="text-xs text-danger-600 mt-1" role="alert">{errors.sip}</p>}
        </div>

        {/* Expected Return */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="sip-rate" className="text-sm font-medium text-surface-700 dark:text-surface-300">
              Expected Annual Return
            </label>
            <span className="text-sm font-bold font-mono text-surface-900 dark:text-white">{expectedReturn}%</span>
          </div>
          <input
            id="sip-rate"
            type="range"
            min="1"
            max="30"
            step="0.5"
            value={expectedReturn}
            onChange={(e) => handleRateChange(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
            aria-valuemin={1}
            aria-valuemax={30}
            aria-valuenow={expectedReturn}
            aria-label={`Expected annual return: ${expectedReturn}%`}
          />
          <div className="flex justify-between text-xs text-surface-500 mt-1">
            <span>1%</span><span>30%</span>
          </div>
          {errors.rate && <p className="text-xs text-danger-600 mt-1" role="alert">{errors.rate}</p>}
        </div>

        {/* Time Period */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="sip-years" className="text-sm font-medium text-surface-700 dark:text-surface-300">
              Time Period
            </label>
            <span className="text-sm font-bold font-mono text-surface-900 dark:text-white">{timePeriod} years</span>
          </div>
          <input
            id="sip-years"
            type="range"
            min="1"
            max="40"
            step="1"
            value={timePeriod}
            onChange={(e) => handleYearsChange(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
            aria-valuemin={1}
            aria-valuemax={40}
            aria-valuenow={timePeriod}
            aria-label={`Investment period: ${timePeriod} years`}
          />
          <div className="flex justify-between text-xs text-surface-500 mt-1">
            <span>1 year</span><span>40 years</span>
          </div>
          {errors.years && <p className="text-xs text-danger-600 mt-1" role="alert">{errors.years}</p>}
        </div>
      </div>

      {/* Results */}
      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4" role="region" aria-label="SIP calculation results">
        {/* Visual Bar */}
        <div
          className="h-4 rounded-full overflow-hidden bg-surface-200 dark:bg-surface-700 flex"
          role="img"
          aria-label={`${Math.round(investedPercentage)}% invested, ${Math.round(100 - investedPercentage)}% returns`}
        >
          <div className="bg-primary-500 transition-all duration-500" style={{ width: `${investedPercentage}%` }} />
          <div className="bg-success-500 transition-all duration-500" style={{ width: `${100 - investedPercentage}%` }} />
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-primary-500" aria-hidden="true" />
            <span className="text-surface-600 dark:text-surface-400">Invested</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-success-500" aria-hidden="true" />
            <span className="text-surface-600 dark:text-surface-400">Returns</span>
          </div>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Invested</p>
            <p className="text-lg font-bold font-mono text-surface-900 dark:text-white mt-1" aria-label={`Total invested: ${formatCurrency(result.invested)}`}>
              {formatCurrency(result.invested)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Returns</p>
            <p className="text-lg font-bold font-mono text-success-600 dark:text-success-400 mt-1" aria-label={`Estimated returns: +${formatCurrency(result.returns)}`}>
              +{formatCurrency(result.returns)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Total Value</p>
            <p className="text-xl font-extrabold font-mono text-primary-600 dark:text-primary-400 mt-1" aria-label={`Total corpus: ${formatCurrency(result.futureValue)}`}>
              {formatCurrency(result.futureValue)}
            </p>
          </div>
        </div>
      </div>

      <CalculatorShareRow
        tool="SIP Calculator"
        summary={`₹${monthlyInvestment.toLocaleString('en-IN')}/mo × ${timePeriod}yr @ ${expectedReturn}% → ${formatCurrency(result.futureValue)}`}
        shareText={shareText}
      />

      <p className="text-xs text-surface-400 dark:text-surface-500">
        Assumes fixed monthly investment and constant annual return rate. Actual mutual fund returns vary. Not investment advice.
      </p>
    </div>
  );
}

export default withErrorBoundary(SIPCalculatorInner, 'SIP Calculator');
