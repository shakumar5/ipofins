import { useState } from 'react';

interface Fund {
  name: string;
  slug: string;
  category: string;
  returns1y?: number;
  returns3y?: number;
  returns5y?: number;
  nav: number;
  rating?: number;
  aum?: string;
  riskLevel: string;
}

interface Props {
  funds: Fund[];
}

export default function MutualFundFilter({ funds }: Props) {
  const [filter, setFilter] = useState('all');

  const categories = ['All', ...new Set(funds.map(f => f.category))];

  const filtered = filter === 'all' ? funds : funds.filter(f => f.category === filter);

  const riskColor = (level: string) => {
    const map: Record<string, string> = {
      low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      moderate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      high: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
      'very-high': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return map[level] || map.moderate;
  };

  return (
    <div>
      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map(cat => {
          const key = cat === 'All' ? 'all' : cat;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Funds Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(fund => (
            <div
              key={fund.slug}
              className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800 transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                    {fund.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">{fund.category}</p>
                </div>
                {fund.rating && (
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: fund.rating }).map((_, i) => (
                      <svg key={i} className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                )}
              </div>

              {/* Returns */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-xs text-gray-500">1Y</p>
                  <p className={`text-sm font-bold ${(fund.returns1y ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {fund.returns1y !== undefined ? `${fund.returns1y > 0 ? '+' : ''}${fund.returns1y}%` : '--'}
                  </p>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-xs text-gray-500">3Y</p>
                  <p className={`text-sm font-bold ${(fund.returns3y ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {fund.returns3y !== undefined ? `${fund.returns3y > 0 ? '+' : ''}${fund.returns3y}%` : '--'}
                  </p>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-xs text-gray-500">5Y</p>
                  <p className={`text-sm font-bold ${(fund.returns5y ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {fund.returns5y !== undefined ? `${fund.returns5y > 0 ? '+' : ''}${fund.returns5y}%` : '--'}
                  </p>
                </div>
              </div>

              {/* Bottom */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-500">NAV</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">₹{fund.nav.toFixed(2)}</p>
                </div>
                {fund.aum && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500">AUM</p>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{fund.aum}</p>
                  </div>
                )}
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${riskColor(fund.riskLevel)}`}>
                  {fund.riskLevel.replace('-', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
          <p className="text-gray-500">No funds in this category.</p>
          <button onClick={() => setFilter('all')} className="mt-3 text-sm text-blue-600 hover:underline">Show all funds</button>
        </div>
      )}
    </div>
  );
}
