import { useEffect, useState } from 'react';
import { fetchJsonCached } from '../../lib/client-data';
import {
  TOP_STOCKS_DATA_URL,
  emptyTopStocksPayload,
  type TopStocksPayload,
} from '../../lib/top-stocks-shared';
import type { TopStocksFilters } from '../../lib/top-stocks-meta';
import TopStocksBoard from './TopStocksBoard';
import { withErrorBoundary } from '../withErrorBoundary';

interface Props {
  initialPayload: TopStocksPayload;
  initialFilters?: TopStocksFilters;
}

function TopStocksLoaderInner({ initialPayload, initialFilters }: Props) {
  const [payload, setPayload] = useState<TopStocksPayload>(
    initialPayload.hasData ? initialPayload : emptyTopStocksPayload(),
  );
  const [loading, setLoading] = useState(!initialPayload.hasData);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (initialPayload.hasData) {
      setPayload(initialPayload);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchJsonCached<TopStocksPayload>(TOP_STOCKS_DATA_URL)
      .then((data) => {
        if (cancelled) return;
        setPayload({
          ...data,
          hasData: Boolean(
            data.hasData ?? Object.values(data.buckets ?? {}).some((rows) => rows?.length > 0),
          ),
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const msg = err.message || '';
        if (/404|not found/i.test(msg)) {
          setPayload(emptyTopStocksPayload());
          setError(null);
          return;
        }
        setError(msg || 'Failed to load Top Stocks data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialPayload, retryKey]);

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-surface-500 dark:text-surface-400">
        Loading Top Stocks...
      </p>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-12">
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

  return <TopStocksBoard payload={payload} initialFilters={initialFilters} />;
}

export default withErrorBoundary(TopStocksLoaderInner, 'Top Stocks');
