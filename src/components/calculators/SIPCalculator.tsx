import { useState, useMemo, useEffect, useCallback } from 'react';
import { validateAmount, validateRate, validateYears } from '../../utils/calculator-validation';

function getUrlParams() {
  if (typeof window === 'undefined') return { sip: 5000, rate: 12, years: 10 };
  const p = new URLSearchParams(window.location.search);
  return {
    sip: Number(p.get('sip') ?? 5000) || 5000,
    rate: Number(p.get('rate') ?? 12) || 12,
    years: Number(p.get('years') ?? 10) || 10,
  };
}

export default function SIPCalculator() {
  const init = getUrlParams();
  const [monthlyInvestment, setMonthlyInvestment] = useState(Math.min(Math.max(init.sip, 500), 100000));
  const [expectedReturn, setExpectedReturn] = useState(Math.min(Math.max(init.rate, 1), 30));
  const [timePeriod, setTimePeriod] = useState(Math.min(Math.max(init.years, 1), 40));

  const [errors, setErrors] = useState<{ sip?: string; rate?: string; years?: string }>({});
  const [copied, setCopied] = useState(false);

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

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = `My SIP Plan: ₹${monthlyInvestment.toLocaleString('en-IN')}/month for ${timePeriod} years at ${expectedReturn}% → ${formatCurrency(result.futureValue)} corpus. Calculate yours:`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

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

      {/* Share Row */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
          aria-label="Share SIP result on WhatsApp"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.556 4.116 1.528 5.845L0 24l6.335-1.507A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.011-1.371l-.36-.214-3.724.886.904-3.618-.234-.373A9.818 9.818 0 1112 21.818z"/>
          </svg>
          Share on WhatsApp
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
          aria-label="Copy link to this calculation"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>

      <p className="text-xs text-surface-400 dark:text-surface-500">
        Assumes fixed monthly investment and constant annual return rate. Actual mutual fund returns vary. Not investment advice.
      </p>
    </div>
  );
}
