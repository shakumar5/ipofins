import { useEffect, useState } from 'react';

import SmartMoneySignalDetail from './SmartMoneySignalDetail';

import type { SmartMoneySignalRow } from '../../lib/smart-money-signals';
import { findSignalRow, loadSignalsIndex } from '../../lib/smart-money-client';
import { stockSignalPath } from '../../lib/stock-signal-meta';

interface Props {
  stockSlug: string;
  initialMonth?: string;
  initialCategory?: string;
}

export default function SmartMoneySignalDetailPage({
  stockSlug,
  initialMonth,
  initialCategory,
}: Props) {
  const [row, setRow] = useState<SmartMoneySignalRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    const monthParam = initialMonth || params.get('month') || '';
    const categoryParam = initialCategory || params.get('category') || 'Large Cap';

    (async () => {
      try {
        const index = await loadSignalsIndex();
        const month = monthParam || index.months[0] || '';
        if (!month) {
          if (!cancelled) setError('No signal data available.');
          return;
        }

        const picked = await findSignalRow(stockSlug, month, categoryParam);
        if (cancelled) return;
        if (!picked) setError('Signal data not found for this stock.');
        else setRow(picked);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || 'Failed to load signal data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stockSlug, initialMonth, initialCategory]);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-surface-500 dark:text-surface-400">
        Loading signal details…
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="py-12 text-center text-red-600 dark:text-red-400">
        <p className="text-sm">{error || 'No data available'}</p>
        <a href={stockSignalPath(stockSlug)} className="text-primary-600 text-sm mt-2 inline-block">
          ← Back to Stock Signal
        </a>
      </div>
    );
  }

  return <SmartMoneySignalDetail row={row} backHref={stockSignalPath(stockSlug)} />;
}
