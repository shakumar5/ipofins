import { useState, useMemo } from 'react';

export default function StepUpSIPCalculator() {
  const [monthlyInvestment, setMonthlyInvestment] = useState(5000);
  const [annualStepUp, setAnnualStepUp] = useState(10);
  const [expectedReturn, setExpectedReturn] = useState(12);
  const [timePeriod, setTimePeriod] = useState(20);

  const result = useMemo(() => {
    const monthlyRate = expectedReturn / 12 / 100;
    let totalInvested = 0;
    let totalValue = 0;
    let currentSIP = monthlyInvestment;
    const yearlyBreakdown: { year: number; sip: number; invested: number; value: number }[] = [];

    for (let year = 1; year <= timePeriod; year++) {
      for (let month = 1; month <= 12; month++) {
        totalInvested += currentSIP;
        totalValue = (totalValue + currentSIP) * (1 + monthlyRate);
      }
      yearlyBreakdown.push({
        year,
        sip: Math.round(currentSIP),
        invested: Math.round(totalInvested),
        value: Math.round(totalValue),
      });
      currentSIP = currentSIP * (1 + annualStepUp / 100);
    }

    // Calculate without step-up for comparison
    let normalValue = 0;
    let normalInvested = 0;
    for (let month = 1; month <= timePeriod * 12; month++) {
      normalInvested += monthlyInvestment;
      normalValue = (normalValue + monthlyInvestment) * (1 + monthlyRate);
    }

    return {
      invested: Math.round(totalInvested),
      futureValue: Math.round(totalValue),
      returns: Math.round(totalValue - totalInvested),
      normalValue: Math.round(normalValue),
      normalInvested: Math.round(normalInvested),
      extraWealth: Math.round(totalValue - normalValue),
      yearlyBreakdown,
    };
  }, [monthlyInvestment, annualStepUp, expectedReturn, timePeriod]);

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
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Investment</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">₹{monthlyInvestment.toLocaleString('en-IN')}</span>
          </div>
          <input type="range" min="500" max="100000" step="500" value={monthlyInvestment}
            onChange={(e) => setMonthlyInvestment(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>₹500</span><span>₹1,00,000</span></div>
        </div>

        {/* Annual Step-Up */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Annual Step-Up</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{annualStepUp}%</span>
          </div>
          <input type="range" min="0" max="30" step="1" value={annualStepUp}
            onChange={(e) => setAnnualStepUp(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0%</span><span>30%</span></div>
        </div>

        {/* Expected Return */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Expected Annual Return</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{expectedReturn}%</span>
          </div>
          <input type="range" min="1" max="30" step="0.5" value={expectedReturn}
            onChange={(e) => setExpectedReturn(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>1%</span><span>30%</span></div>
        </div>

        {/* Time Period */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Time Period</label>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{timePeriod} years</span>
          </div>
          <input type="range" min="1" max="40" step="1" value={timePeriod}
            onChange={(e) => setTimePeriod(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>1 year</span><span>40 years</span></div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 space-y-4">
        {/* Visual Bar */}
        <div className="h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex">
          <div className="bg-blue-500 transition-all duration-500" style={{ width: `${investedPercentage}%` }} />
          <div className="bg-green-500 transition-all duration-500" style={{ width: `${100 - investedPercentage}%` }} />
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500" /><span className="text-gray-600 dark:text-gray-400">Invested</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-500" /><span className="text-gray-600 dark:text-gray-400">Returns</span></div>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Invested</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(result.invested)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Returns</p>
            <p className="text-lg font-bold text-green-500 mt-1">{formatCurrency(result.returns)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Value</p>
            <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">{formatCurrency(result.futureValue)}</p>
          </div>
        </div>

        {/* Comparison with normal SIP */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Step-Up SIP vs Regular SIP Comparison</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center bg-white dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500">Regular SIP Value</p>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-1">{formatCurrency(result.normalValue)}</p>
            </div>
            <div className="text-center bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <p className="text-xs text-green-600 dark:text-green-400">Extra Wealth from Step-Up</p>
              <p className="text-sm font-bold text-green-600 dark:text-green-400 mt-1">+{formatCurrency(result.extraWealth)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
