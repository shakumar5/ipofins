import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import {
  loadHoldingsCompareAmc,
  loadHoldingsCompareIndex,
  resetHoldingsCompareIndexCache,
  type HoldingsCompareIndex,
} from '../../lib/holdings-compare-client';
import { resolveHoldingsCompareIndex } from '../../lib/holdings-compare-bootstrap';
import { compareAmcHoldingsAsync, type FundComparison, type FundHoldings } from '../../lib/holdings-compare-diff';

interface HoldingsMeta {
  months: string[];
  amcs: Record<string, string[]>;
  amcSlugs: Record<string, string>;
  amcFundCounts: Record<string, number>;
}

interface Props {
  initialAmc?: string;
  initialMonth1?: string;
  initialMonth2?: string;
  monthQuickPick?: string[];
  pageMode?: 'hub' | 'amc';
  /** SSR/bootstrap — avoids client fetch for AMC list & months. */
  initialIndex?: HoldingsCompareIndex | null;
}

function metaFromIndex(index: HoldingsCompareIndex): HoldingsMeta {
  const amcs: Record<string, string[]> = {};
  const amcSlugs: Record<string, string> = {};
  const amcFundCounts: Record<string, number> = {};
  for (const a of index.amcs) {
    amcs[a.name] = [];
    amcSlugs[a.name] = a.slug;
    amcFundCounts[a.name] = a.fundCount;
  }
  return { months: index.months, amcs, amcSlugs, amcFundCounts };
}

const FUND_CATEGORIES = ['All', 'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap', 'Others'];
const RESULTS_PAGE = 25;

function defaultMonths(index: HoldingsCompareIndex, initialMonth1?: string, initialMonth2?: string) {
  const older = index.months.length >= 2 ? index.months[index.months.length - 2] : index.months[0] || '';
  const newer = index.months[index.months.length - 1] || index.months[0] || '';
  return {
    month1: initialMonth1 || older,
    month2: initialMonth2 || newer,
  };
}

export default function HoldingsCompare({
  initialAmc = '',
  initialMonth1,
  initialMonth2,
  monthQuickPick,
  pageMode = 'hub',
  initialIndex = null,
}: Props) {
  const resolvedIndex = useMemo(
    () => resolveHoldingsCompareIndex(initialIndex),
    [initialIndex],
  );
  const bootMonths = resolvedIndex ? defaultMonths(resolvedIndex, initialMonth1, initialMonth2) : null;
  const [meta, setMeta] = useState<HoldingsMeta | null>(() => (resolvedIndex ? metaFromIndex(resolvedIndex) : null));
  const [amcHoldings, setAmcHoldings] = useState<Record<string, FundHoldings> | null>(null);
  const [indexLoadError, setIndexLoadError] = useState<string | null>(null);
  const [amcLoadError, setAmcLoadError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(!resolvedIndex);
  const [amcLoading, setAmcLoading] = useState(false);
  const amcLoadGen = useRef(0);
  const compareGen = useRef(0);
  const [selectedAMC, setSelectedAMC] = useState(initialAmc);
  const [selectedFund, setSelectedFund] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [month1, setMonth1] = useState(bootMonths?.month1 || initialMonth1 || '');
  const [month2, setMonth2] = useState(bootMonths?.month2 || initialMonth2 || '');
  const [resultsLimit, setResultsLimit] = useState(RESULTS_PAGE);
  const [retryKey, setRetryKey] = useState(0);

  useLayoutEffect(() => {
    const boot = resolveHoldingsCompareIndex(initialIndex);
    if (!boot) return;
    setMeta((prev) => prev ?? metaFromIndex(boot));
    setMetaLoading(false);
    setIndexLoadError(null);
    const months = defaultMonths(boot, initialMonth1, initialMonth2);
    setMonth1((m) => m || months.month1);
    setMonth2((m) => m || months.month2);
  }, [initialIndex, initialMonth1, initialMonth2]);

  useEffect(() => {
    if (resolvedIndex) return;

    let cancelled = false;
    setMetaLoading(true);
    setIndexLoadError(null);
    (async () => {
      try {
        const index = await loadHoldingsCompareIndex(retryKey > 0);
        if (cancelled) return;
        if (index) {
          const amcs: Record<string, string[]> = {};
          const amcSlugs: Record<string, string> = {};
          const amcFundCounts: Record<string, number> = {};
          for (const a of index.amcs) {
            amcs[a.name] = [];
            amcSlugs[a.name] = a.slug;
            amcFundCounts[a.name] = a.fundCount;
          }
          setMeta({ months: index.months, amcs, amcSlugs, amcFundCounts });
          const older = index.months.length >= 2 ? index.months[index.months.length - 2] : index.months[0] || '';
          const newer = index.months[index.months.length - 1] || index.months[0] || '';
          setMonth1((m) => m || initialMonth1 || older);
          setMonth2((m) => m || initialMonth2 || newer);
          return;
        }
        throw new Error('Holdings index missing — run npm run export:client-data');
      } catch (err) {
        if (!cancelled) setIndexLoadError((err as Error).message || 'Failed to load data');
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [resolvedIndex, initialMonth1, initialMonth2, retryKey]);

  useEffect(() => {
    if (!meta || !selectedAMC) {
      setAmcHoldings(null);
      setAmcLoading(false);
      setAmcLoadError(null);
      return;
    }

    const slug = meta.amcSlugs[selectedAMC];
    if (!slug) {
      setAmcHoldings(null);
      setAmcLoading(false);
      setAmcLoadError(`No holdings data found for "${selectedAMC}"`);
      return;
    }

    let cancelled = false;
    const gen = ++amcLoadGen.current;
    setAmcLoading(true);
    setAmcLoadError(null);
    setCompareError(null);
    setAmcHoldings(null);
    setResultsLimit(RESULTS_PAGE);
    loadHoldingsCompareAmc(slug)
      .then((holdings) => {
        if (cancelled || gen !== amcLoadGen.current) return;
        const fundNames = Object.values(holdings).map((f) => f.name).sort();
        setAmcHoldings(holdings as Record<string, FundHoldings>);
        setMeta((prev) => (prev ? { ...prev, amcs: { ...prev.amcs, [selectedAMC]: fundNames } } : prev));
      })
      .catch((err: Error) => {
        if (!cancelled && gen === amcLoadGen.current) {
          setAmcLoadError(err.message || 'Failed to load AMC data');
        }
      })
      .finally(() => {
        if (gen === amcLoadGen.current) setAmcLoading(false);
      });
    return () => { cancelled = true; };
  }, [meta, selectedAMC, retryKey]);

  const data = meta;
  const amcList = useMemo(() => (data ? Object.keys(data.amcs).sort() : []), [data]);

  useEffect(() => { setSelectedFund('All'); }, [selectedAMC]);

  useEffect(() => {
    if (pageMode !== 'amc' || !data) return;
    const idx = data.months.indexOf(month2);
    if (idx > 0) {
      const prev = data.months[idx - 1];
      if (month1 !== prev) setMonth1(prev);
    }
  }, [month2, pageMode, data, month1]);

  const pickMonthTab = (targetMonth: string) => {
    if (!data) return;
    const idx = data.months.indexOf(targetMonth);
    if (idx <= 0) return;
    setMonth2(targetMonth);
    setMonth1(data.months[idx - 1]);
    setResultsLimit(RESULTS_PAGE);
  };

  const fundsForAMC = useMemo(() => {
    if (!data || !selectedAMC) return [];
    const loaded = data.amcs[selectedAMC] || [];
    if (loaded.length > 0) return [...loaded].sort();
    if (amcHoldings) return Object.values(amcHoldings).map((f) => f.name).sort();
    return [];
  }, [selectedAMC, data, amcHoldings]);

  const fundCountForAmc = fundsForAMC.length || (data?.amcFundCounts[selectedAMC] ?? 0);

  const [comparison, setComparison] = useState<FundComparison[] | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (!amcHoldings || !selectedAMC || !month1 || !month2 || month1 === month2) {
      setComparison(null);
      setComparing(false);
      return;
    }

    let cancelled = false;
    const gen = ++compareGen.current;
    setComparing(true);
    setCompareError(null);

    (async () => {
      try {
        const result = await compareAmcHoldingsAsync(
          amcHoldings,
          {
            month1,
            month2,
            selectedFund,
            selectedCategory,
          },
          () => cancelled || gen !== compareGen.current,
        );
        if (cancelled || gen !== compareGen.current) return;
        setComparison(result ?? []);
      } catch (err) {
        if (!cancelled && gen === compareGen.current) {
          setComparison(null);
          setCompareError((err as Error).message || 'Failed to compare holdings');
        }
      } finally {
        if (gen === compareGen.current) setComparing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [amcHoldings, selectedAMC, month1, month2, selectedFund, selectedCategory]);

  const visibleComparison = comparison?.slice(0, resultsLimit) ?? null;

  const setAmc = (value: string) => setSelectedAMC(value);
  const setFund = (value: string) => setSelectedFund(value);
  const setCategory = (value: string) => { setSelectedCategory(value); setResultsLimit(RESULTS_PAGE); };
  const setM1 = (value: string) => { setMonth1(value); setResultsLimit(RESULTS_PAGE); };
  const setM2 = (value: string) => { setMonth2(value); setResultsLimit(RESULTS_PAGE); };

  const retryLoad = () => {
    resetHoldingsCompareIndexCache();
    const boot = resolveHoldingsCompareIndex(initialIndex);
    if (boot) {
      const months = defaultMonths(boot, initialMonth1, initialMonth2);
      setMeta(metaFromIndex(boot));
      setMonth1(months.month1);
      setMonth2(months.month2);
      setMetaLoading(false);
    } else {
      setMeta(null);
      setMetaLoading(true);
    }
    setAmcHoldings(null);
    setComparison(null);
    setIndexLoadError(null);
    setAmcLoadError(null);
    setCompareError(null);
    setRetryKey((k) => k + 1);
  };

  return (
    <div>
      {indexLoadError && (
        <div className="text-center py-12 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl mb-6">
          <p className="text-sm font-medium">Could not load holdings index</p>
          <p className="text-xs mt-1 opacity-80">{indexLoadError}</p>
          <p className="text-xs mt-2 opacity-70">Data is loaded from /data/holdings-compare/ — run npm run build or npm run dev:sync if missing.</p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            Retry
          </button>
        </div>
      )}

      {!data && !indexLoadError && metaLoading && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Loading holdings data…</p>
        </div>
      )}

      {amcLoading && selectedAMC && (
        <div className="text-center py-8 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Loading {selectedAMC} portfolio data…</p>
        </div>
      )}

      {comparing && selectedAMC && amcHoldings && !amcLoading && (
        <p className="text-center text-xs text-surface-400 py-2">Updating comparison…</p>
      )}

      {amcLoadError && selectedAMC && !amcLoading && (
        <div className="text-center py-8 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl mb-6">
          <p className="text-sm font-medium">Could not load {selectedAMC} portfolio data</p>
          <p className="text-xs mt-1 opacity-80">{amcLoadError}</p>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
      <>
      {monthQuickPick && monthQuickPick.length > 0 && selectedAMC && (
        <div className="flex flex-wrap gap-2 mb-4">
          {monthQuickPick.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => pickMonthTab(m)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                m === month2
                  ? 'bg-primary-600 text-white'
                  : 'text-surface-600 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {/* Filters */}
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">Compare Holdings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* AMC */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Select AMC</label>
            <select
              value={selectedAMC}
              onChange={(e) => setAmc(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              <option value="">-- Select AMC --</option>
              {amcList.map(amc => (
                <option key={amc} value={amc}>{amc} ({data.amcs[amc]?.length || data.amcFundCounts[amc] || 0} funds)</option>
              ))}
            </select>
          </div>

          {/* Fund */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Select Fund</label>
            <select
              value={selectedFund}
              onChange={(e) => setFund(e.target.value)}
              disabled={!selectedAMC}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white disabled:opacity-50"
            >
              <option value="All">All funds</option>
              {fundsForAMC.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Fund Category */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {FUND_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Month 1 (older) */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Previous month</label>
            <select
              value={month1}
              onChange={(e) => setM1(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {data.months.slice(0, -1).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Month 2 (newer) */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">Current month</label>
            <select
              value={month2}
              onChange={(e) => setM2(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
            >
              {data.months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedAMC && !amcLoading && amcHoldings && (
          <p className="mt-3 text-xs text-surface-500 dark:text-surface-400">
            Showing changes for <strong>{fundCountForAmc}</strong> equity funds from {selectedAMC} between {month1} → {month2}
          </p>
        )}
      </div>

      {compareError && selectedAMC && !amcLoading && (
        <div className="text-center py-6 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-xl mb-6">
          <p className="text-sm font-medium">Could not compute comparison</p>
          <p className="text-xs mt-1 opacity-80">{compareError}</p>
        </div>
      )}

      {/* No AMC selected */}
      {!selectedAMC && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Select an AMC above to view holdings changes</p>
          <p className="text-xs mt-1 text-surface-400 dark:text-surface-500">Data sourced from AMC monthly portfolio disclosures</p>
        </div>
      )}

      {/* Same month selected */}
      {selectedAMC && month1 === month2 && (
        <div className="text-center py-8 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <p className="text-sm font-medium">Please select two different months to compare</p>
        </div>
      )}

      {selectedAMC && amcHoldings && !amcLoading && comparing && !visibleComparison?.length && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Computing holdings changes…</p>
        </div>
      )}

      {/* Results */}
      {selectedAMC && amcHoldings && !amcLoading && comparison && comparison.length === 0 && !comparing && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
          <div className="w-12 h-12 mx-auto bg-surface-100 dark:bg-surface-700 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-surface-400 dark:text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="text-sm font-medium">No portfolio changes detected</p>
          <p className="text-xs mt-1 text-surface-400 dark:text-surface-500">
            {selectedCategory !== 'All' 
              ? `No changes found for "${selectedCategory}" funds in this AMC between ${month1} → ${month2}. Try selecting "All" fund types.`
              : `This AMC's funds had no significant additions or removals between ${month1} → ${month2}. This is common for index funds that track a fixed benchmark.`
            }
          </p>
          <p className="text-xs mt-3 text-surface-400 dark:text-surface-500">If data is missing for one month, changes cannot be calculated. Holdings data is updated monthly.</p>
        </div>
      )}

      {visibleComparison && visibleComparison.length > 0 && !amcLoading && (
        <div className="space-y-6">
          {visibleComparison.map((fund, idx) => (
            <div key={idx} className="border border-surface-200 dark:border-surface-600 rounded-xl overflow-hidden">
              {/* Fund header */}
              <div className="px-4 py-3 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-600">
                <h3 className="font-semibold text-surface-900 dark:text-white text-sm">{fund.fundName}</h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                  {fund.additions.length} additions • {fund.removals.length} removals • {fund.increased.length} increased • {fund.decreased.length} decreased
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-200 dark:divide-surface-600">
                {/* Additions */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">New Additions</span>
                  </div>
                  {fund.additions.length === 0 ? (
                    <p className="text-xs text-surface-400 dark:text-surface-500 italic">No new stocks added</p>
                  ) : (
                    <div className="space-y-2">
                      {fund.additions.map((h, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-0.5 sm:gap-2 py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                          <div className="min-w-0">
                            <span className="font-medium text-surface-900 dark:text-white break-words">{h.name}</span>
                            {h.sector && <span className="ml-1 text-surface-400 dark:text-surface-500">• {h.sector}</span>}
                          </div>
                          <span className="text-green-600 dark:text-green-400 font-semibold whitespace-nowrap">
                            <span className="text-surface-400 dark:text-surface-500 font-normal">0%</span> → +{h.pct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Removals */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">Removed</span>
                  </div>
                  {fund.removals.length === 0 ? (
                    <p className="text-xs text-surface-400 dark:text-surface-500 italic">No stocks removed</p>
                  ) : (
                    <div className="space-y-2">
                      {fund.removals.map((h, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-0.5 sm:gap-2 py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                          <div className="min-w-0">
                            <span className="font-medium text-surface-900 dark:text-white break-words">{h.name}</span>
                            {h.sector && <span className="ml-1 text-surface-400 dark:text-surface-500">• {h.sector}</span>}
                          </div>
                          <span className="text-red-500 dark:text-red-400 font-semibold whitespace-nowrap">
                            <span className="text-surface-400 dark:text-surface-500 font-normal">{h.pct}%</span> → 0%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Increased / Decreased */}
              {(fund.increased.length > 0 || fund.decreased.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-200 dark:divide-surface-600 border-t border-surface-200 dark:border-surface-600">
                  {/* Increased */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Increased</span>
                    </div>
                    {fund.increased.length === 0 ? (
                      <p className="text-xs text-surface-400 dark:text-surface-500 italic">No holdings increased</p>
                    ) : (
                      <div className="space-y-2">
                        {fund.increased.map((h, i) => (
                          <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-0.5 sm:gap-2 py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                            <div className="min-w-0">
                              <span className="font-medium text-surface-900 dark:text-white break-words">{h.name}</span>
                              {h.sector && <span className="ml-1 text-surface-400 dark:text-surface-500">• {h.sector}</span>}
                            </div>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                              <span className="text-surface-400 dark:text-surface-500 font-normal">{h.oldPct}%</span> → {h.newPct}% <span className="text-emerald-500">(+{(h.newPct - h.oldPct).toFixed(2)}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Decreased */}
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 bg-orange-400 rounded-full"></span>
                      <span className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase">Decreased</span>
                    </div>
                    {fund.decreased.length === 0 ? (
                      <p className="text-xs text-surface-400 dark:text-surface-500 italic">No holdings decreased</p>
                    ) : (
                      <div className="space-y-2">
                        {fund.decreased.map((h, i) => (
                          <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-0.5 sm:gap-2 py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                            <div className="min-w-0">
                              <span className="font-medium text-surface-900 dark:text-white break-words">{h.name}</span>
                              {h.sector && <span className="ml-1 text-surface-400 dark:text-surface-500">• {h.sector}</span>}
                            </div>
                            <span className="text-orange-600 dark:text-orange-400 font-semibold whitespace-nowrap">
                              <span className="text-surface-400 dark:text-surface-500 font-normal">{h.oldPct}%</span> → {h.newPct}% <span className="text-orange-500">({(h.newPct - h.oldPct).toFixed(2)}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {comparison && comparison.length > resultsLimit && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setResultsLimit((n) => n + RESULTS_PAGE)}
                className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 transition-colors"
              >
                Show more ({comparison.length - resultsLimit} remaining)
              </button>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
