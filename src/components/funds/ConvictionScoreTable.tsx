import { useMemo, useState } from 'react';
import type { ConvictionScoreRow } from '../../lib/data/holdings';

interface ConvictionData {
  months: string[];
  categories: string[];
  rows: ConvictionScoreRow[];
}

interface Props {
  data: ConvictionData;
}

type SortKey = 'convictionScore' | 'freshEntries' | 'increasedCount' | 'totalFundsHolding' | 'stockName';
type SortDir = 'asc' | 'desc';

export default function ConvictionScoreTable({ data }: Props) {
  const [category, setCategory] = useState('ALL');
  const [month, setMonth] = useState(data.months[0] || '');
  const [sortKey, setSortKey] = useState<SortKey>('convictionScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo(() => {
    const filtered = data.rows.filter((r) => {
      if (month && r.month !== month) return false;
      if (category && r.category !== category) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'stockName') {
        cmp = a.stockName.localeCompare(b.stockName);
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [data.rows, month, category, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  }

  const displayCategories = data.categories.length > 1
    ? data.categories
    : ['ALL', 'Large Cap', 'Mid Cap', 'Flexi Cap', 'Small Cap'];

  return (
    <div>
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {displayCategories.map((c) => (
                <option key={c} value={c}>{c === 'ALL' ? 'All' : c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {data.months.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-surface-500 dark:text-surface-400">
          Conviction score (0–100) ranks stocks by net fund-manager activity: fresh entries and increases boost score; exits and decreases lower it.
          Scores are percentile-ranked within each category for the selected month.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-center py-12 text-surface-500 dark:text-surface-400 text-sm">
          No conviction scores for this selection. Run <code className="text-xs bg-surface-100 dark:bg-surface-800 px-1 rounded">npm run db:compute-signals</code> after loading monthly holdings.
        </p>
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 dark:bg-surface-800/50 text-left text-xs text-surface-500 uppercase">
              <tr>
                <th className="px-4 py-3 w-12">Rank</th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-primary-600 select-none"
                  onClick={() => toggleSort('stockName')}
                >
                  Stock{sortIndicator('stockName')}
                </th>
                <th className="px-4 py-3 hidden sm:table-cell">Sector</th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:text-primary-600 select-none"
                  onClick={() => toggleSort('convictionScore')}
                >
                  Conviction{sortIndicator('convictionScore')}
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:text-primary-600 select-none"
                  onClick={() => toggleSort('freshEntries')}
                >
                  Fresh{sortIndicator('freshEntries')}
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:text-primary-600 select-none"
                  onClick={() => toggleSort('increasedCount')}
                >
                  Increased{sortIndicator('increasedCount')}
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:text-primary-600 select-none"
                  onClick={() => toggleSort('totalFundsHolding')}
                >
                  Funds Holding{sortIndicator('totalFundsHolding')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
              {rows.slice(0, 100).map((row, idx) => (
                <tr key={row.stockSlug} className="hover:bg-surface-50 dark:hover:bg-surface-800/30">
                  <td className="px-4 py-3 text-surface-500">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-surface-900 dark:text-white">{row.stockName}</td>
                  <td className="px-4 py-3 text-surface-500 hidden sm:table-cell">{row.sector}</td>
                  <td className="px-4 py-3 text-right font-bold text-primary-600">{row.convictionScore.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right">{row.freshEntries}</td>
                  <td className="px-4 py-3 text-right">{row.increasedCount}</td>
                  <td className="px-4 py-3 text-right">{row.totalFundsHolding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-surface-400">
        Formula: (fresh×3 + increased×2 − exits×3 − decreased×1) / funds holding × 10, then percentile-normalized to 0–100.
        Not investment advice.
      </p>
    </div>
  );
}
