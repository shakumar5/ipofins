import { useMemo, useState } from 'react';
import type { SmartMoneySignalRow, SmartMoneySignalsData } from '../../lib/smart-money-signals';
import { SIGNAL_OPTIONS } from '../../lib/smart-money-signals';

interface Props {
  data: SmartMoneySignalsData;
  month?: string;
  onMonthChange?: (month: string) => void;
  loading?: boolean;
}

function Stars({ count }: { count: number }) {
  return (
    <span className="text-amber-500 tracking-wider" aria-label={`${count} out of 5 stars`}>
      {'★'.repeat(count)}{'☆'.repeat(5 - count)}
    </span>
  );
}

function StockDetail({ row }: { row: SmartMoneySignalRow }) {
  const detailUrl = `/mutual-funds/smart-money/signal/${row.stockSlug}?month=${encodeURIComponent(row.month)}&category=${encodeURIComponent(row.category)}`;

  return (
    <div className="card p-5 md:p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-surface-900 dark:text-white">{row.stockName}</h2>
        <p className="text-sm text-surface-500 mt-1">{row.sector} · {row.category} · {row.month}</p>
      </div>

      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">Smart Money</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-surface-50 dark:bg-surface-800/60 p-4 text-center">
            <p className="text-xs text-surface-500 mb-1">Conviction Score</p>
            <p className="text-3xl font-bold text-primary-600 tabular-nums">{row.convictionScore}</p>
            <p className="text-xs text-surface-400">/ 100</p>
          </div>
          <div className="rounded-xl bg-surface-50 dark:bg-surface-800/60 p-4 text-center">
            <p className="text-xs text-surface-500 mb-1">Smart Money Signal</p>
            <p className="text-lg font-semibold text-surface-900 dark:text-white">
              {row.signalEmoji} {row.signal}
            </p>
          </div>
          <div className="rounded-xl bg-surface-50 dark:bg-surface-800/60 p-4 text-center">
            <p className="text-xs text-surface-500 mb-1">Institutional Confidence</p>
            <Stars count={row.confidenceStars} />
            <p className="text-sm font-medium text-surface-900 dark:text-white mt-1">{row.institutionalConfidence}</p>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">Mutual Fund Activity</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Metric label="Funds Holding" value={row.fundsHolding} />
          <Metric label="Funds Increased" value={row.increasedCount} positive />
          <Metric label="Funds Reduced" value={row.decreasedCount} negative />
          <Metric label="Fresh Entries" value={row.freshEntries} positive />
          <Metric label="Complete Exits" value={row.completeExits} negative />
          <Metric label="Net Buying" value={row.netBuying} signed />
        </div>
      </section>

      {row.topFundHolders.length > 0 && (
        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">Top Fund Holders</h3>
          <ul className="space-y-2">
            {row.topFundHolders.map((fund) => (
              <li
                key={fund}
                className="flex items-center gap-2 text-sm text-surface-800 dark:text-surface-200 bg-surface-50 dark:bg-surface-800/50 rounded-lg px-3 py-2"
              >
                <span className="text-primary-500">●</span>
                {fund}
              </li>
            ))}
          </ul>
          <p className="text-xs text-surface-400 mt-2">Ranked by portfolio weight (% of NAV) in {row.category} funds for {row.month}</p>
        </section>
      )}

      <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed border-t border-surface-200 dark:border-surface-700 pt-4">
        {row.interpretation}
      </p>

      <a
        href={detailUrl}
        className="inline-flex mt-4 text-sm font-medium text-primary-600 hover:underline"
      >
        View full score breakdown →
      </a>
    </div>
  );
}

function Metric({
  label,
  value,
  positive,
  negative,
  signed,
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
  signed?: boolean;
}) {
  let color = 'text-surface-900 dark:text-white';
  if (signed && value > 0) color = 'text-green-600 dark:text-green-400';
  if (signed && value < 0) color = 'text-red-500';
  if (positive && value > 0) color = 'text-green-600 dark:text-green-400';
  if (negative && value > 0) color = 'text-orange-500';

  return (
    <div className="rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2.5">
      <p className="text-[11px] text-surface-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>
        {signed && value > 0 ? '+' : ''}{value}
      </p>
    </div>
  );
}

export default function StockSignalTab({ data, month: monthProp, onMonthChange, loading }: Props) {
  const [monthLocal, setMonthLocal] = useState(data.months[0] || '');
  const month = monthProp ?? monthLocal;
  const [category, setCategory] = useState('All');
  const [signalFilter, setSignalFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.rows
      .filter((r) => {
        if (month && r.month !== month) return false;
        if (category !== 'All' && r.category !== category) return false;
        if (signalFilter !== 'All' && r.signal !== signalFilter) return false;
        if (q && !r.stockName.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.convictionScore - a.convictionScore);
  }, [data.rows, month, category, signalFilter, search]);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selected = useMemo(() => {
    if (!rows.length) return null;
    const match = selectedSlug ? rows.find((r) => r.stockSlug === selectedSlug) : null;
    return match || rows[0];
  }, [rows, selectedSlug]);

  return (
    <div>
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSelectedSlug(null);
              }}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              <option value="All">All</option>
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
                setSelectedSlug(null);
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
          <div>
            <label htmlFor="stock-signal-search" className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Search stock</label>
            <input
              id="stock-signal-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. HDFC Bank"
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-center py-12 text-surface-500 text-sm">No stocks match this filter.</p>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6">
          <div className="card p-0 max-h-[640px] overflow-y-auto">
            <p className="sticky top-0 z-10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-surface-500 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
              {rows.length} stocks
            </p>
            <ul className="divide-y divide-surface-100 dark:divide-surface-700">
              {rows.map((row) => {
                const active = selected?.stockSlug === row.stockSlug;
                return (
                  <li key={`${row.stockSlug}-${row.month}-${row.category}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedSlug(row.stockSlug)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        active
                          ? 'bg-primary-50 dark:bg-primary-950/30 border-l-2 border-primary-600'
                          : 'hover:bg-surface-50 dark:hover:bg-surface-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">{row.stockName}</p>
                          <p className="text-xs text-surface-500 mt-0.5">{row.sector}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-primary-600 tabular-nums">{row.convictionScore}</p>
                          <p className="text-[10px] text-surface-400">{row.signalEmoji}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {selected && <StockDetail row={selected} />}
        </div>
      )}
    </div>
  );
}
