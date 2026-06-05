import { useState, useMemo } from 'react';

export default function CAGRCalculator() {
  const [initialValue, setInitialValue] = useState(100000);
  const [finalValue, setFinalValue] = useState(250000);
  const [years, setYears] = useState(5);

  const result = useMemo(() => {
    const cagr = (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
    const absoluteReturn = ((finalValue - initialValue) / initialValue) * 100;
    return { cagr, absoluteReturn };
  }, [initialValue, finalValue, years]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Initial Investment</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(initialValue)}</span>
          </div>
          <input
            type="range" min="10000" max="10000000" step="10000" value={initialValue}
            onChange={(e) => setInitialValue(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>₹10K</span><span>₹1 Cr</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Final Value</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(finalValue)}</span>
          </div>
          <input
            type="range" min="10000" max="50000000" step="10000" value={finalValue}
            onChange={(e) => setFinalValue(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>₹10K</span><span>₹5 Cr</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Time Period</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{years} years</span>
          </div>
          <input
            type="range" min="1" max="30" step="1" value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1 year</span><span>30 years</span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">CAGR</p>
            <p className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
              {result.cagr.toFixed(2)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">per annum</p>
          </div>
          <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Absolute Return</p>
            <p className={`text-3xl font-extrabold ${result.absoluteReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {result.absoluteReturn.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">total</p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-xs text-blue-700 dark:text-blue-300 text-center">
            Your investment grew from {formatCurrency(initialValue)} to {formatCurrency(finalValue)} at {result.cagr.toFixed(2)}% CAGR over {years} years
          </p>
        </div>
      </div>
    </div>
  );
}
