import { Fragment, useMemo, useState } from 'react';
import type { SmartMoneyStockRow, SmartMoneyTrackerData } from '../../lib/data/holdings';

type ViewType = 'most_bought' | 'most_sold' | 'fresh_entries' | 'complete_exits';
type SortKey = 'fundCount' | 'weightTotal' | 'stockName';
type SortDir = 'asc' | 'desc';

interface Props {
  data: SmartMoneyTrackerData;
  onMonthChange?: (month: string) => void;
  loadingMonth?: boolean;
}

const VIEW_OPTIONS: { id: ViewType; label: string }[] = [
  { id: 'most_bought', label: 'Most Bought Stocks' },
  { id: 'most_sold', label: 'Most Sold Stocks' },
  { id: 'fresh_entries', label: 'Fresh Entries' },
  { id: 'complete_exits', label: 'Complete Exits' },
];

function filterStockRows(
  rows: SmartMoneyStockRow[],
  category: string,
  sector: string,
  view: ViewType
): SmartMoneyStockRow[] {
  return rows
    .map((row) => {
      const funds = row.funds.filter((f) => {
        if (category !== 'All' && f.fundCategory !== category) return false;
        // Most Bought/Sold use portfolio weight %, not share quantity alone
        if (view === 'most_bought' && f.pctChange <= 0) return false;
        if (view === 'most_sold' && f.pctChange >= 0) return false;
        return true;
      });
      if (funds.length === 0) return null;
      if (sector !== 'All' && row.sector !== sector) return null;

      let weightTotal = 0;
      if (view === 'most_bought') {
        weightTotal = funds.reduce((s, f) => s + f.pctChange, 0);
      } else if (view === 'most_sold') {
        weightTotal = funds.reduce((s, f) => s + (f.prevPct - f.newPct), 0);
      } else if (view === 'fresh_entries') {
        weightTotal = funds.reduce((s, f) => s + f.newPct, 0);
      } else if (view === 'complete_exits') {
        weightTotal = funds.reduce((s, f) => s + f.prevPct, 0);
      }

      return {
        ...row,
        fundCount: funds.length,
        weightTotal: Math.round(weightTotal * 100) / 100,
        funds,
      };
    })
    .filter((r): r is SmartMoneyStockRow => r !== null);
}

export default function SmartMoneyTracker({ data, onMonthChange, loadingMonth }: Props) {
  const defaultMonth = data.months[0]?.label || '';
  const [view, setView] = useState<ViewType>('most_bought');
  const [category, setCategory] = useState('All');
  const [sector, setSector] = useState('All');
  const [month, setMonth] = useState(defaultMonth);
  const [sortKey, setSortKey] = useState<SortKey>('weightTotal');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);

  const monthInfo = data.months.find((m) => m.label === month);

  const rows = useMemo(() => {
    const monthData = data.byMonth[month];
    if (!monthData) return [];

    const source =
      view === 'most_bought'
        ? monthData.increased
        : view === 'most_sold'
          ? monthData.decreased
          : view === 'fresh_entries'
            ? monthData.fresh_entry
            : monthData.complete_exit;

    const filtered = filterStockRows(source, category, sector, view);

    const key =
      view === 'most_bought' || view === 'most_sold' || view === 'fresh_entries' || view === 'complete_exits'
        ? sortKey
        : 'fundCount';
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (key === 'stockName') {
        cmp = a.stockName.localeCompare(b.stockName);
      } else if (key === 'fundCount') {
        cmp = a.fundCount - b.fundCount;
      } else {
        cmp = a.weightTotal - b.weightTotal;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [data.byMonth, month, view, category, sector, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const showWeight = true;
  const fundsColLabel =
    view === 'most_bought'
      ? 'Funds Buying'
      : view === 'most_sold'
        ? 'Funds Selling'
        : view === 'fresh_entries'
          ? 'New Funds Added'
          : 'Funds Exited';

  const weightColLabel =
    view === 'most_bought'
      ? 'Weight Added'
      : view === 'most_sold'
        ? 'Weight Reduced'
        : view === 'fresh_entries'
          ? 'Weight Added'
          : 'Weight Exited';

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  }

  return (
    <div>
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">View</label>
            <select
              value={view}
              onChange={(e) => {
                setView(e.target.value as ViewType);
                setExpanded(null);
                setSortKey(
                  e.target.value === 'most_bought' ||
                  e.target.value === 'most_sold' ||
                  e.target.value === 'fresh_entries' ||
                  e.target.value === 'complete_exits'
                    ? 'weightTotal'
                    : 'fundCount'
                );
                setSortDir('desc');
              }}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {VIEW_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setExpanded(null); }}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {data.categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Sector</label>
            <select
              value={sector}
              onChange={(e) => { setSector(e.target.value); setExpanded(null); }}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {data.sectors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Month</label>
            <select
              value={month}
              onChange={(e) => {
                const next = e.target.value;
                setMonth(next);
                setExpanded(null);
                onMonthChange?.(next);
              }}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {data.months.map((m) => (
                <option key={m.label} value={m.label}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {monthInfo?.prevLabel && (
          <p className="mt-3 text-xs text-surface-500 dark:text-surface-400">
            Comparing <strong>{monthInfo.prevLabel}</strong> → <strong>{monthInfo.label}</strong>
            {' · '}Equity funds only · Debt instruments excluded
            {data.dataSource === 'computed' && (
              <span className="text-amber-600 dark:text-amber-400"> · Computed from raw holdings (run db:compute-signals for cached data)</span>
            )}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-center py-12 text-surface-500 dark:text-surface-400 text-sm">
          No data for this selection. Try a different month, category, or view.
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
                  onClick={() => toggleSort('fundCount')}
                >
                  {fundsColLabel}{sortIndicator('fundCount')}
                </th>
                {showWeight && (
                  <th
                    className="px-4 py-3 text-right cursor-pointer hover:text-primary-600 select-none"
                    onClick={() => toggleSort('weightTotal')}
                  >
                    {weightColLabel}{sortIndicator('weightTotal')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
              {rows.slice(0, 50).map((row, idx) => {
                const rowKey = `${row.stockSlug}-${idx}`;
                const isOpen = expanded === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <tr
                      className="hover:bg-surface-50 dark:hover:bg-surface-800/30 cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : rowKey)}
                    >
                      <td className="px-4 py-3 text-surface-500">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-surface-900 dark:text-white">
                        <span className="inline-flex items-center gap-1.5">
                          <svg
                            className={`w-3.5 h-3.5 text-surface-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                          {row.stockName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-surface-500 hidden sm:table-cell">{row.sector}</td>
                      <td className="px-4 py-3 text-right font-semibold text-primary-600">{row.fundCount}</td>
                      {showWeight && (
                        <td className={`px-4 py-3 text-right font-semibold ${
                          view === 'most_sold' || view === 'complete_exits' ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {row.weightTotal.toFixed(2)}%
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr className="bg-surface-50 dark:bg-surface-800/40">
                        <td colSpan={showWeight ? 5 : 4} className="px-4 py-3">
                          <div className="text-xs text-surface-500 mb-2 font-medium">Funds ({row.funds.length})</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                            {row.funds.map((f) => (
                              <div
                                key={f.fundName}
                                className="flex justify-between gap-2 text-xs px-2 py-1.5 rounded bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700"
                              >
                                <span className="text-surface-700 dark:text-surface-300 truncate" title={f.fundName}>
                                  {f.fundName}
                                </span>
                                <span className="text-surface-500 flex-shrink-0">
                                  {view === 'fresh_entries' && `${f.newPct.toFixed(2)}%`}
                                  {view === 'complete_exits' && `${f.prevPct.toFixed(2)}%`}
                                  {(view === 'most_bought' || view === 'most_sold') && (
                                    <>{f.prevPct.toFixed(2)}% → {f.newPct.toFixed(2)}%</>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-surface-400">
        Fresh Entries show new positions (weight added to portfolio). Complete Exits show stocks fully sold out (weight removed).
        Most Bought / Sold show weight changes on existing positions only.
        Data from official AMC monthly portfolio disclosures. Not investment advice.
      </p>
    </div>
  );
}
