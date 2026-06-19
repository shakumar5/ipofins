import { useEffect, useMemo, useState } from 'react';
import FundTable from './FundTable';
import { loadMfHubFunds, loadMfHubMeta, type MfHubMeta } from '../../lib/mf-hub-client';
import type { MfHubFundRow } from '../../lib/mf-hub-build';

interface Props {
  table: 'best' | 'all';
  basePath: string;
  defaultCategory?: string;
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

export default function FundTableLoader({ table, basePath, defaultCategory = 'All' }: Props) {
  const [meta, setMeta] = useState<MfHubMeta | null>(null);
  const [funds, setFunds] = useState<MfHubFundRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cancel = scheduleIdle(() => {
      loadMfHubFunds(table)
        .then((rows) => {
          if (!cancelled) setFunds(rows);
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message || 'Failed to load funds');
        });

      loadMfHubMeta()
        .then((m) => {
          if (!cancelled) setMeta(m);
        })
        .catch(() => {
          /* categories can be derived from funds */
        });
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [table]);

  const categories = useMemo(() => {
    if (meta?.categories?.length) return meta.categories;
    if (!funds?.length) return [];
    return [...new Set(funds.map((f) => f.category))].sort((a, b) => a.localeCompare(b));
  }, [meta, funds]);

  if (error) {
    return (
      <p className="py-12 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
    );
  }

  if (!funds) {
    return (
      <p className="py-12 text-center text-sm text-surface-500 dark:text-surface-400">
        Loading fund table…
      </p>
    );
  }

  return (
    <FundTable
      funds={funds}
      categories={categories}
      defaultCategory={defaultCategory}
      basePath={basePath}
      table={table}
    />
  );
}
