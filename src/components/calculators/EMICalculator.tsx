import { useState, useMemo } from 'react';

export default function EMICalculator() {
  const [principal, setPrincipal] = useState(2500000);
  const [rate, setRate] = useState(8.5);
  const [tenure, setTenure] = useState(20);

  const result = useMemo(() => {
    const monthlyRate = rate / 12 / 100;
    const months = tenure * 12;
    const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    const totalPayment = emi * months;
    const totalInterest = totalPayment - principal;
    return { emi, totalPayment, totalInterest, months };
  }, [principal, rate, tenure]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
  };

  const principalPercentage = (principal / result.totalPayment) * 100;

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Loan Amount</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(principal)}</span>
          </div>
          <input
            type="range" min="100000" max="50000000" step="100000" value={principal}
            onChange={(e) => setPrincipal(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
          />
          <div className="flex justify-between text-xs text-surface-500 mt-1">
            <span>₹1 L</span><span>₹5 Cr</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Interest Rate</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{rate}% p.a.</span>
          </div>
          <input
            type="range" min="4" max="20" step="0.1" value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
          />
          <div className="flex justify-between text-xs text-surface-500 mt-1">
            <span>4%</span><span>20%</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Loan Tenure</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{tenure} years</span>
          </div>
          <input
            type="range" min="1" max="30" step="1" value={tenure}
            onChange={(e) => setTenure(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
          />
          <div className="flex justify-between text-xs text-surface-500 mt-1">
            <span>1 year</span><span>30 years</span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4">
        {/* EMI Amount */}
        <div className="text-center pb-4 border-b border-surface-200 dark:border-surface-700">
          <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">Monthly EMI</p>
          <p className="text-4xl font-extrabold text-blue-600 dark:text-blue-400">
            {formatCurrency(result.emi)}
          </p>
        </div>

        {/* Visual Bar */}
        <div className="h-4 rounded-full overflow-hidden bg-surface-200 dark:bg-surface-700 flex">
          <div className="bg-blue-500 transition-all duration-500" style={{ width: `${principalPercentage}%` }} />
          <div className="bg-orange-500 transition-all duration-500" style={{ width: `${100 - principalPercentage}%` }} />
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-surface-600 dark:text-surface-400">Principal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-orange-500" />
            <span className="text-surface-600 dark:text-surface-400">Interest</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-3 gap-4 pt-4">
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Principal</p>
            <p className="text-sm font-bold text-surface-900 dark:text-white mt-1">{formatCurrency(principal)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Interest</p>
            <p className="text-sm font-bold text-orange-500 mt-1">{formatCurrency(result.totalInterest)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400">Total</p>
            <p className="text-sm font-bold text-surface-900 dark:text-white mt-1">{formatCurrency(result.totalPayment)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
