import { useEffect, useMemo, useState } from 'react';
import FundTable from './FundTable';
import { fetchJsonCached } from '../../lib/client-data';
import {
  enrichMfHubFundsWithHoldings,
  FUND_HOLDINGS_ALIASES_URL,
  FUND_HOLDINGS_META_URL,
  type FundHoldingsMetaDisk,
} from '../../lib/enrich-mf-hub-funds';
import { loadMfHubFunds, loadMfHubMeta, type MfHubMeta } from '../../lib/mf-hub-client';
import type { MfHubFundRow } from '../../lib/mf-hub-build';

interface Props {
  table: 'best' | 'all';
  basePath: string;
  defaultCategory?: string;
}

export default function FundTableLoader({ table, basePath, defaultCategory = 'All' }: Props) {
  const [meta, setMeta] = useState<MfHubMeta | null>(null);
  const [funds, setFunds] = useState<MfHubFundRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      loadMfHubFunds(table),
      fetchJsonCached<FundHoldingsMetaDisk>(FUND_HOLDINGS_META_URL).catch(() => null),
      fetchJsonCached<Record<string, string>>(FUND_HOLDINGS_ALIASES_URL).catch(() => ({})),
    ])
      .then(([rows, holdingsMeta, amfiAliases]) => {
        if (cancelled) return;
        if (holdingsMeta?.stockCounts && Object.keys(holdingsMeta.stockCounts).length > 0) {
          setFunds(enrichMfHubFundsWithHoldings(rows, holdingsMeta, amfiAliases));
          return;
        }
        setFunds(rows);
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

    return () => {
      cancelled = true;
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
