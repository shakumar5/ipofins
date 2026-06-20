import { useState, useMemo, useEffect, useRef } from 'react';
import {
  loadHoldingsCompareAmc,
  loadHoldingsCompareIndex,
  resetHoldingsCompareIndexCache,
  type HoldingsCompareIndex,
} from '../../lib/holdings-compare-client';
import { resolveHoldingsCompareIndex } from '../../lib/holdings-compare-bootstrap';
import { compareAmcHoldings, type FundHoldings } from '../../lib/holdings-compare-diff';
import FilterSelect from './FilterSelect';

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
    if (!selectedAMC || !amcHoldings) return [];
    return Object.values(amcHoldings).map((f) => f.name).sort();
  }, [selectedAMC, amcHoldings]);

  const fundCountForAmc = fundsForAMC.length || (data?.amcFundCounts[selectedAMC] ?? 0);

  const comparison = useMemo(() => {
    if (!amcHoldings || !selectedAMC || !month1 || !month2 || month1 === month2) return null;
    return compareAmcHoldings(amcHoldings, {
      month1,
      month2,
      selectedFund,
      selectedCategory,
    }) ?? [];
  }, [amcHoldings, selectedAMC, month1, month2, selectedFund, selectedCategory]);

  const visibleComparison = comparison?.slice(0, resultsLimit) ?? null;

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
            onChange={(e) => setSelectedAMC(e.target.value)}
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
            onChange={(e) => setSelectedFund(e.target.value)}
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
            onChange={(e) => { setSelectedCategory(e.target.value); setResultsLimit(RESULTS_PAGE); }}
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
            onChange={(e) => { setMonth1(e.target.value); setResultsLimit(RESULTS_PAGE); }}
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
            onChange={(e) => { setMonth2(e.target.value); setResultsLimit(RESULTS_PAGE); }}
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

      {selectedAMC && amcHoldings && !amcLoading && comparison && comparison.length === 0 && (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/50 rounded-xl" data-holdings-empty>
          <p className="text-sm font-medium">No portfolio changes detected</p>
          <p className="text-xs mt-1 text-surface-400">Between {month1} → {month2} for {selectedAMC}.</p>
        </div>
      )}

      {visibleComparison && visibleComparison.length > 0 && !amcLoading && (
        <div className="space-y-6">
          {visibleComparison.map((fund, idx) => (
            <div key={idx} className="border border-surface-200 dark:border-surface-600 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-600">
                <h3 className="font-semibold text-surface-900 dark:text-white text-sm">{fund.fundName}</h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                  {fund.additions.length} additions • {fund.removals.length} removals • {fund.increased.length} increased • {fund.decreased.length} decreased
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-200 dark:divide-surface-600">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">New Additions</span>
                  </div>
                  {fund.additions.length === 0 ? (
                    <p className="text-xs text-surface-400 italic">No new stocks added</p>
                  ) : (
                    <div className="space-y-2">
                      {fund.additions.map((h, i) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                          <span className="font-medium text-surface-900 dark:text-white">{h.name}</span>
                          <span className="text-green-600 font-semibold">+{h.pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                    <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">Removed</span>
                  </div>
                  {fund.removals.length === 0 ? (
                    <p className="text-xs text-surface-400 italic">No stocks removed</p>
                  ) : (
                    <div className="space-y-2">
                      {fund.removals.map((h, i) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-surface-100 dark:border-surface-700 last:border-0">
                          <span className="font-medium text-surface-900 dark:text-white">{h.name}</span>
                          <span className="text-red-500 font-semibold">{h.pct}% → 0%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
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
