import { useEffect, useMemo, useState } from 'react';
import FundTable from './FundTable';
import { fetchJsonCached } from '../../lib/client-data';
import {
  enrichMfHubFundsWithHoldings,
  type FundHoldingsMetaDisk,
} from '../../lib/enrich-mf-hub-funds';
import {
  holdingsAliasesUrl,
  holdingsMetaUrl,
  loadMfHubFunds,
  loadMfHubMeta,
  type MfHubMeta,
} from '../../lib/mf-hub-client';
import type { MfHubFundRow } from '../../lib/mf-hub-build';

function mergeHoldingsMetaWithBySlugCounts(
  meta: FundHoldingsMetaDisk,
  bySlugCounts: Record<string, number> | null,
): FundHoldingsMetaDisk {
  if (!bySlugCounts || !Object.keys(bySlugCounts).length) return meta;
  const stockCounts = { ...(meta.stockCounts || {}) };
  for (const [slug, count] of Object.entries(bySlugCounts)) {
    stockCounts[slug] = Math.max(stockCounts[slug] ?? 0, count);
  }
  return {
    slugs: meta.slugs,
    stockCounts,
  };
}

const FETCH_TIMEOUT_MS = 12000;

import { withErrorBoundary } from '../withErrorBoundary';

interface Props {
  table: 'best' | 'all';
  basePath: string;
  defaultCategory?: string;
}

/** Rejects after ms — used to race against actual fetches so we never hang. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Data load timed out. Please refresh.')), ms),
    ),
  ]);
}

function FundTableLoaderInner({ table, basePath, defaultCategory = 'All' }: Props) {
  const [meta, setMeta] = useState<MfHubMeta | null>(null);
  const [funds, setFunds] = useState<MfHubFundRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    withTimeout(loadMfHubMeta(), FETCH_TIMEOUT_MS)
      .then((hubMeta) => {
        if (cancelled) return null;
        setMeta(hubMeta);
        return withTimeout(
          Promise.all([
            loadMfHubFunds(table),
            fetchJsonCached<FundHoldingsMetaDisk>(holdingsMetaUrl(hubMeta)).catch(() => null),
            fetchJsonCached<Record<string, string>>(holdingsAliasesUrl(hubMeta)).catch(() => ({})),
            fetchJsonCached<Record<string, number>>(
              `/data/fund-holdings-by-slug-counts.json${hubMeta?.dataDate && hubMeta.dataDate !== 'N/A' ? `?v=${encodeURIComponent(hubMeta.dataDate.replace(/\s+/g, '-'))}` : ''}`,
            ).catch(() => null),
          ]),
          FETCH_TIMEOUT_MS,
        );
      })
      .then((result) => {
        if (cancelled || !result) return;
        const [rows, holdingsMeta, amfiAliases, bySlugCounts] = result;
        if (holdingsMeta?.stockCounts && Object.keys(holdingsMeta.stockCounts).length > 0) {
          const mergedMeta = mergeHoldingsMetaWithBySlugCounts(holdingsMeta, bySlugCounts);
          setFunds(enrichMfHubFundsWithHoldings(rows, mergedMeta, amfiAliases));
          return;
        }
        setFunds(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Failed to load funds');
      });

    return () => {
      cancelled = true;
    };
  }, [table, retryKey]);

  const categories = useMemo(() => {
    if (meta?.categories?.length) return meta.categories;
    if (!funds?.length) return [];
    return [...new Set(funds.map((f) => f.category))].sort((a, b) => a.localeCompare(b));
  }, [meta, funds]);

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
        <button
          type="button"
          onClick={() => { setError(null); setFunds(null); setRetryKey((k) => k + 1); }}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!funds) {
    return (
      <div className="py-12 text-center">
        <div className="inline-flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading fund data…
        </div>
      </div>
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

export default withErrorBoundary(FundTableLoaderInner, 'Fund Table');
