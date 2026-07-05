import { Fragment, useCallback, useEffect, useMemo, useState, useTransition, useDeferredValue } from 'react';
import type { SmartMoneyStockRow, SmartMoneyTrackerData } from '../../lib/data/holdings';
import { applyClientPageMeta } from '../../lib/apply-client-page-meta';
import {
  computeTrackerStockWeights,
  filterTrackerSectorOptions,
  isValidEquitySector,
  WEIGHT_CHANGE_THRESHOLD,
} from '../../lib/holdings-utils';
import {
  getSmartMoneyTrackerPageMeta,
  parseTrackerFromPathname,
  trackerPathFromViewMonth,
  TRACKER_VIEW_OPTIONS,
  type TrackerViewType,
} from '../../lib/smart-money-tracker-meta';
import {
  DEFAULT_TRACKER_LIST_FILTERS,
  parseTrackerListFiltersFromPathname,
  parseTrackerListFiltersFromSearch,
  trackerPathWithListFilters,
  type TrackerListFilters,
} from '../../lib/smart-money-tracker-filters-meta';
import FilterSelect from './FilterSelect';

type ViewType = TrackerViewType;
type SortKey = 'fundCount' | 'weightAvg' | 'weightTotal' | 'stockName';
type SortDir = 'asc' | 'desc';

const TRACKER_INITIAL_ROWS = 20;
const TRACKER_ROWS_PAGE = 20;

interface Props {
  data: SmartMoneyTrackerData;
  onMonthChange?: (month: string) => void;
  loadingMonth?: boolean;
  initialView?: ViewType;
  initialMonth?: string;
  initialCategory?: string;
  initialSector?: string;
}

function sortKeyForView(_next: ViewType): SortKey {
  return 'fundCount';
}

function changeTypeForView(view: ViewType): 'increased' | 'decreased' | 'fresh_entry' | 'complete_exit' {
  if (view === 'most_bought') return 'increased';
  if (view === 'most_sold') return 'decreased';
  if (view === 'fresh_entries') return 'fresh_entry';
  return 'complete_exit';
}

function rowWeightAvg(row: SmartMoneyStockRow, view: ViewType): number {
  if (row.weightAvg != null) return row.weightAvg;
  const isBoughtSold = view === 'most_bought' || view === 'most_sold';
  if (isBoughtSold && row.fundCount > 0) return Math.round((row.weightTotal / row.fundCount) * 100) / 100;
  return row.weightTotal;
}

function rowWeightTotal(row: SmartMoneyStockRow, view: ViewType): number {
  if (view === 'fresh_entries') {
    if (row.weightAvg != null && Math.abs(row.weightTotal - row.weightAvg) > 0.001) return row.weightTotal;
    const sum = row.funds.reduce((s, f) => s + f.newPct, 0);
    return Math.round(sum * 100) / 100;
  }
  if (view === 'complete_exits') {
    if (row.weightAvg != null && Math.abs(row.weightTotal - row.weightAvg) > 0.001) return row.weightTotal;
    const sum = row.funds.reduce((s, f) => s + f.prevPct, 0);
    return Math.round(sum * 100) / 100;
  }
  return row.weightTotal;
}

function filterStockRows(
  rows: SmartMoneyStockRow[],
  category: string,
  sector: string,
  view: ViewType,
): SmartMoneyStockRow[] {
  const changeType = changeTypeForView(view);

  return rows
    .map((row) => {
      const funds = row.funds.filter((f) => {
        if (category !== 'All' && f.fundCategory !== category) return false;
        if (view === 'most_bought' && f.pctChange <= WEIGHT_CHANGE_THRESHOLD) return false;
        if (view === 'most_sold' && f.pctChange >= -WEIGHT_CHANGE_THRESHOLD) return false;
        return true;
      });
      if (funds.length === 0) return null;
      if (sector !== 'All' && row.sector !== sector) return null;

      const weights = computeTrackerStockWeights(funds, changeType);
      return {
        ...row,
        fundCount: funds.length,
        weightAvg: weights.weightAvg,
        weightTotal: weights.weightTotal,
        funds,
      };
    })
    .filter((r): r is SmartMoneyStockRow => r !== null);
}

function resolveInitialMonth(data: SmartMoneyTrackerData, preferred?: string): string {
  if (preferred && data.months.some((m) => m.label === preferred)) return preferred;
  return data.months[0]?.label || '';
}

export default function SmartMoneyTracker({
  data,
  onMonthChange,
  loadingMonth,
  initialView,
  initialMonth,
  initialCategory,
  initialSector,
}: Props) {
  const defaultMonth = resolveInitialMonth(data, initialMonth);
  const [view, setView] = useState<ViewType>(initialView || 'most_bought');
  const [category, setCategory] = useState(initialCategory || DEFAULT_TRACKER_LIST_FILTERS.category);
  const [sector, setSector] = useState(initialSector || DEFAULT_TRACKER_LIST_FILTERS.sector);
  const [month, setMonth] = useState(defaultMonth);
  const [sortKey, setSortKey] = useState<SortKey>(() => sortKeyForView(initialView || 'most_bought'));
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(TRACKER_INITIAL_ROWS);
  const [isPending, startTransition] = useTransition();

  const deferredView = useDeferredValue(view);
  const deferredCategory = useDeferredValue(category);
  const deferredSector = useDeferredValue(sector);
  const deferredMonth = useDeferredValue(month);
  const filtersPending = isPending
    || deferredView !== view
    || deferredCategory !== category
    || deferredSector !== sector
    || deferredMonth !== month;

  const syncTrackerUrl = useCallback((nextView: ViewType, monthLabel: string, replace = true) => {
    if (typeof window === 'undefined' || !monthLabel) return;
    const path = trackerPathWithListFilters(trackerPathFromViewMonth(nextView, monthLabel), {
      category,
      sector,
    });
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== path) {
      if (replace) window.history.replaceState({ smTracker: true, view: nextView, month: monthLabel }, '', path);
      else window.history.pushState({ smTracker: true, view: nextView, month: monthLabel }, '', path);
    }
    applyClientPageMeta(getSmartMoneyTrackerPageMeta(nextView, monthLabel));
  }, [category, sector]);

  const syncTrackerFiltersUrl = useCallback(
    (next: Partial<TrackerListFilters>) => {
      if (typeof window === 'undefined') return;
      const path = trackerPathWithListFilters(trackerPathFromViewMonth(view, month), {
        category: next.category ?? category,
        sector: next.sector ?? sector,
      });
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== path) {
        window.history.pushState({ smTracker: true, view, month }, '', path);
      }
    },
    [category, month, sector, view],
  );

  const applyTrackerFilters = useCallback((next: TrackerListFilters) => {
    setCategory(next.category);
    setSector(next.sector);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromUrl = () => {
      const parsed = parseTrackerFromPathname(window.location.pathname);
      if (!parsed) return;
      setView(parsed.view);
      setSortKey(sortKeyForView(parsed.view));
      setSortDir('desc');
      setExpanded(null);
      applyTrackerFilters(
        parseTrackerListFiltersFromPathname(
          window.location.pathname,
          window.location.search,
          data.categories,
        ),
      );
      if (data.months.some((m) => m.label === parsed.monthLabel)) {
        setMonth(parsed.monthLabel);
        if (!data.byMonth[parsed.monthLabel]) onMonthChange?.(parsed.monthLabel);
      }
      applyClientPageMeta(getSmartMoneyTrackerPageMeta(parsed.view, parsed.monthLabel));
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('pageshow', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('pageshow', syncFromUrl);
    };
  }, [applyTrackerFilters, data.categories, data.months, data.byMonth, onMonthChange]);

  const applyView = (next: ViewType) => {
    startTransition(() => {
      setView(next);
      setExpanded(null);
      setVisibleLimit(TRACKER_INITIAL_ROWS);
      setSortKey(sortKeyForView(next));
      setSortDir('desc');
    });
    syncTrackerUrl(next, month);
  };

  const sectorOptions = useMemo(() => filterTrackerSectorOptions(data.sectors), [data.sectors]);

  const viewCounts = useMemo(() => {
    const monthData = data.byMonth[deferredMonth];
    if (!monthData) return {} as Partial<Record<ViewType, number>>;
    const counts: Partial<Record<ViewType, number>> = {};
    for (const opt of TRACKER_VIEW_OPTIONS) {
      const source =
        opt.id === 'most_bought'
          ? monthData.increased
          : opt.id === 'most_sold'
            ? monthData.decreased
            : opt.id === 'fresh_entries'
              ? monthData.fresh_entry
              : monthData.complete_exit;
      counts[opt.id] = filterStockRows(source, deferredCategory, deferredSector, opt.id).length;
    }
    return counts;
  }, [data.byMonth, deferredMonth, deferredCategory, deferredSector]);

  useEffect(() => {
    if (sector !== 'All' && !sectorOptions.includes(sector)) setSector('All');
  }, [sector, sectorOptions]);

  const monthInfo = data.months.find((m) => m.label === month);

  const rows = useMemo(() => {
    const monthData = data.byMonth[deferredMonth];
    if (!monthData) return [];

    const source =
      deferredView === 'most_bought'
        ? monthData.increased
        : deferredView === 'most_sold'
          ? monthData.decreased
          : deferredView === 'fresh_entries'
            ? monthData.fresh_entry
            : monthData.complete_exit;

    const filtered = filterStockRows(source, deferredCategory, deferredSector, deferredView);
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'stockName') {
        cmp = a.stockName.localeCompare(b.stockName);
      } else if (sortKey === 'fundCount') {
        cmp = a.fundCount - b.fundCount;
      } else if (sortKey === 'weightAvg') {
        cmp = rowWeightAvg(a, deferredView) - rowWeightAvg(b, deferredView);
      } else {
        cmp = rowWeightTotal(a, deferredView) - rowWeightTotal(b, deferredView);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [data.byMonth, deferredMonth, deferredView, deferredCategory, deferredSector, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    startTransition(() => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    });
  }

  const fundsColLabel =
    view === 'most_bought'
      ? 'Funds Buying'
      : view === 'most_sold'
        ? 'Funds Selling'
        : view === 'fresh_entries'
          ? 'New Funds Added'
          : 'Funds Exited';

  const avgWeightColLabel =
    view === 'most_bought'
      ? 'Avg Weight Added'
      : view === 'most_sold'
        ? 'Avg Weight Reduced'
        : view === 'fresh_entries'
          ? 'Avg Entry Weight'
          : 'Avg Exit Weight';

  const totalWeightColLabel =
    view === 'most_bought'
      ? 'Total Weight Added'
      : view === 'most_sold'
        ? 'Total Weight Reduced'
        : view === 'fresh_entries'
          ? 'Total Entry Weight'
          : 'Total Exit Weight';

  const totalWeightTooltip =
    view === 'most_bought'
      ? 'Sum of portfolio weight increases across all funds'
      : view === 'most_sold'
        ? 'Sum of portfolio weight reductions across all funds'
        : view === 'fresh_entries'
          ? 'Sum of portfolio weights at entry across all funds that added the stock'
          : 'Sum of portfolio weights before exit across all funds that sold out';

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  }

  const colSpan = 6;

  const displayRows = rows.slice(0, visibleLimit);
  const remainingRowCount = Math.max(0, rows.length - visibleLimit);
  const mobileSortKeys: { key: SortKey; label: string }[] = [
    { key: 'fundCount', label: 'Funds' },
    { key: 'weightAvg', label: 'Avg Wt' },
    { key: 'weightTotal', label: 'Total Wt' },
    { key: 'stockName', label: 'Name' },
  ];

  return (
    <div>
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <fieldset className="border-0 p-0 m-0 min-w-0">
          <legend className="sr-only">Smart Money tracker filters</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect
            id="sm-tracker-view"
            name="sm-tracker-view"
            label="View"
            value={view}
            onChange={(e) => applyView(e.target.value as ViewType)}
          >
            {TRACKER_VIEW_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}{viewCounts[o.id] != null ? ` (${viewCounts[o.id]})` : ''}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="sm-tracker-category"
            name="sm-tracker-category"
            label="Category"
            value={category}
            onChange={(e) => {
              const next = e.target.value;
              startTransition(() => { setCategory(next); setExpanded(null); setVisibleLimit(TRACKER_INITIAL_ROWS); });
              syncTrackerFiltersUrl({ category: next });
            }}
          >
            {data.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="sm-tracker-sector"
            name="sm-tracker-sector"
            label="Sector"
            value={sector}
            onChange={(e) => {
              const next = e.target.value;
              startTransition(() => { setSector(next); setExpanded(null); setVisibleLimit(TRACKER_INITIAL_ROWS); });
              syncTrackerFiltersUrl({ sector: next });
            }}
          >
            {sectorOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="sm-tracker-month"
            name="sm-tracker-month"
            label="Month"
            value={month}
            onChange={(e) => {
              const next = e.target.value;
              startTransition(() => {
                setMonth(next);
                setExpanded(null);
                setVisibleLimit(TRACKER_INITIAL_ROWS);
              });
              onMonthChange?.(next);
              syncTrackerUrl(view, next);
            }}
          >
            {data.months.map((m) => (
              <option key={m.label} value={m.label}>{m.label}</option>
            ))}
          </FilterSelect>
        </div>
        </fieldset>

        {monthInfo?.prevLabel ? (
          <p className="mt-3 text-xs text-surface-500 dark:text-surface-400 min-h-[2.75rem]">
            Comparing <strong>{monthInfo.prevLabel}</strong> → <strong>{monthInfo.label}</strong>
            {' · '}Ranked by number of funds · Weight based on portfolio % of NAV
            {' · '}Equity funds only · Debt instruments excluded
            {data.dataSource === 'computed' && (
              <span className="text-amber-600 dark:text-amber-400"> · Computed from raw holdings (run db:compute-signals for cached data)</span>
            )}
          </p>
        ) : (
          <p className="mt-3 text-xs text-surface-500 dark:text-surface-400 min-h-[2.75rem] invisible" aria-hidden="true">
            Comparing month data
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-center py-12 text-surface-500 dark:text-surface-400 text-sm">
          {loadingMonth ? 'Loading month data…' : 'No data for this selection. Try a different month, category, or view.'}
        </p>
      ) : (
        <div className={`relative ${filtersPending ? 'opacity-60 pointer-events-none' : ''}`}>
          {filtersPending && (
            <div className="absolute inset-0 z-10 flex items-start justify-center pt-6" aria-hidden="true">
              <span className="text-xs font-medium text-surface-500 dark:text-surface-400 bg-white/90 dark:bg-surface-900/90 px-3 py-1.5 rounded-full border border-surface-200 dark:border-surface-600">
                Updating…
              </span>
            </div>
          )}
        <>
          <div className="md:hidden flex flex-wrap gap-2 mb-3">
            <span className="text-xs text-surface-500 self-center">Sort:</span>
            {mobileSortKeys.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                className={`text-xs px-2 py-1 rounded ${
                  sortKey === key
                    ? 'bg-primary-100 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-medium'
                    : 'text-surface-500 hover:text-primary-600'
                }`}
              >
                {label}
                {sortKey === key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
              </button>
            ))}
          </div>

          <div className="md:hidden space-y-2">
            {displayRows.map((row, idx) => {
              const rowKey = `${row.stockSlug}-${idx}`;
              const isOpen = expanded === rowKey;
              const avgWeight = rowWeightAvg(row, view);
              const totalWeight = rowWeightTotal(row, view);
              const weightTone =
                view === 'most_sold' || view === 'complete_exits' ? 'return-negative' : 'return-positive';

              return (
                <div
                  key={rowKey}
                  className="card p-0 overflow-hidden border border-surface-200 dark:border-surface-700"
                >
                  <button
                    type="button"
                    className="w-full text-left p-3"
                    onClick={() => setExpanded(isOpen ? null : rowKey)}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-surface-600 dark:text-surface-400 tabular-nums">#{idx + 1}</p>
                        <p className="text-sm font-semibold text-surface-900 dark:text-white">{row.stockName}</p>
                        <p className="text-xs text-surface-500 mt-0.5 truncate">{row.sector}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-primary-600 tabular-nums">{row.fundCount}</p>
                        <p className="text-xs text-surface-600 dark:text-surface-400">{fundsColLabel}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                      <div>
                        <p className="text-surface-500">{avgWeightColLabel}</p>
                        <p className={`font-semibold tabular-nums ${weightTone}`}>{avgWeight.toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-surface-500">{totalWeightColLabel}</p>
                        <p className="font-medium tabular-nums text-surface-700 dark:text-surface-300">
                          {totalWeight.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-0 border-t border-surface-100 dark:border-surface-700">
                      <div className="text-xs text-surface-500 mb-2 font-medium pt-2">Funds ({row.funds.length})</div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {row.funds.map((f) => (
                          <div
                            key={f.fundName}
                            className="flex justify-between gap-2 text-xs px-2 py-1.5 rounded bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700"
                          >
                            <span className="text-surface-700 dark:text-surface-300 min-w-0">{f.fundName}</span>
                            <span className="text-surface-500 flex-shrink-0 tabular-nums">
                              {view === 'fresh_entries' && `${f.newPct.toFixed(2)}%`}
                              {view === 'complete_exits' && `${f.prevPct.toFixed(2)}%`}
                              {(view === 'most_bought' || view === 'most_sold') && (
                                <>{f.prevPct.toFixed(2)}% → {f.newPct.toFixed(2)}%</>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
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
                <th className="px-4 py-3 w-12">Rank</th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-primary-600 select-none col-sticky"
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
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:text-primary-600 select-none"
                  onClick={() => toggleSort('weightAvg')}
                >
                  {avgWeightColLabel}{sortIndicator('weightAvg')}
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:text-primary-600 select-none"
                  onClick={() => toggleSort('weightTotal')}
                  title={totalWeightTooltip}
                >
                  {totalWeightColLabel}{sortIndicator('weightTotal')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
              {displayRows.map((row, idx) => {
                const rowKey = `${row.stockSlug}-${idx}`;
                const isOpen = expanded === rowKey;
                const avgWeight = rowWeightAvg(row, view);
                const totalWeight = rowWeightTotal(row, view);
                const weightTone =
                  view === 'most_sold' || view === 'complete_exits' ? 'return-negative' : 'return-positive';

                return (
                  <Fragment key={rowKey}>
                    <tr
                      className="hover:bg-surface-50 dark:hover:bg-surface-800/30 cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : rowKey)}
                    >
                      <td className="px-4 py-3 text-surface-500">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-surface-900 dark:text-white col-sticky">
                        <span className="inline-flex items-center gap-1.5">
                          <svg
                            className={`w-3.5 h-3.5 text-surface-500 dark:text-surface-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                          {row.stockName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-surface-500 hidden sm:table-cell">{row.sector}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary-600 text-base">{row.fundCount}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${weightTone}`}>
                        {avgWeight.toFixed(2)}%
                      </td>
                      <td
                        className="px-4 py-3 text-right text-surface-600 dark:text-surface-400"
                        title={totalWeightTooltip}
                      >
                        {totalWeight.toFixed(2)}%
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-surface-50 dark:bg-surface-800/40">
                        <td colSpan={colSpan} className="px-4 py-3">
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

          {remainingRowCount > 0 && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((n) => n + TRACKER_ROWS_PAGE)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Show more ({remainingRowCount} remaining)
              </button>
            </div>
          )}
        </>
        </div>
      )}

      <p className="mt-4 text-xs text-surface-600 dark:text-surface-400">
        All views rank by fund count. Avg weight is per-fund portfolio % of NAV; total weight is the sum across all funds.
        Most Bought / Sold use weight change on existing positions. Fresh Entries / Exits use weight at entry or before exit.
        Data from official AMC monthly portfolio disclosures. Not investment advice.
      </p>
    </div>
  );
}
