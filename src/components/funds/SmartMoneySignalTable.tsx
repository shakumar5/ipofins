import { useMemo, useState } from 'react';

import type { SmartMoneySignalRow, SmartMoneySignalsData } from '../../lib/smart-money-signals';

import { SIGNAL_OPTIONS } from '../../lib/smart-money-signals';



interface Props {
  data: SmartMoneySignalsData;
  month?: string;
  onMonthChange?: (month: string) => void;
  onCategoryChange?: (category: string) => void;
  loading?: boolean;
}

export default function SmartMoneySignalTable({ data, month: monthProp, onMonthChange, onCategoryChange, loading }: Props) {
  const [monthLocal, setMonthLocal] = useState(data.months[0] || '');
  const month = monthProp ?? monthLocal;

  const [category, setCategory] = useState(data.categories[0] || 'Large Cap');

  const [signalFilter, setSignalFilter] = useState<string>('All');



  const rows = useMemo(() => {

    return data.rows

      .filter((r) => {

        if (month && r.month !== month) return false;

        if (category !== 'All' && r.category !== category) return false;

        if (signalFilter !== 'All' && r.signal !== signalFilter) return false;

        return true;

      })

      .sort((a, b) => b.convictionScore - a.convictionScore);

  }, [data.rows, month, category, signalFilter]);



  return (

    <div>

      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          <div>

            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Category</label>

            <select

              value={category}

              onChange={(e) => {
                const next = e.target.value;
                setCategory(next);
                onCategoryChange?.(next);
              }}

              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"

            >

              {data.categories.map((c) => (

                <option key={c} value={c}>{c}</option>

              ))}

            </select>

          </div>

          <div>

            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Month</label>

            <select
              value={month}
              onChange={(e) => {
                const next = e.target.value;
                if (onMonthChange) onMonthChange(next);
                else setMonthLocal(next);
              }}
              disabled={loading}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {data.months.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

          </div>

          <div>

            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Signal</label>

            <select

              value={signalFilter}

              onChange={(e) => setSignalFilter(e.target.value)}

              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"

            >

              {SIGNAL_OPTIONS.map((opt) => (

                <option key={opt.value} value={opt.value}>{opt.label}</option>

              ))}

            </select>

          </div>

        </div>

        <p className="mt-3 text-xs text-surface-500 dark:text-surface-400">

          Scores are percentile-based within each fund category and month. Each factor is compared to the category leader that month.

        </p>

      </div>



      {rows.length === 0 ? (

        <p className="text-center py-12 text-surface-500 dark:text-surface-400 text-sm">

          No signals for this selection.

        </p>

      ) : (

        <div className="overflow-x-auto card p-0">

          <table className="w-full text-sm">

            <thead className="bg-surface-50 dark:bg-surface-800/50 text-left text-xs text-surface-500 uppercase">

              <tr>

                <th className="px-4 py-3 w-12">Rank</th>

                <th className="px-4 py-3">Stock</th>

                <th className="px-4 py-3 text-right">Conviction Score</th>

                <th className="px-4 py-3">Signal</th>

                <th className="px-4 py-3 text-right">Details</th>

              </tr>

            </thead>

            <tbody className="divide-y divide-surface-100 dark:divide-surface-700">

              {rows.slice(0, 100).map((row, idx) => (

                <SignalRow

                  key={`${row.stockSlug}-${row.month}-${row.category}`}

                  row={row}

                  rank={idx + 1}

                  month={month}

                  category={category}

                />

              ))}

            </tbody>

          </table>

        </div>

      )}



      <p className="mt-4 text-xs text-surface-400">

        Category: {category} · Click View for raw metrics and percentile breakdown. Not investment advice.

      </p>

    </div>

  );

}



function SignalRow({

  row,

  rank,

  month,

  category,

}: {

  row: SmartMoneySignalRow;

  rank: number;

  month: string;

  category: string;

}) {

  const detailUrl = `/mutual-funds/smart-money/signal/${row.stockSlug}?month=${encodeURIComponent(month)}&category=${encodeURIComponent(category)}`;



  return (

    <tr className="hover:bg-surface-50 dark:hover:bg-surface-800/30">

      <td className="px-4 py-3 text-surface-500">{rank}</td>

      <td className="px-4 py-3 font-medium text-surface-900 dark:text-white">{row.stockName}</td>

      <td className="px-4 py-3 text-right font-bold text-primary-600">{row.convictionScore}</td>

      <td className="px-4 py-3">

        <span className="inline-flex items-center gap-1.5">

          <span>{row.signalEmoji}</span>

          <span className="hidden sm:inline">{row.signal}</span>

        </span>

      </td>

      <td className="px-4 py-3 text-right">

        <a

          href={detailUrl}

          className="text-primary-600 hover:text-primary-700 font-medium text-sm"

        >

          View

        </a>

      </td>

    </tr>

  );

}

