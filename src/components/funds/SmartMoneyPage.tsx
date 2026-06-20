import { useState, useEffect, useCallback, useTransition, useRef, lazy, Suspense } from 'react';

const SmartMoneyTracker = lazy(() => import('./SmartMoneyTracker'));
const SmartMoneySignalTable = lazy(() => import('./SmartMoneySignalTable'));
const SectorIntelligenceTable = lazy(() => import('./SectorIntelligenceTable'));

import type { SmartMoneyTrackerData } from '../../lib/data/holdings';
import type { SmartMoneySignalsData } from '../../lib/smart-money-signals';
import type { SectorIntelligenceData } from '../../lib/sector-intelligence';
import { applyClientPageMeta } from '../../lib/apply-client-page-meta';
import {
  getSmartMoneyPageMeta,
  parseSmartMoneyTabFromPathname,
  smartMoneyTabPath,
  type SmartMoneyTab,
} from '../../lib/smart-money-meta';
import {
  getSmartMoneyTrackerPageMeta,
  parseTrackerFromPathname,
  trackerPathFromViewMonth,
  TRACKER_BASE_PATH,
  TRACKER_VIEW_OPTIONS,
  type TrackerViewType,
} from '../../lib/smart-money-tracker-meta';
import SmartMoneySubNav from './SmartMoneySubNav';

import {
  loadSignalsIndex,
  loadSignalsMonth,
  loadTrackerIndex,
  loadTrackerMonth,
} from '../../lib/smart-money-client';
import { fetchJsonCached } from '../../lib/client-data';

const SECTOR_URL = '/data/sector-intelligence.json';
const BASE_PATH = TRACKER_BASE_PATH;

interface SmartMoneyPageProps {
  initialTracker?: { view: TrackerViewType; monthLabel: string } | null;
  initialTab?: SmartMoneyTab | null;
}

type Tab = SmartMoneyTab;

const LEGACY_HASH_TAB: Record<string, Tab> = {
  '#signals': 'signals',
  '#stock-signal': 'stock-signal',
  '#sector-intelligence': 'sectors',
};

export default function SmartMoneyPage({
  initialTracker = null,
  initialTab = null,
}: SmartMoneyPageProps) {
  const [tab, setTab] = useState<Tab>(() => {
    if (initialTracker) return 'tracker';
    if (initialTab) return initialTab;
    if (typeof window !== 'undefined') {
      const fromPath = parseSmartMoneyTabFromPathname(window.location.pathname);
      if (fromPath) return fromPath;
    }
    return 'tracker';
  });
  const [, startTransition] = useTransition();
  const trackerLoadStarted = useRef(false);
  const signalsLoadStarted = useRef(false);
  const sectorLoadStarted = useRef(false);
  const [trackerRetry, setTrackerRetry] = useState(0);
  const [signalsRetry, setSignalsRetry] = useState(0);
  const [sectorRetry, setSectorRetry] = useState(0);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#fund-overlap') {
      window.location.replace('/mutual-funds/fund-overlap');
      return;
    }
    const legacyTab = LEGACY_HASH_TAB[window.location.hash];
    if (legacyTab) {
      if (legacyTab === 'stock-signal') {
        window.location.replace(smartMoneyTabPath('stock-signal'));
        return;
      }
      const target = smartMoneyTabPath(legacyTab);
      const qs = window.location.search;
      window.history.replaceState(null, '', `${target}${qs}`);
      setTab(legacyTab);
      applyClientPageMeta(getSmartMoneyPageMeta(legacyTab));
      return;
    }
    const syncFromNavigation = () => {
      const parsedTracker = parseTrackerFromPathname(window.location.pathname);
      if (parsedTracker) {
        setTab('tracker');
        applyClientPageMeta(getSmartMoneyTrackerPageMeta(parsedTracker.view, parsedTracker.monthLabel));
        return;
      }
      const parsedTab = parseSmartMoneyTabFromPathname(window.location.pathname);
      if (parsedTab === 'stock-signal') {
        window.location.replace(smartMoneyTabPath('stock-signal'));
        return;
      }
      if (parsedTab) {
        setTab(parsedTab);
        applyClientPageMeta(getSmartMoneyPageMeta(parsedTab));
        return;
      }
      if (window.location.pathname === BASE_PATH || window.location.pathname === `${BASE_PATH}/`) {
        setTab('tracker');
        applyClientPageMeta(getSmartMoneyPageMeta('tracker'));
      }
    };
    syncFromNavigation();
    window.addEventListener('popstate', syncFromNavigation);
    return () => window.removeEventListener('popstate', syncFromNavigation);
  }, []);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const legacyView = params.get('view');
    if (!legacyView || !TRACKER_VIEW_OPTIONS.some((o) => o.id === legacyView)) return;

    const month =
      initialTracker?.monthLabel ||
      trackerData?.months[0]?.label;
    if (!month) return;

    params.delete('view');
    const qs = params.toString();
    const path = trackerPathFromViewMonth(legacyView as TrackerViewType, month);
    window.history.replaceState(null, '', `${path}${qs ? `?${qs}` : ''}`);
    setTab('tracker');
    applyClientPageMeta(getSmartMoneyTrackerPageMeta(legacyView as TrackerViewType, month));
  }, [trackerData, initialTracker]);

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
    if (tab !== 'tracker' || trackerData || trackerLoadStarted.current) return;
    trackerLoadStarted.current = true;
    let cancelled = false;
    const cancelSchedule = scheduleAfterPaint(() => {
      (async () => {
        setTrackerLoading(true);
        try {
          const index = await loadTrackerIndex();
          const deepMonth = initialTracker?.monthLabel;
          const firstMonth =
            deepMonth && index.months.some((m) => m.label === deepMonth)
              ? deepMonth
              : index.months[0]?.label;
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
  }, [tab, trackerData, trackerError, trackerRetry, startTransition, initialTracker]);

  const loadSignalsForMonth = useCallback(async (month: string, category = 'All') => {
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
    if (tab !== 'signals') return;
    if (signalsData && signalsMonth) return;
    if (signalsLoadStarted.current) return;
    signalsLoadStarted.current = true;
    let cancelled = false;
    const cancelSchedule = scheduleAfterPaint(() => {
      (async () => {
        setSignalsLoading(true);
        try {
          const index = await loadSignalsIndex();
          const month = index.months[0] || '';
          if (!month) throw new Error('No signal months available');
          const data = await loadSignalsMonth(month, 'All');
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
  }, [tab, signalsData, signalsMonth, signalsRetry, startTransition]);

  useEffect(() => {
    if (tab !== 'sectors' || sectorData || sectorLoadStarted.current) return;
    sectorLoadStarted.current = true;
    setSectorLoading(true);
    const cancelSchedule = scheduleAfterPaint(() => {
      fetchJsonCached<SectorIntelligenceData>(SECTOR_URL)
        .then((data) => startTransition(() => setSectorData(data)))
        .catch((err: Error) => setSectorError(err.message || 'Failed to load sector intelligence'))
        .finally(() => setSectorLoading(false));
    });
    return cancelSchedule;
  }, [tab, sectorData, sectorRetry, startTransition]);

  const retryTracker = () => {
    trackerLoadStarted.current = false;
    setTrackerError(null);
    setTrackerData(null);
    setTrackerRetry((r) => r + 1);
  };

  const retrySignals = () => {
    signalsLoadStarted.current = false;
    setSignalsError(null);
    setSignalsData(null);
    setSignalsMonth('');
    setSignalsRetry((r) => r + 1);
  };

  const retrySector = () => {
    sectorLoadStarted.current = false;
    setSectorError(null);
    setSectorData(null);
    setSectorRetry((r) => r + 1);
  };

  const errorPanel = (message: string, onRetry: () => void) => (
    <div className="text-center py-12 text-red-600 dark:text-red-400">
      <p className="text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
      >
        Retry
      </button>
    </div>
  );

  const subNavActive = tab === 'stock-signal' ? 'stock-signal-hub' : tab;

  return (
    <div>
      <SmartMoneySubNav active={subNavActive} />

      {tab === 'tracker' && (
        trackerError ? (
          errorPanel(trackerError, retryTracker)
        ) : trackerLoading && !trackerData ? (
          <div className="text-center py-12 text-surface-500 dark:text-surface-400">
            <p className="text-sm">Loading Smart Money tracker…</p>
          </div>
        ) : trackerData ? (
          <Suspense fallback={<div className="text-center py-12 text-surface-500"><p className="text-sm">Loading tracker…</p></div>}>
            <SmartMoneyTracker
            data={trackerData}
            loadingMonth={trackerLoading}
            initialView={initialTracker?.view}
            initialMonth={initialTracker?.monthLabel}
            onMonthChange={(month) => {
              if (!trackerData.byMonth[month]) loadTrackerForMonth(month);
            }}
          />
          </Suspense>
        ) : null
      )}

      {tab === 'signals' && (
        signalsError ? (
          errorPanel(signalsError, retrySignals)
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

      {tab === 'sectors' && (
        sectorLoading ? (
          <div className="text-center py-12 text-surface-500 dark:text-surface-400">
            <p className="text-sm">Loading sector intelligence…</p>
          </div>
        ) : sectorError ? (
          errorPanel(sectorError, retrySector)
        ) : sectorData ? (
          <Suspense fallback={<div className="text-center py-12 text-surface-500"><p className="text-sm">Loading sectors…</p></div>}>
            <SectorIntelligenceTable data={sectorData} />
          </Suspense>
        ) : null
      )}
    </div>
  );
}
