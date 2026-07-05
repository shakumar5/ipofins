import { useCallback, useEffect, useState } from 'react';
import {
  CALCS_KEY,
  RECENTS_KEY,
  WATCHLIST_KEY,
  type RecentPage,
  type SavedCalculation,
} from '../../lib/local-dashboard';
import { withErrorBoundary } from '../withErrorBoundary';

export interface IpoMapEntry {
  name: string;
  status: string;
  type: string;
  priceRange: string;
  closeDate: string;
  subscription: number | null;
  sector: string;
}

interface Props {
  ipoMap: Record<string, IpoMapEntry>;
}

function safeGet<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') as T | null;
  } catch {
    return null;
  }
}

function safeSet(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

function statusClass(status: string): string {
  return status === 'live'
    ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300'
    : status === 'upcoming'
      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
      : status === 'allotment'
        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
        : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300';
}

function LocalDashboardInner({ ipoMap }: Props) {
  const [watchlistSlugs, setWatchlistSlugs] = useState<string[]>([]);
  const [recents, setRecents] = useState<RecentPage[]>([]);
  const [calcs, setCalcs] = useState<SavedCalculation[]>([]);

  const refresh = useCallback(() => {
    setWatchlistSlugs(safeGet<string[]>(WATCHLIST_KEY) ?? []);
    setRecents((safeGet<RecentPage[]>(RECENTS_KEY) ?? []).filter((r) => r.url !== '/dashboard').slice(0, 8));
    setCalcs(safeGet<SavedCalculation[]>(CALCS_KEY) ?? []);
  }, []);

  useEffect(() => {
    refresh();
    const onWatchlist = () => refresh();
    window.addEventListener('ipofins-watchlist-changed', onWatchlist);
    return () => window.removeEventListener('ipofins-watchlist-changed', onWatchlist);
  }, [refresh]);

  const activeWatchlist = watchlistSlugs.filter((s) => ipoMap[s]);

  const removeWatchlist = (slug: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    safeSet(WATCHLIST_KEY, (safeGet<string[]>(WATCHLIST_KEY) ?? []).filter((s) => s !== slug));
    refresh();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-surface-900 dark:text-white">IPO Watchlist</h2>
          {activeWatchlist.length > 0 && (
            <button
              type="button"
              onClick={() => {
                safeSet(WATCHLIST_KEY, []);
                refresh();
              }}
              className="text-xs text-danger-600 dark:text-danger-400 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="space-y-3">
          {activeWatchlist.length === 0 ? (
            <div className="card-compact text-center text-surface-500 dark:text-surface-400 text-sm py-8">
              <p className="mb-2">No IPOs in your watchlist yet.</p>
              <a href="/ipo" className="btn-primary px-4 py-2 text-sm inline-block">
                Browse IPOs →
              </a>
            </div>
          ) : (
            activeWatchlist.map((slug) => {
              const ipo = ipoMap[slug];
              const sub = ipo.subscription ? `${ipo.subscription.toFixed(1)}×` : '—';
              return (
                <a
                  key={slug}
                  href={`/ipo/${slug}`}
                  className="card-compact group block hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-surface-900 dark:text-white group-hover:text-primary-600 truncate">
                        {ipo.name}
                      </p>
                      <p className="text-xs text-surface-500 mt-0.5">
                        {ipo.type.toUpperCase()}
                        {ipo.sector ? ` · ${ipo.sector}` : ''}
                        {ipo.closeDate ? ` · Closes ${ipo.closeDate}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {ipo.subscription ? (
                        <span className="text-xs font-bold text-primary-600 font-mono">{sub}</span>
                      ) : null}
                      <span className={`badge text-[10px] ${statusClass(ipo.status)}`}>{ipo.status}</span>
                      <button
                        type="button"
                        className="remove-watchlist text-xs text-danger-500 hover:text-danger-700 ml-1"
                        onClick={(e) => removeWatchlist(slug, e)}
                        aria-label="Remove from watchlist"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </a>
              );
            })
          )}
        </div>
        <p className="text-xs text-surface-400 dark:text-surface-500 mt-3">
          Add IPOs from any <a href="/ipo" className="text-primary-600 hover:underline">IPO detail page</a> or list card.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">Recently Viewed</h2>
          {recents.length === 0 ? (
            <p className="text-sm text-surface-500 dark:text-surface-400 text-center py-4">No recent pages yet.</p>
          ) : (
            <div className="space-y-2">
              {recents.map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors group"
                >
                  <svg className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-surface-700 dark:text-surface-300 group-hover:text-primary-600 truncate">
                    {r.title}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-surface-900 dark:text-white">Saved Calculations</h2>
            {calcs.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  safeSet(CALCS_KEY, []);
                  refresh();
                }}
                className="text-xs text-danger-600 dark:text-danger-400 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          {calcs.length === 0 ? (
            <p className="text-sm text-surface-500 dark:text-surface-400 text-center py-4">No saved calculations yet.</p>
          ) : (
            <div className="space-y-2">
              {calcs.slice(0, 5).map((c, i) => (
                <div key={`${c.tool}-${c.ts}-${i}`} className="card-compact">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-surface-800 dark:text-surface-200">{c.tool}</p>
                      <p className="text-xs text-surface-500 mt-0.5">{c.summary}</p>
                    </div>
                    {c.url ? (
                      <a href={c.url} className="text-xs text-primary-600 hover:underline flex-shrink-0">
                        Open →
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-surface-400 dark:text-surface-500 mt-2">
            Save results from any <a href="/tools" className="text-primary-600 hover:underline">calculator</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default withErrorBoundary(LocalDashboardInner, 'Dashboard');
