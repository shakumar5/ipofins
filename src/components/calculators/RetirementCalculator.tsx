import { useState, useMemo } from 'react';

export default function RetirementCalculator() {
  const [currentAge, setCurrentAge] = useState(30);
  const [retirementAge, setRetirementAge] = useState(60);
  const [monthlyExpense, setMonthlyExpense] = useState(50000);
  const [inflation, setInflation] = useState(6);
  const [preReturnRate, setPreReturnRate] = useState(12);
  const [postReturnRate, setPostReturnRate] = useState(8);
  const [lifeExpectancy, setLifeExpectancy] = useState(85);

  const result = useMemo(() => {
    const yearsToRetirement = retirementAge - currentAge;
    const yearsInRetirement = lifeExpectancy - retirementAge;

    // Monthly expense at retirement (inflation adjusted)
    const monthlyExpenseAtRetirement = monthlyExpense * Math.pow(1 + inflation / 100, yearsToRetirement);
    const annualExpenseAtRetirement = monthlyExpenseAtRetirement * 12;

    // Corpus needed at retirement (present value of annuity with inflation)
    const realRate = ((1 + postReturnRate / 100) / (1 + inflation / 100)) - 1;
    let corpusNeeded = 0;
    if (realRate > 0) {
      corpusNeeded = annualExpenseAtRetirement * (1 - Math.pow(1 + realRate, -yearsInRetirement)) / realRate;
    } else {
      corpusNeeded = annualExpenseAtRetirement * yearsInRetirement;
    }

    // Monthly SIP needed to build this corpus
    const monthlyRate = preReturnRate / 12 / 100;
    const totalMonths = yearsToRetirement * 12;
    const monthlySIPNeeded = corpusNeeded / (((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate));

    const totalInvested = monthlySIPNeeded * totalMonths;
    const wealthGained = corpusNeeded - totalInvested;

    return {
      yearsToRetirement,
      yearsInRetirement,
      monthlyExpenseAtRetirement: Math.round(monthlyExpenseAtRetirement),
      corpusNeeded: Math.round(corpusNeeded),
      monthlySIPNeeded: Math.round(monthlySIPNeeded),
      totalInvested: Math.round(totalInvested),
      wealthGained: Math.round(wealthGained),
    };
  }, [currentAge, retirementAge, monthlyExpense, inflation, preReturnRate, postReturnRate, lifeExpectancy]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-8">
      {/* Inputs */}
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Age</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{currentAge} years</span>
          </div>
          <input type="range" min="18" max="55" step="1" value={currentAge}
            onChange={(e) => setCurrentAge(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>18</span><span>55</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Retirement Age</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{retirementAge} years</span>
          </div>
          <input type="range" min="40" max="70" step="1" value={retirementAge}
            onChange={(e) => setRetirementAge(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>40</span><span>70</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Expense (Today)</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">₹{monthlyExpense.toLocaleString('en-IN')}</span>
          </div>
          <input type="range" min="10000" max="500000" step="5000" value={monthlyExpense}
            onChange={(e) => setMonthlyExpense(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>₹10K</span><span>₹5L</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Expected Inflation</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{inflation}%</span>
          </div>
          <input type="range" min="3" max="10" step="0.5" value={inflation}
            onChange={(e) => setInflation(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>3%</span><span>10%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Pre-Retirement Returns</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{preReturnRate}%</span>
          </div>
          <input type="range" min="6" max="20" step="0.5" value={preReturnRate}
            onChange={(e) => setPreReturnRate(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>6%</span><span>20%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Post-Retirement Returns</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{postReturnRate}%</span>
          </div>
          <input type="range" min="4" max="12" step="0.5" value={postReturnRate}
            onChange={(e) => setPostReturnRate(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>4%</span><span>12%</span></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Life Expectancy</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{lifeExpectancy} years</span>
          </div>
          <input type="range" min="70" max="100" step="1" value={lifeExpectancy}
            onChange={(e) => setLifeExpectancy(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>70</span><span>100</span></div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 space-y-4">
        <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <p className="text-xs text-gray-500 dark:text-gray-400">Retirement Corpus Needed</p>
          <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">{formatCurrency(result.corpusNeeded)}</p>
          <p className="text-xs text-gray-500 mt-1">to sustain ₹{monthlyExpense.toLocaleString('en-IN')}/month (today's value) until age {lifeExpectancy}</p>
        </div>

        <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
          <p className="text-xs text-gray-500 dark:text-gray-400">Monthly SIP Required (starting today)</p>
          <p className="text-2xl font-extrabold text-green-600 dark:text-green-400 mt-1">{formatCurrency(result.monthlySIPNeeded)}</p>
          <p className="text-xs text-gray-500 mt-1">for {result.yearsToRetirement} years at {preReturnRate}% expected returns</p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Monthly Expense at Retirement</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(result.monthlyExpenseAtRetirement)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Years in Retirement</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{result.yearsInRetirement} years</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Investment</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(result.totalInvested)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Wealth from Compounding</p>
            <p className="text-sm font-bold text-green-500 mt-1">{formatCurrency(result.wealthGained)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
