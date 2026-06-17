import { useState } from 'react';

interface IPO {
  name: string;
  slug: string;
  priceRange: string;
  lotSize: number;
  openDate: string;
  closeDate: string;
  status: string;
  type: string;
  subscription?: number;
  gmp?: number;
  aiScore?: number;
  sector?: string;
}

interface Props {
  ipos: IPO[];
}

export default function IPOFilter({ ipos }: Props) {
  const [filter, setFilter] = useState('all');

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'mainboard', label: 'Mainboard' },
    { key: 'sme', label: 'SME' },
    { key: 'live', label: 'Live' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'listed', label: 'Listed' },
  ];

  const filtered = ipos.filter(ipo => {
    if (filter === 'all') return true;
    if (filter === 'mainboard') return ipo.type === 'mainboard';
    if (filter === 'sme') return ipo.type === 'sme';
    return ipo.status === filter;
  });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      live: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      open: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      upcoming: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      closed: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
      allotment: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
      listed: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      'drhp-filed': 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      withdrawn: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
    };
    return map[status] ?? map.closed;
  };

  return (
    <div>
      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 mb-8">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-xs opacity-70">
              ({ipos.filter(ipo => {
                if (f.key === 'all') return true;
                if (f.key === 'mainboard') return ipo.type === 'mainboard';
                if (f.key === 'sme') return ipo.type === 'sme';
                return ipo.status === f.key;
              }).length})
            </span>
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(ipo => (
            <a
              key={ipo.slug}
              href={`/ipo/${ipo.slug}`}
              className="block p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate hover:text-blue-600 transition-colors">
                    {ipo.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 uppercase font-medium">{ipo.type}</span>
                    {ipo.sector && <span className="text-xs text-gray-400">• {ipo.sector}</span>}
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(ipo.status)}`}>
                  {ipo.status.charAt(0).toUpperCase() + ipo.status.slice(1)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-xs text-gray-500">Price Band</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">₹{ipo.priceRange}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Lot Size</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{ipo.lotSize} shares</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Open</p>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{ipo.openDate}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Close</p>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{ipo.closeDate}</p>
                </div>
              </div>

              {/* Subscription bar for live/closed */}
              {ipo.subscription && (ipo.status === 'live' || ipo.status === 'closed') && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Subscription</span>
                    <span className="text-xs font-semibold text-blue-600">{ipo.subscription}x</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${Math.min(ipo.subscription * 10, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Bottom row */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                {ipo.gmp !== undefined && (
                  <span className={`text-xs font-semibold ${ipo.gmp >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    GMP: {ipo.gmp >= 0 ? '+' : ''}₹{ipo.gmp}
                  </span>
                )}
                {ipo.aiScore !== undefined && (
                  <span className={`text-xs font-bold ${ipo.aiScore >= 7 ? 'text-green-500' : ipo.aiScore >= 4 ? 'text-yellow-500' : 'text-red-500'}`}>
                    AI: {ipo.aiScore}/10
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
          <p className="text-gray-500 dark:text-gray-400">No IPOs found for this filter.</p>
          <button onClick={() => setFilter('all')} className="mt-3 text-sm text-blue-600 hover:underline">Show all IPOs</button>
        </div>
      )}
    </div>
  );
}
