import { lazy, Suspense, useEffect, useState } from 'react';
import { fetchJsonCached } from '../../lib/client-data';

const FundOverlapTab = lazy(() => import('./FundOverlapTab'));

interface FundOverlapItem {
  slug: string;
  name: string;
}

function scheduleIdle(task: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(task, { timeout: 2500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(task, 1);
  return () => window.clearTimeout(t);
}

export default function FundOverlapLoader() {
  const [funds, setFunds] = useState<FundOverlapItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cancel = scheduleIdle(() => {
      fetchJsonCached<FundOverlapItem[]>('/data/fund-overlap-index.json')
        .then((data) => {
          if (!cancelled) setFunds(data);
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message || 'Failed to load fund overlap list');
        });
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, []);

  if (error) {
    return (
      <p className="py-12 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
    );
  }

  if (!funds) {
    return (
      <p className="py-12 text-center text-sm text-surface-500 dark:text-surface-400">
        Loading fund overlap…
      </p>
    );
  }

  return (
    <Suspense fallback={<p className="py-12 text-center text-sm text-surface-500">Loading…</p>}>
      <FundOverlapTab funds={funds} />
    </Suspense>
  );
}
