import { useState, useMemo } from 'react';

export default function ReturnSimulator() {
  const [investment, setInvestment] = useState(500000);
  const [years, setYears] = useState(10);
  const [scenarioType, setScenarioType] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');

  const scenarios = {
    conservative: { returnRate: 8, label: 'Conservative', color: 'blue', description: 'FD / Debt Funds (~8%)' },
    moderate: { returnRate: 12, label: 'Moderate', color: 'green', description: 'Balanced / Large Cap (~12%)' },
    aggressive: { returnRate: 18, label: 'Aggressive', color: 'purple', description: 'Small / Mid Cap (~18%)' },
  };

  const results = useMemo(() => {
    return Object.entries(scenarios).map(([key, scenario]) => {
      const futureValue = investment * Math.pow(1 + scenario.returnRate / 100, years);
      const profit = futureValue - investment;
      return { key, ...scenario, futureValue, profit };
    });
  }, [investment, years]);

  const selected = results.find(r => r.key === scenarioType)!;

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Lump Sum Investment</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(investment)}</span>
          </div>
          <input
            type="range" min="50000" max="10000000" step="50000" value={investment}
            onChange={(e) => setInvestment(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Investment Horizon</label>
            <span className="text-sm font-bold text-surface-900 dark:text-white">{years} years</span>
          </div>
          <input
            type="range" min="1" max="30" step="1" value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
          />
        </div>

        {/* Scenario Selector */}
        <div>
          <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-2">Risk Appetite</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(scenarios).map(([key, scenario]) => (
              <button
                key={key}
                onClick={() => setScenarioType(key as typeof scenarioType)}
                className={`p-3 rounded-lg border text-center transition-all ${
                  scenarioType === key
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-surface-200 dark:border-surface-700 hover:border-surface-300'
                }`}
              >
                <p className="text-xs font-semibold text-surface-900 dark:text-white">{scenario.label}</p>
                <p className="text-[10px] text-surface-500 mt-0.5">{scenario.returnRate}% p.a.</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison Results */}
      <div className="bg-surface-50 dark:bg-surface-800/50 rounded-xl p-6 space-y-4">
        <div className="text-center pb-4 border-b border-surface-200 dark:border-surface-700">
          <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">{selected.label} Scenario ({selected.description})</p>
          <p className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
            {formatCurrency(selected.futureValue)}
          </p>
          <p className="text-sm text-green-500 font-semibold mt-1">
            +{formatCurrency(selected.profit)} profit
          </p>
        </div>

        {/* All scenarios comparison */}
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.key} className={`flex items-center justify-between p-3 rounded-lg ${r.key === scenarioType ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800' : ''}`}>
              <div>
                <p className="text-sm font-medium text-surface-900 dark:text-white">{r.label}</p>
                <p className="text-xs text-surface-500">{r.description}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-surface-900 dark:text-white">{formatCurrency(r.futureValue)}</p>
                <p className="text-xs text-green-500">+{((r.futureValue - investment) / investment * 100).toFixed(0)}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
