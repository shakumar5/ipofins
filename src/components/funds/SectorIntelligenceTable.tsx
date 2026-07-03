import { Fragment, useDeferredValue, useMemo, useState, useTransition, type ReactNode } from 'react';

import type { SmartMoneyMonthData } from '../../lib/data/holdings';
import type { SectorIntelligenceData, SectorIntelligenceRow } from '../../lib/sector-intelligence';
import { sectorIntelligencePath } from '../../lib/sector-intelligence-meta';
import { SIGNAL_OPTIONS } from '../../lib/smart-money-signals';
import SectorStockMovesPanel from './SectorStockMovesPanel';

interface Props {
  data: SectorIntelligenceData;
  monthMoves?: SmartMoneyMonthData | null;
}

type SortKey = 'conviction' | 'aum' | 'weight' | 'trend' | 'funds';

const SORT_LABELS: Record<SortKey, string> = {
  conviction: 'Conviction',
  aum: 'AUM Change',
  weight: 'Weight Δ',
  trend: 'Trend',
  funds: 'Funds',
};

const MOBILE_SORT_KEYS: SortKey[] = ['conviction', 'aum', 'weight', 'trend', 'funds'];

const INITIAL_ROWS = 20;
const ROWS_PAGE = 20;

const SEARCH_INPUT_CLASS =
  'w-full pl-7 pr-7 py-1.5 text-xs font-normal normal-case tracking-normal border border-surface-200 dark:border-surface-600 rounded-md bg-white dark:bg-surface-900 text-surface-900 dark:text-white placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500';

function formatCr(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L Cr`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k Cr`;
  return `₹${value.toFixed(0)} Cr`;
}

function aumChangeColor(pct: number): string {
  if (pct >= 5) return 'text-green-600 dark:text-green-400';
  if (pct > 0) return 'text-green-500';
  if (pct <= -5) return 'text-red-600 dark:text-red-400';
  if (pct < 0) return 'text-orange-500';
  return 'text-surface-500';
}

function trendColor(direction: string): string {
  if (direction === 'up') return 'text-green-600 dark:text-green-400';
  if (direction === 'down') return 'text-red-500 dark:text-red-400';
  return 'text-surface-500';
}

function trendSortValue(row: SectorIntelligenceRow): number {
  if (row.trendDirection === 'up') return row.trendMonths;
  if (row.trendDirection === 'down') return -row.trendMonths;
  return 0;
}

function sortRows(rows: SectorIntelligenceRow[], sortBy: SortKey, sortDir: 'asc' | 'desc'): SectorIntelligenceRow[] {
  const dir = sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'conviction':
        cmp = a.convictionScore - b.convictionScore;
        break;
      case 'aum':
        cmp = a.aumChangePct - b.aumChangePct;
        break;
      case 'weight':
        cmp = a.weightChangePpt - b.weightChangePpt;
        break;
      case 'trend':
        cmp = trendSortValue(a) - trendSortValue(b);
        break;
      case 'funds':
        cmp = a.fundCount - b.fundCount;
        break;
    }
    if (cmp === 0) cmp = a.sector.localeCompare(b.sector);
    return cmp * dir;
  });
}

function ColumnSearch({
  id,
  value,
  onChange,
  placeholder,
  className = '',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={SEARCH_INPUT_CLASS}
      />
      <svg
        className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10 18a8 8 0 100-16 8 8 0 000 16z" />
      </svg>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 text-sm leading-none p-0.5"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function SectorIntelligenceTable({ data, monthMoves = null }: Props) {
  const rows = data.rows;
  const [sectorSearch, setSectorSearch] = useState('');
  const [signalSearch, setSignalSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('conviction');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_ROWS);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const deferredSectorSearch = useDeferredValue(sectorSearch);
  const deferredSignalSearch = useDeferredValue(signalSearch);

  const handleSort = (col: SortKey) => {
    startTransition(() => {
      if (sortBy === col) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
      else {
        setSortBy(col);
        setSortDir('desc');
      }
      setVisibleLimit(INITIAL_ROWS);
    });
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="ml-0.5 inline-block normal-case">
      {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );

  const SortHeader = ({
    col,
    children,
    align = 'left',
    title,
  }: {
    col: SortKey;
    children: ReactNode;
    align?: 'left' | 'right' | 'center';
    title?: string;
  }) => (
    <button
      type="button"
      onClick={() => handleSort(col)}
      title={title}
      className={`hover:text-primary-600 cursor-pointer uppercase ${
        align === 'right' ? 'w-full text-right' : align === 'center' ? 'w-full text-center' : 'text-left'
      }`}
    >
      {children}
      <SortIcon col={col} />
    </button>
  );

  const normalizedSectorSearch = deferredSectorSearch.trim().toLowerCase();
  const normalizedSignalSearch = deferredSignalSearch.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (normalizedSectorSearch && !row.sector.toLowerCase().includes(normalizedSectorSearch)) {
        return false;
      }
      if (normalizedSignalSearch && !row.signal.toLowerCase().includes(normalizedSignalSearch)) {
        return false;
      }
      return true;
    });
    return sortRows(filtered, sortBy, sortDir);
  }, [rows, normalizedSectorSearch, normalizedSignalSearch, sortBy, sortDir]);

  const displayRows = useMemo(
    () => filteredRows.slice(0, visibleLimit),
    [filteredRows, visibleLimit],
  );

  const remainingRowCount = Math.max(0, filteredRows.length - visibleLimit);

  const topAccumulating = useMemo(() => rows.filter((r) => r.convictionScore >= 75).slice(0, 3), [rows]);
  const topDistributing = useMemo(
    () => [...rows].sort((a, b) => a.convictionScore - b.convictionScore).slice(0, 3),
    [rows],
  );

  const hasActiveFilter = Boolean(normalizedSectorSearch || normalizedSignalSearch);

  const toggleSector = (sector: string) => {
    if (!monthMoves) return;
    setExpandedSector((prev) => (prev === sector ? null : sector));
  };

  if (!data.currentMonth || !rows.length) {
    return (
      <p className="text-center py-12 text-surface-500 dark:text-surface-400 text-sm">
        Sector intelligence requires at least two months of holdings data. Run the monthly pipeline after adding new disclosures.
      </p>
    );
  }

  return (
    <div>
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-surface-900 dark:text-white">Comparison period</p>
            <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
              {data.previousMonth} → {data.currentMonth}
            </p>
          </div>
          <div className="text-sm text-surface-500 dark:text-surface-400 space-y-0.5">
            <p><span className="font-medium text-surface-700 dark:text-surface-300">{data.fundCount}</span> equity funds aggregated</p>
            <p>Total equity exposure: <span className="font-medium text-surface-700 dark:text-surface-300">{formatCr(data.totalEquityAum)}</span></p>
            <p className="text-xs">Sectors below {data.minSectorPct}% of total equity are hidden</p>
          </div>
        </div>
      </div>

      {(topAccumulating.length > 0 || topDistributing.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {topAccumulating.length > 0 && (
            <div className="card p-4 border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-2">Top accumulation</p>
              <ul className="space-y-1 text-sm">
                {topAccumulating.map((r) => (
                  <li key={r.sector} className="flex justify-between gap-2">
                    <a
                      href={sectorIntelligencePath(r.sectorSlug)}
                      className="font-medium text-surface-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
                    >
                      {r.sector}
                    </a>
                    <span className="text-green-600 tabular-nums">{r.signalEmoji} +{r.aumChangePct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {topDistributing.length > 0 && (
            <div className="card p-4 border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 mb-2">Top distribution</p>
              <ul className="space-y-1 text-sm">
                {topDistributing.map((r) => (
                  <li key={r.sector} className="flex justify-between gap-2">
                    <a
                      href={sectorIntelligencePath(r.sectorSlug)}
                      className="font-medium text-surface-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
                    >
                      {r.sector}
                    </a>
                    <span className="text-red-500 tabular-nums">{r.signalEmoji} {r.aumChangePct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-surface-500 mb-3 tabular-nums">
        Showing {Math.min(visibleLimit, filteredRows.length)} of {filteredRows.length} sectors
        {filteredRows.length !== rows.length ? ` (${rows.length} total)` : ''}
        {hasActiveFilter ? ' (filtered)' : ''}
        {' • '}
        Sorted by {SORT_LABELS[sortBy]} ({sortDir === 'desc' ? 'high to low' : 'low to high'})
        {monthMoves ? ' • Click a sector to see top stock moves' : ''}
      </p>

      {/* Mobile sort */}
      <div className="md:hidden flex flex-wrap gap-2 mb-3">
        <span className="text-xs text-surface-500 self-center">Sort:</span>
        {MOBILE_SORT_KEYS.map((col) => (
          <button
            key={col}
            type="button"
            onClick={() => handleSort(col)}
            className={`text-xs px-2 py-1 rounded ${
              sortBy === col
                ? 'bg-primary-100 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-medium'
                : 'text-surface-500 hover:text-primary-600'
            }`}
          >
            {SORT_LABELS[col]}
            {sortBy === col && (sortDir === 'desc' ? ' ↓' : ' ↑')}
          </button>
        ))}
      </div>

      {/* Mobile filters — side by side like All Funds search row */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label htmlFor="sector-search-mobile" className="text-xs font-medium text-surface-600 dark:text-surface-400 block mb-1">
            Sector
          </label>
          <ColumnSearch
            id="sector-search-mobile"
            value={sectorSearch}
            onChange={(v) => {
              setSectorSearch(v);
              setVisibleLimit(INITIAL_ROWS);
            }}
            placeholder="Search sector…"
          />
        </div>
        <div>
          <label htmlFor="signal-search-mobile" className="text-xs font-medium text-surface-600 dark:text-surface-400 block mb-1">
            Signal
          </label>
          <ColumnSearch
            id="signal-search-mobile"
            value={signalSearch}
            onChange={(v) => {
              setSignalSearch(v);
              setVisibleLimit(INITIAL_ROWS);
            }}
            placeholder="Search signal…"
          />
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <p className="text-center py-12 text-surface-500 text-sm card">
          No sectors match your search.
          {normalizedSectorSearch && ` Sector: “${sectorSearch.trim()}”.`}
          {normalizedSignalSearch && ` Signal: “${signalSearch.trim()}”.`}
        </p>
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {displayRows.map((row, index) => {
              const isExpanded = expandedSector === row.sector;
              return (
              <div key={row.sector} className="card p-3 border border-surface-200 dark:border-surface-700">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => toggleSector(row.sector)}
                  disabled={!monthMoves}
                  aria-expanded={isExpanded}
                >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-surface-400 tabular-nums">#{index + 1}</p>
                    <p className="text-sm font-semibold text-surface-900 dark:text-white flex items-center gap-1.5">
                      <a
                        href={sectorIntelligencePath(row.sectorSlug)}
                        className="hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.sector}
                      </a>
                      {monthMoves && (
                        <span className="text-surface-400 text-xs" aria-hidden>{isExpanded ? '▲' : '▼'}</span>
                      )}
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {row.currentPct}% of equity · {row.fundsIncreasing}↑ / {row.fundsDecreasing}↓ funds
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-surface-900 dark:text-white tabular-nums">{row.convictionScore}</p>
                    <p className="text-[10px] text-surface-400">Conviction</p>
                  </div>
                </div>
                </button>
                <p className="mt-2 text-xs font-medium text-surface-700 dark:text-surface-300">
                  {row.signalEmoji} {row.signal}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-center">
                  <div className="rounded-lg bg-surface-50 dark:bg-surface-800/60 p-2">
                    <p className="text-surface-500">AUM</p>
                    <p className={`font-bold tabular-nums ${aumChangeColor(row.aumChangePct)}`}>
                      {row.aumChangePct >= 0 ? '+' : ''}{row.aumChangePct}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-50 dark:bg-surface-800/60 p-2">
                    <p className="text-surface-500">Weight Δ</p>
                    <p className={`font-bold tabular-nums ${aumChangeColor(row.weightChangePpt)}`}>
                      {row.weightChangePpt >= 0 ? '+' : ''}{row.weightChangePpt}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-50 dark:bg-surface-800/60 p-2">
                    <p className="text-surface-500">Trend</p>
                    <p className={`font-bold tabular-nums ${trendColor(row.trendDirection)}`}>{row.trendLabel}</p>
                  </div>
                </div>
                <p className="text-[10px] text-surface-400 mt-2 text-center tabular-nums">{row.fundCount} funds</p>
                {isExpanded && monthMoves && (
                  <div className="mt-3 pt-3 border-t border-surface-100 dark:border-surface-700">
                    <SectorStockMovesPanel sector={row.sector} monthMoves={monthMoves} />
                  </div>
                )}
              </div>
            );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto card p-0 data-table-premium">
          <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-800/50 text-left text-xs text-surface-500 uppercase">
            <tr>
              <th className="px-2 py-3 w-8" aria-label="Expand" />
              <th className="px-4 py-3 w-12">Rank</th>
              <th className="px-4 py-3 min-w-[180px]">
                <span className="block mb-1.5">Sector</span>
                <label htmlFor="sector-search-desktop" className="sr-only">Search sector</label>
                <ColumnSearch
                  id="sector-search-desktop"
                  value={sectorSearch}
                  onChange={(v) => {
              setSectorSearch(v);
              setVisibleLimit(INITIAL_ROWS);
            }}
                  placeholder="Search sector…"
                  className="hidden md:block"
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader col="conviction">Conviction</SortHeader>
              </th>
              <th className="px-4 py-3 min-w-[160px]">
                <span className="block mb-1.5">Signal</span>
                <label htmlFor="signal-search-desktop" className="sr-only">Search signal</label>
                <ColumnSearch
                  id="signal-search-desktop"
                  value={signalSearch}
                  onChange={(v) => {
              setSignalSearch(v);
              setVisibleLimit(INITIAL_ROWS);
            }}
                  placeholder="Search signal…"
                  className="hidden md:block"
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  col="aum"
                  align="right"
                  title="Month-on-month % change in total ₹ holdings value in this sector"
                >
                  AUM Change
                </SortHeader>
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader
                  col="weight"
                  align="right"
                  title="Change in this sector's share of total mutual fund equity (percentage points)"
                >
                  Weight Δ
                </SortHeader>
              </th>
              <th className="px-4 py-3 text-center">
                <SortHeader col="trend" align="center">Trend</SortHeader>
              </th>
              <th className="px-4 py-3 text-right hidden lg:table-cell">
                <SortHeader col="funds" align="right">Funds</SortHeader>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
              {displayRows.map((row, index) => {
                const isExpanded = expandedSector === row.sector;
                return (
                  <Fragment key={row.sector}>
                    <tr
                      key={row.sector}
                      className={`hover:bg-surface-50 dark:hover:bg-surface-800/40 ${monthMoves ? 'cursor-pointer' : ''}`}
                      onClick={() => toggleSector(row.sector)}
                      aria-expanded={isExpanded}
                    >
                      <td className="px-2 py-3 text-center text-surface-400">
                        {monthMoves ? (isExpanded ? '▲' : '▼') : ''}
                      </td>
                      <td className="px-4 py-3 text-surface-400 tabular-nums">{index + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-surface-900 dark:text-white">
                          <a
                            href={sectorIntelligencePath(row.sectorSlug)}
                            className="hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.sector}
                          </a>
                        </p>
                        <p className="text-xs text-surface-400 mt-0.5">
                          {row.currentPct}% of equity · {row.fundsIncreasing}↑ / {row.fundsDecreasing}↓ funds
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold tabular-nums text-surface-900 dark:text-white">{row.convictionScore}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium">
                          <span>{row.signalEmoji}</span>
                          <span className="text-surface-700 dark:text-surface-300">{row.signal}</span>
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold tabular-nums ${aumChangeColor(row.aumChangePct)}`}>
                        {row.aumChangePct >= 0 ? '+' : ''}{row.aumChangePct}%
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-xs ${aumChangeColor(row.weightChangePpt)}`}>
                        {row.weightChangePpt >= 0 ? '+' : ''}{row.weightChangePpt} ppt
                      </td>
                      <td className={`px-4 py-3 text-center font-semibold tabular-nums ${trendColor(row.trendDirection)}`}>
                        {row.trendLabel}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-surface-500 hidden lg:table-cell tabular-nums">
                        {row.fundCount}
                      </td>
                    </tr>
                    {isExpanded && monthMoves && (
                      <tr key={`${row.sector}-detail`} className="bg-surface-50/80 dark:bg-surface-800/30">
                        <td colSpan={9} className="px-4 py-4">
                          <p className="text-xs font-semibold text-surface-600 dark:text-surface-300 mb-2">
                            Top stock moves in {row.sector} ({monthMoves.month})
                          </p>
                          <SectorStockMovesPanel sector={row.sector} monthMoves={monthMoves} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>

          {remainingRowCount > 0 && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((n) => n + ROWS_PAGE)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Show more ({remainingRowCount} remaining)
              </button>
            </div>
          )}
        </>
      )}

      <p className="mt-3 text-[11px] text-surface-400">
        Signal hints: {SIGNAL_OPTIONS.filter((o) => o.value !== 'All').map((o) => o.label).join(' · ')}
      </p>

      <div className="mt-4 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700 text-xs text-surface-500 dark:text-surface-400 space-y-3">
        <div>
          <p className="font-semibold text-surface-700 dark:text-surface-300 mb-1">AUM Change — what it measures</p>
          <p>
            We add up the disclosed market value (₹) of every stock holding in a sector across all funds with portfolio data,
            then compare {data.previousMonth} vs {data.currentMonth}. <strong className="text-surface-700 dark:text-surface-300">AUM Change</strong> is
            the month-on-month percentage change in that total. For example, +12% means funds collectively held 12% more ₹ value
            in that sector than the previous month. This reflects <em>both</em> active buying/selling and price movement — a sector
            can rise on strong stock prices even with little new buying.
          </p>
        </div>
        <div>
          <p className="font-semibold text-surface-700 dark:text-surface-300 mb-1">Weight Δ — what it measures</p>
          <p>
            <strong className="text-surface-700 dark:text-surface-300">Weight</strong> is the sector&apos;s share of total mutual fund equity:
            sector ₹ total ÷ all sectors&apos; ₹ total × 100. <strong className="text-surface-700 dark:text-surface-300">Weight Δ</strong> is
            how much that share moved in <em>percentage points</em> (ppt), not percent. If Banks went from 11.2% → 12.0% of total equity,
            Weight Δ is <strong className="text-surface-700 dark:text-surface-300">+0.8 ppt</strong>. Unlike AUM Change, weight strips out the
            size of the overall pie — it answers &ldquo;are fund managers tilting allocation toward this sector?&rdquo; A sector can gain weight
            (+ppt) even when its absolute AUM fell, if other sectors fell more.
          </p>
        </div>
        <p>
          <strong className="text-surface-700 dark:text-surface-300">Conviction Score</strong> blends sector AUM momentum (75%) with fund-breadth — how many funds increased exposure (25%).
          Same signal bands as <a href="/mutual-funds/smart-money/smart-money-signal" className="text-primary-600 hover:underline">Smart Money Signal</a>.
          Rankings by stock: <a href="/mutual-funds/smart-money" className="text-primary-600 hover:underline">Smart Money Tracker</a>.
        </p>
        <p>
          <strong className="text-surface-700 dark:text-surface-300">Trend</strong> counts consecutive months of rising sector weight (↑ 3M = three straight months of allocation increase).
          See individual stock moves in <a href="/mutual-funds/mutual-fund-holdings-changes" className="text-primary-600 hover:underline">Holdings Changes</a>.
        </p>
      </div>
    </div>
  );
}
