import { useState, useMemo, useEffect, useRef, useTransition, useDeferredValue, useCallback } from 'react';
import { withErrorBoundary } from '../withErrorBoundary';
import {
  loadHoldingsCompareAmc,
  loadHoldingsCompareIndex,
  resetHoldingsCompareIndexCache,
  type HoldingsCompareIndex,
} from '../../lib/holdings-compare-client';
import { resolveHoldingsCompareIndex } from '../../lib/holdings-compare-bootstrap';
import { compareAmcHoldingsAsync, type FundComparison, type FundHoldings } from '../../lib/holdings-compare-diff';
import FilterSelect from './FilterSelect';
import FundComparisonCard from './FundComparisonCard';
import { applyClientPageMeta } from '../../lib/apply-client-page-meta';
import {
  buildFundSlugMap,
  getHoldingsComparePageMeta,
  holdingsChangesPath,
  parseHoldingsChangesLocation,
} from '../../lib/holdings-compare-meta';

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
const RESULTS_PAGE = 10;

function compareCacheKey(month1: string, month2: string, fund: string, category: string): string {
  return `${month1}|${month2}|${fund}|${category}`;
}

function defaultMonths(index: HoldingsCompareIndex, initialMonth1?: string, initialMonth2?: string) {
  const older = index.months.length >= 2 ? index.months[index.months.length - 2] : index.months[0] || '';
  const newer = index.months[index.months.length - 1] || index.months[0] || '';
  return {
    month1: initialMonth1 || older,
    month2: initialMonth2 || newer,
  };
}

function HoldingsCompareInner({
  initialAmc = '',
  initialMonth1,
  initialMonth2,
  monthQuickPick,
  pageMode = 'hub',
  initialIndex = null,
}: Props) {
  const bootIndex = useMemo(() => {
    const fromProp = initialIndex?.amcs?.length && initialIndex.months?.length ? initialIndex : null;
    const fromDom = typeof document !== 'undefined' ? resolveHoldingsCompareIndex(null) : null;
    return fromProp ?? fromDom;
  }, [initialIndex]);

  const bootMonths = bootIndex ? defaultMonths(bootIndex, initialMonth1, initialMonth2) : null;

  const [meta, setMeta] = useState<HoldingsMeta | null>(() => (bootIndex ? metaFromIndex(bootIndex) : null));
  const amcSlugsRef = useRef<Record<string, string>>(bootIndex ? metaFromIndex(bootIndex).amcSlugs : {});
  const monthsRef = useRef<string[]>(bootIndex?.months ?? []);
  const [amcHoldings, setAmcHoldings] = useState<Record<string, FundHoldings> | null>(null);
  const [indexLoadError, setIndexLoadError] = useState<string | null>(null);
  const [amcLoadError, setAmcLoadError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(!bootIndex);
  const [amcLoading, setAmcLoading] = useState(false);
  const amcRequestId = useRef(0);

  const [selectedAMC, setSelectedAMC] = useState(initialAmc);
  const [selectedFund, setSelectedFund] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [month1, setMonth1] = useState(bootMonths?.month1 || initialMonth1 || '');
  const [month2, setMonth2] = useState(bootMonths?.month2 || initialMonth2 || '');
  const [resultsLimit, setResultsLimit] = useState(RESULTS_PAGE);
  const [retryKey, setRetryKey] = useState(0);
  const [comparison, setComparison] = useState<FundComparison[] | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const compareRequestId = useRef(0);
  const compareCacheRef = useRef<Map<string, FundComparison[]>>(new Map());
  const [isPending, startTransition] = useTransition();
  const urlSyncReady = useRef(false);
  const applyingFromUrl = useRef(false);

  const amcNameBySlug = useMemo(() => {
    if (!meta) return {};
    return Object.fromEntries(
      Object.entries(meta.amcSlugs).map(([name, slug]) => [slug, name]),
    );
  }, [meta]);

  const fundSlugMap = useMemo(() => buildFundSlugMap(amcHoldings), [amcHoldings]);

  const syncPageMeta = useCallback((path: string) => {
    const amcSlug = selectedAMC ? amcSlugsRef.current[selectedAMC] : '';
    applyClientPageMeta(
      getHoldingsComparePageMeta({
        amcName: selectedAMC || undefined,
        amcSlug,
        month1,
        month2,
        fundName: selectedFund,
        path,
      }),
    );
  }, [selectedAMC, month1, month2, selectedFund]);

  const syncUrl = useCallback(() => {
    if (typeof window === 'undefined' || !urlSyncReady.current || applyingFromUrl.current) return;
    const amcSlug = selectedAMC ? amcSlugsRef.current[selectedAMC] : '';
    const path = holdingsChangesPath({
      amcSlug,
      month2: selectedAMC ? month2 : undefined,
      month1: selectedAMC ? month1 : undefined,
      fund: selectedFund,
      category: selectedCategory,
      allMonths: monthsRef.current,
    });
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== path) {
      window.history.replaceState(null, '', path);
    }
    syncPageMeta(path);
  }, [selectedAMC, month1, month2, selectedFund, selectedCategory, syncPageMeta]);

  const applyUrlState = useCallback((search?: string) => {
    if (typeof window === 'undefined' || !meta) return;
    applyingFromUrl.current = true;
    const parsed = parseHoldingsChangesLocation(
      window.location.pathname,
      search ?? window.location.search,
      amcNameBySlug,
      fundSlugMap,
      FUND_CATEGORIES,
    );
    if (parsed.amcName) setSelectedAMC(parsed.amcName);
    else if (!parsed.amcSlug) setSelectedAMC('');
    if (parsed.month2) setMonth2(parsed.month2);
    if (parsed.month1) setMonth1(parsed.month1);
    if (parsed.fundName) setSelectedFund(parsed.fundName);
    else if (parsed.fundSlug) setSelectedFund('All');
    if (parsed.category) setSelectedCategory(parsed.category);
    queueMicrotask(() => { applyingFromUrl.current = false; });
  }, [meta, amcNameBySlug, fundSlugMap]);

  const deferredFund = useDeferredValue(selectedFund);
  const deferredCategory = useDeferredValue(selectedCategory);
  const deferredMonth1 = useDeferredValue(month1);
  const deferredMonth2 = useDeferredValue(month2);
  const filtersPending = isPending
    || deferredFund !== selectedFund
    || deferredCategory !== selectedCategory
    || deferredMonth1 !== month1
    || deferredMonth2 !== month2;

  useEffect(() => {
    if (!bootIndex) return;
    const nextMeta = metaFromIndex(bootIndex);
    amcSlugsRef.current = nextMeta.amcSlugs;
    monthsRef.current = nextMeta.months;
    setMeta((prev) => prev ?? nextMeta);
    setMetaLoading(false);
    setIndexLoadError(null);
    const months = defaultMonths(bootIndex, initialMonth1, initialMonth2);
    setMonth1((m) => m || months.month1);
    setMonth2((m) => m || months.month2);
  }, [bootIndex, initialMonth1, initialMonth2]);

  useEffect(() => {
    if (bootIndex) return;

    let cancelled = false;
    setMetaLoading(true);
    setIndexLoadError(null);
    (async () => {
      try {
        const index = await loadHoldingsCompareIndex(retryKey > 0);
        if (cancelled) return;
        if (!index) throw new Error('Holdings index missing — run npm run export:client-data');
        setMeta(metaFromIndex(index));
        amcSlugsRef.current = index.amcs.reduce<Record<string, string>>((acc, a) => {
          acc[a.name] = a.slug;
          return acc;
        }, {});
        monthsRef.current = index.months;
        const months = defaultMonths(index, initialMonth1, initialMonth2);
        setMonth1((m) => m || months.month1);
        setMonth2((m) => m || months.month2);
      } catch (err) {
        if (!cancelled) setIndexLoadError((err as Error).message || 'Failed to load data');
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bootIndex, initialMonth1, initialMonth2, retryKey]);

  useEffect(() => {
    if (!selectedAMC) {
      setAmcHoldings(null);
      setAmcLoading(false);
      setAmcLoadError(null);
      return;
    }

    const slug = amcSlugsRef.current[selectedAMC];
    if (!slug) {
      setAmcHoldings(null);
      setAmcLoading(false);
      setAmcLoadError(`No holdings data found for "${selectedAMC}"`);
      return;
    }

    const requestId = ++amcRequestId.current;
    setAmcLoading(true);
    setAmcLoadError(null);
    setAmcHoldings(null);
    setResultsLimit(RESULTS_PAGE);

    loadHoldingsCompareAmc(slug)
      .then((holdings) => {
        if (requestId !== amcRequestId.current) return;
        compareCacheRef.current.clear();
        setAmcHoldings(holdings as Record<string, FundHoldings>);
      })
      .catch((err: Error) => {
        if (requestId !== amcRequestId.current) return;
        setAmcLoadError(err.message || 'Failed to load AMC data');
        setAmcHoldings(null);
      })
      .finally(() => {
        if (requestId === amcRequestId.current) setAmcLoading(false);
      });
  }, [selectedAMC, retryKey]);

  const data = meta;
  const amcList = useMemo(() => (data ? Object.keys(data.amcs).sort() : []), [data]);

  useEffect(() => {
    if (!meta || urlSyncReady.current) return;
    applyUrlState();
    urlSyncReady.current = true;
    syncUrl();
  }, [meta, applyUrlState, syncUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      applyUrlState();
      setResultsLimit(RESULTS_PAGE);
      compareCacheRef.current.clear();
      setComparison(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyUrlState]);

  useEffect(() => {
    if (!meta || !urlSyncReady.current) return;
    syncUrl();
  }, [selectedAMC, month1, month2, selectedFund, selectedCategory, meta, syncUrl]);

  useEffect(() => {
    if (!amcHoldings || !urlSyncReady.current || applyingFromUrl.current) return;
    const params = new URLSearchParams(window.location.search);
    const fundSlug = params.get('fund');
    if (!fundSlug) return;
    const name = fundSlugMap.get(fundSlug);
    if (name && name !== selectedFund) {
      applyingFromUrl.current = true;
      setSelectedFund(name);
      queueMicrotask(() => { applyingFromUrl.current = false; });
    }
  }, [amcHoldings, fundSlugMap, selectedFund]);

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
    if (!selectedAMC || !amcHoldings) return [];
    return Object.values(amcHoldings).map((f) => f.name).sort();
  }, [selectedAMC, amcHoldings]);

  const fundCountForAmc = fundsForAMC.length || (data?.amcFundCounts[selectedAMC] ?? 0);

  useEffect(() => {
    if (!amcHoldings || !selectedAMC || !deferredMonth1 || !deferredMonth2 || deferredMonth1 === deferredMonth2) {
      setComparison(null);
      setCompareLoading(false);
      return;
    }

    const cacheKey = compareCacheKey(deferredMonth1, deferredMonth2, deferredFund, deferredCategory);
    const cached = compareCacheRef.current.get(cacheKey);
    if (cached) {
      setComparison(cached);
      setCompareLoading(false);
      return;
    }

    const requestId = ++compareRequestId.current;
    setCompareLoading(true);

    compareAmcHoldingsAsync(
      amcHoldings,
      { month1: deferredMonth1, month2: deferredMonth2, selectedFund: deferredFund, selectedCategory: deferredCategory },
      () => requestId !== compareRequestId.current,
    )
      .then((result) => {
        if (requestId !== compareRequestId.current) return;
        const next = result ?? [];
        compareCacheRef.current.set(cacheKey, next);
        setComparison(next);
      })
      .catch(() => {
        if (requestId !== compareRequestId.current) return;
        setComparison([]);
      })
      .finally(() => {
        if (requestId === compareRequestId.current) setCompareLoading(false);
      });
  }, [amcHoldings, selectedAMC, deferredMonth1, deferredMonth2, deferredFund, deferredCategory]);

  const visibleComparison = useMemo(
    () => comparison?.slice(0, resultsLimit) ?? null,
    [comparison, resultsLimit],
  );

  const onFundChange = useCallback((value: string) => {
    startTransition(() => {
      setSelectedFund(value);
      setResultsLimit(RESULTS_PAGE);
    });
  }, []);

  const onCategoryChange = useCallback((value: string) => {
    startTransition(() => {
      setSelectedCategory(value);
      setResultsLimit(RESULTS_PAGE);
    });
  }, []);

  const onMonth1Change = useCallback((value: string) => {
    startTransition(() => {
      setMonth1(value);
      setResultsLimit(RESULTS_PAGE);
    });
  }, []);

  const onMonth2Change = useCallback((value: string) => {
    startTransition(() => {
      setMonth2(value);
      setResultsLimit(RESULTS_PAGE);
    });
  }, []);

  const retryLoad = () => {
    resetHoldingsCompareIndexCache();
    if (bootIndex) {
      const months = defaultMonths(bootIndex, initialMonth1, initialMonth2);
      const nextMeta = metaFromIndex(bootIndex);
      amcSlugsRef.current = nextMeta.amcSlugs;
      monthsRef.current = nextMeta.months;
      setMeta(nextMeta);
      setMonth1(months.month1);
      setMonth2(months.month2);
      setMetaLoading(false);
    } else {
      setMeta(null);
      setMetaLoading(true);
    }
    setAmcHoldings(null);
    setComparison(null);
    compareCacheRef.current.clear();
    setIndexLoadError(null);
    setAmcLoadError(null);
    setRetryKey((k) => k + 1);
  };

  return (
    <div data-holdings-compare-root>
      {indexLoadError && (
        <div className="text-center py-12 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl mb-6">
          <p className="text-sm font-medium">Could not load holdings index</p>
          <p className="text-xs mt-1 opacity-80">{indexLoadError}</p>
          <button type="button" onClick={retryLoad} className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700">
            Retry
          </button>
        </div>
      )}

      {!data && !indexLoadError && metaLoading && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Loading holdings data…</p>
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

      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">Compare Holdings</h2>
        <fieldset className="border-0 p-0 m-0 min-w-0">
          <legend className="sr-only">Holdings compare filters</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <FilterSelect
            id="holdings-compare-amc"
            name="holdings-compare-amc"
            label="Select AMC"
            value={selectedAMC}
            onChange={(e) => {
              const next = e.target.value;
              setSelectedAMC(next);
              startTransition(() => setSelectedFund('All'));
              setResultsLimit(RESULTS_PAGE);
            }}
          >
            <option value="">-- Select AMC --</option>
            {amcList.map((amc) => (
              <option key={amc} value={amc}>{amc} ({data.amcs[amc]?.length || data.amcFundCounts[amc] || 0} funds)</option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="holdings-compare-fund"
            name="holdings-compare-fund"
            label="Select Fund"
            value={selectedFund}
            onChange={(e) => onFundChange(e.target.value)}
            disabled={!selectedAMC || amcLoading}
            className="disabled:opacity-50"
          >
            <option value="All">All funds</option>
            {fundsForAMC.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="holdings-compare-category"
            name="holdings-compare-category"
            label="Category"
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            {FUND_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="holdings-compare-month-prev"
            name="holdings-compare-month-prev"
            label="Previous month"
            value={month1}
            onChange={(e) => onMonth1Change(e.target.value)}
          >
            {data.months.slice(0, -1).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="holdings-compare-month-current"
            name="holdings-compare-month-current"
            label="Current month"
            value={month2}
            onChange={(e) => onMonth2Change(e.target.value)}
          >
            {data.months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </FilterSelect>
        </div>
        </fieldset>

        {selectedAMC && amcLoading && (
          <p className="mt-3 text-xs text-primary-600 dark:text-primary-400">Loading {selectedAMC} portfolio data…</p>
        )}

        {selectedAMC && !amcLoading && amcHoldings && (
          <p className="mt-3 text-xs text-surface-500 dark:text-surface-400">
            Showing changes for <strong>{fundCountForAmc}</strong> equity funds from {selectedAMC} between {month1} → {month2}
          </p>
        )}
      </div>

      {amcLoadError && selectedAMC && !amcLoading && (
        <div className="text-center py-8 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl mb-6">
          <p className="text-sm font-medium">Could not load {selectedAMC} portfolio data</p>
          <p className="text-xs mt-1 opacity-80">{amcLoadError}</p>
          <button type="button" onClick={() => setRetryKey((k) => k + 1)} className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700">
            Retry
          </button>
        </div>
      )}

      {!selectedAMC && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Select an AMC above to view holdings changes</p>
        </div>
      )}

      {selectedAMC && month1 === month2 && (
        <div className="text-center py-8 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <p className="text-sm font-medium">Please select two different months to compare</p>
        </div>
      )}

      {selectedAMC && !amcLoading && !amcHoldings && !amcLoadError && (
        <div className="text-center py-8 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Waiting for {selectedAMC} portfolio data…</p>
        </div>
      )}

      {selectedAMC && amcHoldings && !amcLoading && (compareLoading || filtersPending) && !comparison && (
        <div className="text-center py-8 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Computing portfolio changes for {selectedAMC}…</p>
        </div>
      )}

      {selectedAMC && amcHoldings && !amcLoading && !compareLoading && !filtersPending && comparison && comparison.length === 0 && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/50 rounded-xl" data-holdings-empty>
          <p className="text-sm font-medium">No portfolio changes detected</p>
          <p className="text-xs mt-1 text-surface-400">Between {month1} → {month2} for {selectedAMC}.</p>
        </div>
      )}

      {visibleComparison && visibleComparison.length > 0 && !amcLoading && (
        <div className={`space-y-6 relative ${compareLoading || filtersPending ? 'opacity-60 pointer-events-none' : ''}`}>
          {(compareLoading || filtersPending) && (
            <div className="absolute inset-0 z-10 flex items-start justify-center pt-8" aria-hidden="true">
              <span className="text-xs font-medium text-surface-500 dark:text-surface-400 bg-white/90 dark:bg-surface-900/90 px-3 py-1.5 rounded-full border border-surface-200 dark:border-surface-600">
                Updating…
              </span>
            </div>
          )}
          {visibleComparison.map((fund) => (
            <FundComparisonCard key={fund.fundName} fund={fund} />
          ))}
          {comparison && comparison.length > resultsLimit && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setResultsLimit((n) => n + RESULTS_PAGE)}
                className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
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

export default withErrorBoundary(HoldingsCompareInner, 'Holdings Compare');
