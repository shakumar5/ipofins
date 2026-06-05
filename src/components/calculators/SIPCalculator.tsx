import { useState, useMemo } from 'react';

export default function SIPCalculator() {
  const [monthlyInvestment, setMonthlyInvestment] = useState(5000);
  const [expectedReturn, setExpectedReturn] = useState(12);
  const [timePeriod, setTimePeriod] = useState(10);

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
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  const investedPercentage = (result.invested / result.futureValue) * 100;

  return (
    <div className="space-y-8">
      {/* Inputs */}
      <div className="space-y-6">
        {/* Monthly Investment */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Monthly Investment
            </label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              ₹{monthlyInvestment.toLocaleString('en-IN')}
            </span>
          </div>
          <input
            type="range"
            min="500"
            max="100000"
            step="500"
            value={monthlyInvestment}
            onChange={(e) => setMonthlyInvestment(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>₹500</span>
            <span>₹1,00,000</span>
          </div>
        </div>

        {/* Expected Return */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Expected Annual Return
            </label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {expectedReturn}%
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="30"
            step="0.5"
            value={expectedReturn}
            onChange={(e) => setExpectedReturn(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1%</span>
            <span>30%</span>
          </div>
        </div>

        {/* Time Period */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Time Period
            </label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {timePeriod} years
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="40"
            step="1"
            value={timePeriod}
            onChange={(e) => setTimePeriod(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1 year</span>
            <span>40 years</span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 space-y-4">
        {/* Visual Bar */}
        <div className="h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex">
          <div
            className="bg-blue-500 transition-all duration-500"
            style={{ width: `${investedPercentage}%` }}
          />
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${100 - investedPercentage}%` }}
          />
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-gray-600 dark:text-gray-400">Invested</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-gray-600 dark:text-gray-400">Returns</span>
          </div>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Invested</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
              {formatCurrency(result.invested)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Returns</p>
            <p className="text-lg font-bold text-green-500 mt-1">
              {formatCurrency(result.returns)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Value</p>
            <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
              {formatCurrency(result.futureValue)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
