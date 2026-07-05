import { lazy, Suspense, useEffect, useState } from 'react';
import { fetchJsonCached } from '../../lib/client-data';
import { withErrorBoundary } from '../withErrorBoundary';

const FundOverlapTab = lazy(() => import('./FundOverlapTab'));

const FETCH_TIMEOUT_MS = 12000;

interface FundOverlapItem {
  slug: string;
  name: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Data load timed out. Please refresh.')), ms),
    ),
  ]);
}

function FundOverlapLoaderInner() {
  const [funds, setFunds] = useState<FundOverlapItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFunds(null);
    setError(null);
    withTimeout(
      fetchJsonCached<FundOverlapItem[]>('/data/fund-overlap-index.json'),
      FETCH_TIMEOUT_MS,
    )
      .then((data) => {
        if (!cancelled) setFunds(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Failed to load fund overlap list');
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
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

export default withErrorBoundary(FundOverlapLoaderInner, 'Fund Overlap');
