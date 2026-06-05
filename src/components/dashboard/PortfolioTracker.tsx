import { useState } from 'react';

interface Holding {
  id: string;
  name: string;
  type: 'ipo' | 'stock' | 'mf';
  investedAmount: number;
  currentValue: number;
  units: number;
  buyPrice: number;
  currentPrice: number;
}

const SAMPLE_HOLDINGS: Holding[] = [
  { id: '1', name: 'CMR Green Technologies', type: 'ipo', investedAmount: 14945, currentValue: 18360, units: 49, buyPrice: 305, currentPrice: 374.7 },
  { id: '2', name: 'Hexagon Nutrition', type: 'ipo', investedAmount: 14550, currentValue: 15900, units: 30, buyPrice: 485, currentPrice: 530 },
  { id: '3', name: 'PPFAS Flexi Cap Fund', type: 'mf', investedAmount: 100000, currentValue: 118500, units: 1380.5, buyPrice: 72.45, currentPrice: 85.84 },
  { id: '4', name: 'HDFC Mid-Cap Opportunities', type: 'mf', investedAmount: 75000, currentValue: 91500, units: 478.6, buyPrice: 156.78, currentPrice: 191.2 },
  { id: '5', name: 'Quant Small Cap Fund', type: 'mf', investedAmount: 50000, currentValue: 64100, units: 203.8, buyPrice: 245.3, currentPrice: 314.5 },
];

export default function PortfolioTracker() {
  const [holdings] = useState<Holding[]>(SAMPLE_HOLDINGS);
  const [filter, setFilter] = useState<'all' | 'ipo' | 'mf' | 'stock'>('all');

  const filtered = holdings.filter(h => filter === 'all' || h.type === filter);

  const totalInvested = holdings.reduce((sum, h) => sum + h.investedAmount, 0);
  const totalCurrent = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalPnL = totalCurrent - totalInvested;
  const totalReturn = ((totalCurrent - totalInvested) / totalInvested) * 100;

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Invested</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totalInvested)}</p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <p className="text-xs text-gray-500 dark:text-gray-400">Current Value</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totalCurrent)}</p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total P&L</p>
          <p className={`text-xl font-bold mt-1 ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
          </p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <p className="text-xs text-gray-500 dark:text-gray-400">Overall Return</p>
          <p className={`text-xl font-bold mt-1 ${totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Portfolio Bar */}
      <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Allocation</p>
        <div className="h-3 rounded-full overflow-hidden flex">
          {holdings.map((h, i) => (
            <div
              key={h.id}
              className={`transition-all ${
                i % 3 === 0 ? 'bg-blue-500' : i % 3 === 1 ? 'bg-green-500' : 'bg-purple-500'
              }`}
              style={{ width: `${(h.currentValue / totalCurrent) * 100}%` }}
              title={`${h.name}: ${((h.currentValue / totalCurrent) * 100).toFixed(1)}%`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">IPO</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-green-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Mutual Funds</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-purple-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Stocks</span>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'ipo', 'mf', 'stock'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'All' : f === 'ipo' ? 'IPOs' : f === 'mf' ? 'Mutual Funds' : 'Stocks'}
          </button>
        ))}
      </div>

      {/* Holdings List */}
      <div className="space-y-3">
        {filtered.map(holding => {
          const pnl = holding.currentValue - holding.investedAmount;
          const returnPct = ((holding.currentValue - holding.investedAmount) / holding.investedAmount) * 100;

          return (
            <div key={holding.id} className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{holding.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {holding.units} units @ ₹{holding.buyPrice.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(holding.currentValue)}</p>
                  <p className={`text-xs font-semibold ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)} ({returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%)
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
