import { useEffect, useMemo, useState } from 'react';
import { formatPct } from '../../lib/tracked-display';
import { fetchJsonCached } from '../../lib/client-data';
import {
  SAST_UPDATES_CURATED_URL,
  SAST_UPDATES_DATA_URL,
  type SastUpdateItem,
  type SastUpdatesPayload,
} from '../../lib/sast-updates';

type FilterMode = 'all' | 'curated';

const PAGE_SIZE = 20;

interface Props {
  superInvestorBase?: string;
  stockBase?: string;
  initialCurated?: SastUpdatesPayload | null;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function natureLabel(nature: SastUpdateItem['transactionNature']) {
  if (nature === 'acquisition') return 'Acquisition';
  if (nature === 'disposal') return 'Disposal';
  return 'SAST filing';
}

function natureTone(nature: SastUpdateItem['transactionNature']) {
  if (nature === 'acquisition') return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40';
  if (nature === 'disposal') return 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40';
  return 'text-surface-600 dark:text-surface-300 bg-surface-100 dark:bg-surface-800';
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pctDelta(pre: number | null, post: number | null) {
  if (pre == null || post == null) return null;
  const d = post - pre;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(2)} pp`;
}

export default function SastUpdatesFeed({
  superInvestorBase = '/super-investors',
  stockBase = '/1-percent-club',
  initialCurated = null,
}: Props) {
  const [curatedPayload, setCuratedPayload] = useState<SastUpdatesPayload | null>(initialCurated);
  const [allPayload, setAllPayload] = useState<SastUpdatesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingCurated, setLoadingCurated] = useState(!initialCurated);
  const [loadingAll, setLoadingAll] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('curated');
  const [stockQuery, setStockQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (initialCurated) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJsonCached<SastUpdatesPayload>(SAST_UPDATES_CURATED_URL);
        if (!cancelled) setCuratedPayload(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load SAST feed');
      } finally {
        if (!cancelled) setLoadingCurated(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCurated]);

  useEffect(() => {
    if (filter !== 'all' || allPayload || loadingAll) return;
    let cancelled = false;
    setLoadingAll(true);
    (async () => {
      try {
        const data = await fetchJsonCached<SastUpdatesPayload>(SAST_UPDATES_DATA_URL);
        if (!cancelled) setAllPayload(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load full SAST feed');
      } finally {
        if (!cancelled) setLoadingAll(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, allPayload, loadingAll]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, stockQuery]);

  const q = norm(stockQuery);
  const activePayload = filter === 'curated' ? curatedPayload : allPayload;
  const totalInFeed = filter === 'curated' ? curatedPayload?.items.length ?? 0 : allPayload?.totalCount ?? 0;

  const items = useMemo(() => {
    const list = activePayload?.items ?? [];
    return list.filter((item) => {
      if (filter === 'curated' && !item.isCuratedMatch) return false;
      if (!q) return true;
      const hay = norm(
        [item.stockName, item.nseSymbol ?? '', item.stockSlug ?? ''].filter(Boolean).join(' ')
      );
      return hay.includes(q);
    });
  }, [activePayload, filter, q]);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  if (loadingCurated) {
    return (
      <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-8 text-center text-surface-500">
        Loading SAST filings...
      </div>
    );
  }

  if (error && !curatedPayload && !allPayload) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6">
        <p className="font-medium text-amber-900 dark:text-amber-200">Feed not available yet</p>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">{error}</p>
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          The weekly export runs every Monday morning. Check back after the next refresh.
        </p>
      </div>
    );
  }

  const generatedLabel = activePayload?.generatedAt
    ? new Date(activePayload.generatedAt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : curatedPayload?.generatedAt
      ? new Date(curatedPayload.generatedAt).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
        <strong>Preliminary disclosures.</strong> SAST Form B filings are event-driven and may differ
        slightly from the next quarterly Shareholding Pattern. Curated super-investor links are best-effort
        name matches - confirmed stakes appear on investor profiles after SHP ingestion.
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('curated')}
            className={
              filter === 'curated' ? 'btn-primary px-4 py-2 text-sm' : 'btn-secondary px-4 py-2 text-sm'
            }
          >
            Curated investors
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'btn-primary px-4 py-2 text-sm' : 'btn-secondary px-4 py-2 text-sm'}
          >
            All filings
          </button>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="sast-stock-search" className="sr-only">
            Filter by stock
          </label>
          <input
            id="sast-stock-search"
            type="search"
            placeholder="Filter by stock name or NSE symbol..."
            value={stockQuery}
            onChange={(e) => setStockQuery(e.target.value)}
            className="w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-4 py-2 text-sm"
          />
        </div>
      </div>

      {generatedLabel && (
        <p className="text-xs text-surface-500 dark:text-surface-400">
          Last refreshed {generatedLabel} IST - showing {items.length}
          {filter === 'all' ? ` of ${totalInFeed}` : ''} filings
          {filter === 'all' && allPayload?.historyDays ? ` (${allPayload.historyDays}-day window)` : ''}
        </p>
      )}

      {filter === 'all' && loadingAll && (
        <p className="text-sm text-surface-500 dark:text-surface-400">Loading full exchange feed...</p>
      )}

      {items.length === 0 && !(filter === 'all' && loadingAll) ? (
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-8 text-center">
          <p className="text-surface-700 dark:text-surface-200 font-medium">No filings match your filters</p>
          <p className="mt-2 text-sm text-surface-500">
            {filter === 'curated'
              ? 'No curated super-investor SAST filings this week. Try All filings for the full exchange feed.'
              : 'Try clearing the stock filter.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
                      <time dateTime={item.filingDate}>{formatDate(item.filingDate)}</time>
                      {item.exchange && (
                        <span className="rounded bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 font-medium">
                          {item.exchange}
                        </span>
                      )}
                      {item.nseSymbol && (
                        <span className="font-mono text-surface-600 dark:text-surface-300">{item.nseSymbol}</span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${natureTone(item.transactionNature)}`}
                      >
                        {natureLabel(item.transactionNature)}
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-semibold text-surface-900 dark:text-white">
                      {item.stockSlug ? (
                        <a
                          href={`${stockBase}/${item.stockSlug}`}
                          className="hover:text-primary-600 dark:hover:text-primary-400"
                        >
                          {item.stockName}
                        </a>
                      ) : (
                        item.stockName
                      )}
                    </h3>

                    <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">
                      Filed by{' '}
                      {item.entitySlug ? (
                        <a
                          href={`${superInvestorBase}/${item.entitySlug}`}
                          className="font-medium text-primary-700 dark:text-primary-400 hover:underline"
                        >
                          {item.entityDisplayName || item.filerName}
                        </a>
                      ) : (
                        <span className="font-medium text-surface-800 dark:text-surface-100">{item.filerName}</span>
                      )}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs uppercase tracking-wide text-surface-500">Stake</p>
                    <p className="text-sm font-semibold tabular-nums text-surface-900 dark:text-white">
                      {item.prePct != null || item.postPct != null ? (
                        <>
                          {formatPct(item.prePct)} to {formatPct(item.postPct)}
                        </>
                      ) : (
                        '-'
                      )}
                    </p>
                    {pctDelta(item.prePct, item.postPct) && (
                      <p className="text-xs tabular-nums text-surface-500">{pctDelta(item.prePct, item.postPct)}</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-surface-500 dark:text-surface-400">
                  <span className="italic">Preliminary - confirmed in next quarterly SHP</span>
                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      View exchange filing
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="btn-secondary px-6 py-2 text-sm"
              >
                Show more ({items.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}