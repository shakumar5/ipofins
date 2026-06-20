import { useState, useEffect, useCallback, useTransition, useRef, lazy, Suspense } from 'react';

const SmartMoneyTracker = lazy(() => import('./SmartMoneyTracker'));
const SmartMoneySignalTable = lazy(() => import('./SmartMoneySignalTable'));
const SectorIntelligenceTable = lazy(() => import('./SectorIntelligenceTable'));
const StockSignalTab = lazy(() => import('./StockSignalTab'));

import type { SmartMoneyTrackerData } from '../../lib/data/holdings';
import type { SmartMoneySignalsData } from '../../lib/smart-money-signals';
import type { SectorIntelligenceData } from '../../lib/sector-intelligence';
import { applyClientPageMeta } from '../../lib/apply-client-page-meta';
import {
  getSmartMoneyPageMeta,
  SMART_MONEY_TAB_HASH,
  type SmartMoneyTab,
} from '../../lib/smart-money-meta';

import {
  loadSignalsIndex,
  loadSignalsMonth,
  loadTrackerIndex,
  loadTrackerMonth,
} from '../../lib/smart-money-client';
import { fetchJsonCached } from '../../lib/client-data';

const SECTOR_URL = '/data/sector-intelligence.json';
const BASE_PATH = '/mutual-funds/smart-money';

type Tab = SmartMoneyTab;

function tabFromHash(): Tab | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (hash === '#sector-intelligence') return 'sectors';
  if (hash === '#stock-signal') return 'stock-signal';
  if (hash === '#signals') return 'signals';
  return null;
}

function scheduleAfterPaint(task: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(task, { timeout: 1200 });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(task, 0);
  return () => window.clearTimeout(t);
}

export default function SmartMoneyPage() {
  const [tab, setTab] = useState<Tab>(() => tabFromHash() || 'tracker');
  const [, startTransition] = useTransition();
  const trackerLoadStarted = useRef(false);
  const signalsLoadStarted = useRef(false);
  const sectorLoadStarted = useRef(false);

  const [trackerData, setTrackerData] = useState<SmartMoneyTrackerData | null>(null);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [trackerError, setTrackerError] = useState<string | null>(null);

  const [signalsData, setSignalsData] = useState<SmartMoneySignalsData | null>(null);
  const [signalsMonth, setSignalsMonth] = useState('');
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsError, setSignalsError] = useState<string | null>(null);

  const [sectorData, setSectorData] = useState<SectorIntelligenceData | null>(null);
  const [sectorLoading, setSectorLoading] = useState(false);
  const [sectorError, setSectorError] = useState<string | null>(null);

  const applyTab = useCallback((next: Tab, push = true) => {
    setTab(next);
    if (typeof window === 'undefined') return;
    const target = `${BASE_PATH}${SMART_MONEY_TAB_HASH[next]}`;
    if (push && `${window.location.pathname}${window.location.hash}` !== target) {
      window.history.pushState({ smTab: next }, '', target);
    }
    applyClientPageMeta(getSmartMoneyPageMeta(next));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#fund-overlap') {
      window.location.replace('/mutual-funds/fund-overlap');
      return;
    }
    const syncHash = () => {
      applyTab(tabFromHash() || 'tracker', false);
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    window.addEventListener('popstate', syncHash);
    return () => {
      window.removeEventListener('hashchange', syncHash);
      window.removeEventListener('popstate', syncHash);
    };
  }, [applyTab]);

  const loadTrackerForMonth = useCallback(async (month: string, merge = true) => {
    setTrackerLoading(true);
    setTrackerError(null);
    try {
      const chunk = await loadTrackerMonth(month);
      startTransition(() => {
        setTrackerData((prev) => {
          if (!merge || !prev) return chunk;
          return {
            ...prev,
            byMonth: { ...prev.byMonth, ...chunk.byMonth },
          };
        });
      });
    } catch (err) {
      setTrackerError((err as Error).message || 'Failed to load tracker data');
    } finally {
      setTrackerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'tracker' || trackerData || trackerError || trackerLoadStarted.current) return;
    trackerLoadStarted.current = true;
    let cancelled = false;
    const cancelSchedule = scheduleAfterPaint(() => {
      (async () => {
        setTrackerLoading(true);
        try {
          const index = await loadTrackerIndex();
          const firstMonth = index.months[0]?.label;
          if (!firstMonth) throw new Error('No tracker months available');
          if (cancelled) return;
          const chunk = await loadTrackerMonth(firstMonth);
          if (cancelled) return;
          startTransition(() => setTrackerData(chunk));
        } catch (err) {
          if (!cancelled) setTrackerError((err as Error).message || 'Failed to load tracker data');
        } finally {
          if (!cancelled) setTrackerLoading(false);
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [tab, trackerData, trackerError, startTransition]);

  const loadSignalsForMonth = useCallback(async (month: string, category = 'Large Cap') => {
    setSignalsLoading(true);
    setSignalsError(null);
    try {
      const data = await loadSignalsMonth(month, category);
      startTransition(() => {
        setSignalsData(data);
        setSignalsMonth(month);
      });
    } catch (err) {
      setSignalsError((err as Error).message || 'Failed to load signal data');
    } finally {
      setSignalsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'signals' && tab !== 'stock-signal') return;
    if (signalsData && signalsMonth) return;
    if (signalsError || signalsLoadStarted.current) return;
    signalsLoadStarted.current = true;
    let cancelled = false;
    const cancelSchedule = scheduleAfterPaint(() => {
      (async () => {
        setSignalsLoading(true);
        try {
          const index = await loadSignalsIndex();
          const month = index.months[0] || '';
          if (!month) throw new Error('No signal months available');
          const data = await loadSignalsMonth(month, 'Large Cap');
          if (cancelled) return;
          startTransition(() => {
            setSignalsData(data);
            setSignalsMonth(month);
          });
        } catch (err) {
          if (!cancelled) setSignalsError((err as Error).message || 'Failed to load signal data');
        } finally {
          if (!cancelled) setSignalsLoading(false);
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [tab, signalsData, signalsMonth, signalsError, startTransition]);

  useEffect(() => {
    if (tab !== 'sectors' || sectorData || sectorError || sectorLoadStarted.current) return;
    sectorLoadStarted.current = true;
    setSectorLoading(true);
    const cancelSchedule = scheduleAfterPaint(() => {
      fetchJsonCached<SectorIntelligenceData>(SECTOR_URL)
        .then((data) => startTransition(() => setSectorData(data)))
        .catch((err: Error) => setSectorError(err.message || 'Failed to load sector intelligence'))
        .finally(() => setSectorLoading(false));
    });
    return cancelSchedule;
  }, [tab, sectorData, sectorError, startTransition]);

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      active
        ? 'bg-primary-600 text-white'
        : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'
    }`;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        <button type="button" onClick={() => applyTab('tracker')} className={tabClass(tab === 'tracker')}>
          Smart Money Tracker
        </button>
        <button type="button" onClick={() => applyTab('signals')} className={tabClass(tab === 'signals')}>
          Smart Money Signal
        </button>
        <button type="button" id="stock-signal" onClick={() => applyTab('stock-signal')} className={tabClass(tab === 'stock-signal')}>
          Stock Signal
        </button>
        <button type="button" id="sector-intelligence" onClick={() => applyTab('sectors')} className={tabClass(tab === 'sectors')}>
          Sector Intelligence
        </button>
      </div>

      {tab === 'tracker' && (
        trackerError ? (
          <div className="text-center py-12 text-red-600 dark:text-red-400">
            <p className="text-sm">{trackerError}</p>
          </div>
        ) : trackerLoading && !trackerData ? (
          <div className="text-center py-12 text-surface-500 dark:text-surface-400">
            <p className="text-sm">Loading Smart Money tracker…</p>
          </div>
        ) : trackerData ? (
          <Suspense fallback={<div className="text-center py-12 text-surface-500"><p className="text-sm">Loading tracker…</p></div>}>
            <SmartMoneyTracker
            data={trackerData}
            loadingMonth={trackerLoading}
            onMonthChange={(month) => {
              if (!trackerData.byMonth[month]) loadTrackerForMonth(month);
            }}
          />
          </Suspense>
        ) : null
      )}

      {tab === 'signals' && (
        signalsError ? (
          <div className="text-center py-12 text-red-600 dark:text-red-400">
            <p className="text-sm">{signalsError}</p>
          </div>
        ) : signalsLoading && !signalsData ? (
          <div className="text-center py-12 text-surface-500 dark:text-surface-400">
            <p className="text-sm">Loading smart money signals…</p>
          </div>
        ) : signalsData ? (
          <Suspense fallback={<div className="text-center py-12 text-surface-500"><p className="text-sm">Loading signals…</p></div>}>
            <SmartMoneySignalTable
            data={signalsData}
            loading={signalsLoading}
            month={signalsMonth}
            onMonthChange={loadSignalsForMonth}
            onCategoryChange={(category) => {
              if (signalsMonth) loadSignalsForMonth(signalsMonth, category);
            }}
          />
          </Suspense>
        ) : null
      )}

      {tab === 'stock-signal' && (
        signalsError ? (
          <div className="text-center py-12 text-red-600 dark:text-red-400">
            <p className="text-sm">{signalsError}</p>
          </div>
        ) : signalsLoading && !signalsData ? (
          <div className="text-center py-12 text-surface-500 dark:text-surface-400">
            <p className="text-sm">Loading stock signals…</p>
          </div>
        ) : signalsData ? (
          <Suspense fallback={<div className="text-center py-12 text-surface-500"><p className="text-sm">Loading stock signals…</p></div>}>
            <StockSignalTab
            data={signalsData}
            loading={signalsLoading}
            month={signalsMonth}
            onMonthChange={loadSignalsForMonth}
            onCategoryChange={(category) => {
              if (signalsMonth) loadSignalsForMonth(signalsMonth, category);
            }}
          />
          </Suspense>
        ) : null
      )}

      {tab === 'sectors' && (
        sectorLoading ? (
          <div className="text-center py-12 text-surface-500 dark:text-surface-400">
            <p className="text-sm">Loading sector intelligence…</p>
          </div>
        ) : sectorError ? (
          <div className="text-center py-12 text-red-600 dark:text-red-400">
            <p className="text-sm">{sectorError}</p>
          </div>
        ) : sectorData ? (
          <Suspense fallback={<div className="text-center py-12 text-surface-500"><p className="text-sm">Loading sectors…</p></div>}>
            <SectorIntelligenceTable data={sectorData} />
          </Suspense>
        ) : null
      )}
    </div>
  );
}
