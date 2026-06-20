import { lazy, Suspense, useEffect, useState } from 'react';
import { fetchJsonCached } from '../../lib/client-data';

const FundOverlapTab = lazy(() => import('./FundOverlapTab'));

interface FundOverlapItem {
  slug: string;
  name: string;
}

  useEffect(() => {
    let cancelled = false;
    fetchJsonCached<FundOverlapItem[]>('/data/fund-overlap-index.json')
      .then((data) => {
        if (!cancelled) setFunds(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Failed to load fund overlap list');
      });
    return () => {
      cancelled = true;
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
