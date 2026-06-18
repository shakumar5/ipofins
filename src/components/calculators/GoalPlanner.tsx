import { useState, useMemo } from 'react';

export default function GoalPlanner() {
  const [goalAmount, setGoalAmount] = useState(5000000);
  const [timeHorizon, setTimeHorizon] = useState(12);
  const [inflation, setInflation] = useState(6);
  const [expectedReturn, setExpectedReturn] = useState(12);
  const [existingSavings, setExistingSavings] = useState(0);

  const result = useMemo(() => {
    // Inflation-adjusted goal
    const inflationAdjustedGoal = goalAmount * Math.pow(1 + inflation / 100, timeHorizon);

    // Value of existing savings at end
    const existingGrowth = existingSavings * Math.pow(1 + expectedReturn / 100, timeHorizon);

    // Remaining amount to accumulate
    const remainingGoal = Math.max(0, inflationAdjustedGoal - existingGrowth);

    // Monthly SIP needed
    const monthlyRate = expectedReturn / 12 / 100;
    const totalMonths = timeHorizon * 12;
    const monthlySIP = remainingGoal / (((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate));

    // Lumpsum needed
    const lumpsumNeeded = remainingGoal / Math.pow(1 + expectedReturn / 100, timeHorizon);

    // Total invested via SIP
    const totalInvested = monthlySIP * totalMonths;
    const wealthGained = remainingGoal - totalInvested;

    // Recommended fund categories based on time horizon
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
      totalInvested: Math.round(totalInvested),
      wealthGained: Math.round(wealthGained),
      recommendation,
    };
  }, [goalAmount, timeHorizon, inflation, expectedReturn, existingSavings]);

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
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Goal Amount (Today's Value)</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(goalAmount)}</span>
          </div>
          <input type="range" min="100000" max="50000000" step="100000" value={goalAmount}
            onChange={(e) => setGoalAmount(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹1L</span><span>₹5Cr</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Time Horizon</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{timeHorizon} years</span>
          </div>
          <input type="range" min="1" max="30" step="1" value={timeHorizon}
            onChange={(e) => setTimeHorizon(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>1 year</span><span>30 years</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Expected Inflation</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{inflation}%</span>
          </div>
          <input type="range" min="3" max="10" step="0.5" value={inflation}
            onChange={(e) => setInflation(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>3%</span><span>10%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Expected Investment Return</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{expectedReturn}%</span>
          </div>
          <input type="range" min="6" max="20" step="0.5" value={expectedReturn}
            onChange={(e) => setExpectedReturn(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>6%</span><span>20%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Existing Savings (for this goal)</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(existingSavings)}</span>
          </div>
          <input type="range" min="0" max="10000000" step="50000" value={existingSavings}
            onChange={(e) => setExistingSavings(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600" />
          <div className="flex justify-between text-xs text-surface-500 mt-1"><span>₹0</span><span>₹1Cr</span></div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4">
        <div className="text-center p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20">
          <p className="text-xs text-surface-500 dark:text-surface-400">Inflation-Adjusted Goal (in {timeHorizon} years)</p>
          <p className="text-2xl font-extrabold text-orange-600 dark:text-orange-400 mt-1">{formatCurrency(result.inflationAdjustedGoal)}</p>
          <p className="text-xs text-surface-500 mt-1">₹{goalAmount.toLocaleString('en-IN')} today = {formatCurrency(result.inflationAdjustedGoal)} after {inflation}% inflation</p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-xs text-surface-500 dark:text-surface-400">Monthly SIP Required</p>
            <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">{formatCurrency(result.monthlySIP)}</p>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-xs text-surface-500 dark:text-surface-400">OR Lumpsum Required</p>
            <p className="text-xl font-extrabold text-green-600 dark:text-green-400 mt-1">{formatCurrency(result.lumpsumNeeded)}</p>
          </div>
        </div>

        {existingSavings > 0 && (
          <div className="text-center text-xs text-surface-500 dark:text-surface-400">
            Your existing ₹{existingSavings.toLocaleString('en-IN')} will grow to {formatCurrency(result.existingGrowth)} — reducing your target by that amount.
          </div>
        )}

        <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
          <p className="text-xs font-semibold text-surface-700 dark:text-surface-300 mb-1">Suggested Fund Category</p>
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">{result.recommendation}</p>
        </div>
      </div>
    </div>
  );
}
