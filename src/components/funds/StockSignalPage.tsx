import { useCallback, useEffect, useRef, useState } from 'react';

import StockSignalView from './StockSignalView';

import type { SmartMoneySignalsData } from '../../lib/smart-money-signals';
import {
  resolveSignalsDataBootstrap,
  resolveSignalsIndexBootstrap,
  seedSignalsJsonCache,
} from '../../lib/smart-money-signals-bootstrap';
import type { SignalsIndexDisk } from '../../lib/smart-money-signals-server';
import { loadSignalsIndex, loadSignalsMonth } from '../../lib/smart-money-client';

interface Props {
  initialStockSlug?: string | null;
  initialSignalsIndex?: SignalsIndexDisk | null;
  initialSignalsMonth?: string | null;
  initialSignalsData?: SmartMoneySignalsData | null;
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

export default function StockSignalPage({
  initialStockSlug = null,
  initialSignalsIndex = null,
  initialSignalsMonth = null,
  initialSignalsData = null,
}: Props) {
  const loadStarted = useRef(false);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<SmartMoneySignalsData | null>(() =>
    resolveSignalsDataBootstrap(initialSignalsData),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const index = resolveSignalsIndexBootstrap(initialSignalsIndex);
    if (!index) return;
    seedSignalsJsonCache({
      index,
      initialMonth: initialSignalsMonth || index.months[0] || '',
      data: resolveSignalsDataBootstrap(initialSignalsData),
    });
  }, [initialSignalsIndex, initialSignalsMonth, initialSignalsData]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const index = await loadSignalsIndex();
      const month = index.months[0] || '';
      if (!month) throw new Error('No signal months available');
      const chunk = await loadSignalsMonth(month, 'All');
      setData(chunk);
    } catch (err) {
      setError((err as Error).message || 'Failed to load stock signal data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (data || loadStarted.current) return;
    loadStarted.current = true;
    let cancelled = false;
    const cancelSchedule = scheduleAfterPaint(() => {
      load().finally(() => {
        if (cancelled) return;
      });
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [data, load, retry]);

  const retryLoad = () => {
    loadStarted.current = false;
    setData(null);
    setError(null);
    setRetry((r) => r + 1);
  };

  return (
    <div>
      {error ? (
        <div className="text-center py-12 text-red-600 dark:text-red-400">
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            Retry
          </button>
        </div>
      ) : loading && !data ? (
        <div className="text-center py-12 text-surface-500 dark:text-surface-400">
          <p className="text-sm">Loading stock signal data…</p>
        </div>
      ) : data ? (
        <StockSignalView data={data} initialStockSlug={initialStockSlug} loading={loading} />
      ) : null}
    </div>
  );
}
