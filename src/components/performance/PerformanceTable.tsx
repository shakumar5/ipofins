import { useState, useMemo, useEffect, useCallback, useTransition } from 'react';
import { applyClientPageMeta } from '../../lib/apply-client-page-meta';
import {
  getIpoPerformancePageMeta,
  ipoFilterFromSearch,
  type IpoPerformanceFilter,
} from '../../lib/ipo-performance-meta';

interface IPOPerformance {
  name: string;
  slug?: string;
  issuePrice?: number | null;
  listingPrice?: number | null;
  listingGain?: number | null;
  listingDate?: string;
  currentPrice?: number | null;
  sector?: string;
  type?: 'mainboard' | 'sme';
}

interface Props {
  mainboardData: IPOPerformance[];
  smeData: IPOPerformance[];
  existingSlugs?: string[];
  year: string;
}

const IPO_PAGE_SIZE = 30;

function pctReturn(issue?: number | null, price?: number | null): number | null {
  if (!issue || !price || issue <= 0) return null;
  return ((price - issue) / issue) * 100;
}

export default function PerformanceTable({ mainboardData, smeData, existingSlugs = [], year }: Props) {
  const [filter, setFilter] = useState<IpoPerformanceFilter>(() => {
    if (typeof window === 'undefined') return 'all';
    return ipoFilterFromSearch(window.location.search);
  });
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [visibleCount, setVisibleCount] = useState(IPO_PAGE_SIZE);
  const [, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      all: mainboardData.length + smeData.length,
      mainboard: mainboardData.length,
      sme: smeData.length,
    }),
    [mainboardData.length, smeData.length],
  );

  const syncFilter = useCallback(
    (next: IpoPerformanceFilter) => {
      startTransition(() => setFilter(next));
      if (typeof window === 'undefined') return;
      const basePath = `/ipo/performance/${year}`;
      const newUrl = next === 'all' ? basePath : `${basePath}?type=${next}`;
      if (`${window.location.pathname}${window.location.search}` !== newUrl) {
        window.history.replaceState(null, '', newUrl);
      }
      applyClientPageMeta(getIpoPerformancePageMeta(year, next, counts));
    },
    [year, counts, startTransition],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromUrl = () => {
      const next = ipoFilterFromSearch(window.location.search);
      setFilter(next);
      applyClientPageMeta(getIpoPerformancePageMeta(year, next, counts));
    };

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [year, counts]);

  const allData = useMemo(() => {
    const mb = mainboardData.map(i => ({ ...i, type: 'mainboard' as const }));
    const sme = smeData.map(i => ({ ...i, type: 'sme' as const }));
    return [...mb, ...sme];
  }, [mainboardData, smeData]);

  const filtered = useMemo(() => {
    let data = filter === 'all' ? allData : filter === 'mainboard' ? allData.filter(i => i.type === 'mainboard') : allData.filter(i => i.type === 'sme');
    
    data = [...data].sort((a, b) => {
      // Entries without listing price go to the bottom
      if (!a.listingPrice && b.listingPrice) return 1;
      if (a.listingPrice && !b.listingPrice) return -1;
      if (!a.listingPrice && !b.listingPrice) return 0;
      const returnA = pctReturn(a.issuePrice, a.listingPrice) ?? -Infinity;
      const returnB = pctReturn(b.issuePrice, b.listingPrice) ?? -Infinity;
      return sortOrder === 'desc' ? returnB - returnA : returnA - returnB;
    });

    return data;
  }, [allData, filter, sortOrder]);

  useEffect(() => {
    setVisibleCount(IPO_PAGE_SIZE);
  }, [filter, sortOrder]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  const stats = useMemo(() => {
    const total = filtered.length;
    const withPrice = filtered.filter(i => i.listingPrice && i.issuePrice);
    const positive = withPrice.filter(i => (i.listingPrice ?? 0) > (i.issuePrice ?? 0)).length;
    const avg = withPrice.length > 0
      ? withPrice.reduce((s, i) => s + (pctReturn(i.issuePrice, i.listingPrice) ?? 0), 0) / withPrice.length
      : 0;
    return { total, positive, avg };
  }, [filtered]);

  const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'mainboard', 'sme'] as const).map(f => (
          <button
            key={f}
            onClick={() => syncFilter(f)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? `All (${allData.length})` : f === 'mainboard' ? `Mainboard (${mainboardData.length})` : `SME (${smeData.length})`}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-center">
          <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.total}</p>
          <p className="text-xs text-gray-500">IPOs</p>
        </div>
        <div className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-center">
          <p className="text-lg font-bold text-green-500">{stats.positive}</p>
          <p className="text-xs text-gray-500">Positive</p>
        </div>
        <div className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-center">
          <p className={`text-lg font-bold ${stats.avg >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {stats.avg >= 0 ? '+' : ''}{stats.avg.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500">Avg Return</p>
        </div>
      </div>

      {/* Table Header */}
      <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 mb-2">
        <div className="col-span-4">Company</div>
        <div className="col-span-1 text-center">Type</div>
        <div className="col-span-2 text-center">Issue</div>
        <div className="col-span-2 text-center">Listing</div>
        <div className="col-span-1 text-center">Current</div>
        <div className="col-span-2 text-center">
          <button
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
          >
            Return
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {sortOrder === 'desc' 
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Sort */}
      <div className="md:hidden flex justify-end mb-3">
        <button
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          className="text-xs text-blue-600 font-medium flex items-center gap-1"
        >
          Sort by Return {sortOrder === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {visibleRows.map((ipo, i) => {
          const listingReturn = pctReturn(ipo.issuePrice, ipo.listingPrice);
          const currentReturn = pctReturn(ipo.issuePrice, ipo.currentPrice);
          const slug = slugify(ipo.name);

          return (
            <a
              key={i}
              href={`/ipo/${slug}`}
              className="block p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all cursor-pointer"
            >
              {/* Desktop */}
              <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                <div className="col-span-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white hover:text-blue-600 transition-colors">{ipo.name}</h3>
                  <p className="text-xs text-gray-500">{ipo.sector} • {ipo.listingDate}</p>
                </div>
                <div className="col-span-1 text-center">
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded uppercase ${
                    ipo.type === 'mainboard' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                  }`}>{ipo.type === 'mainboard' ? 'MB' : 'SME'}</span>
                </div>
                <div className="col-span-2 text-center text-sm font-medium text-gray-800 dark:text-gray-200">₹{ipo.issuePrice}</div>
                <div className="col-span-2 text-center">
                  <span className={`text-sm font-bold ${listingReturn != null ? (listingReturn >= 0 ? 'text-green-500' : 'text-red-500') : 'text-gray-400'}`}>{ipo.listingPrice ? `₹${ipo.listingPrice}` : 'Awaiting'}</span>
                </div>
                <div className="col-span-1 text-center">
                  <span className={`text-sm font-bold ${currentReturn != null ? (currentReturn >= 0 ? 'text-green-500' : 'text-red-500') : 'text-gray-400'}`}>{ipo.currentPrice ? `₹${ipo.currentPrice}` : '--'}</span>
                </div>
                <div className="col-span-2 text-center">
                  {listingReturn != null ? (
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${listingReturn >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                      {listingReturn >= 0 ? '+' : ''}{listingReturn.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-50 text-gray-400">--</span>
                  )}
                </div>
              </div>

              {/* Mobile */}
              <div className="md:hidden">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{ipo.name}</h3>
                    <p className="text-xs text-gray-500">{ipo.sector} • {(ipo.type ?? 'mainboard').toUpperCase()}</p>
                  </div>
                  {listingReturn != null ? (
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${listingReturn >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                      {listingReturn >= 0 ? '+' : ''}{listingReturn.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-50 text-gray-400">Pending</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div><p className="text-gray-400">Issue</p><p className="font-medium">₹{ipo.issuePrice}</p></div>
                  <div><p className="text-gray-400">Listing</p><p className={`font-bold ${listingReturn != null ? (listingReturn >= 0 ? 'text-green-500' : 'text-red-500') : 'text-gray-400'}`}>{ipo.listingPrice ? `₹${ipo.listingPrice}` : 'Awaiting'}</p></div>
                  <div><p className="text-gray-400">Current</p><p className={`font-bold ${currentReturn != null ? (currentReturn >= 0 ? 'text-green-500' : 'text-red-500') : 'text-gray-400'}`}>{ipo.currentPrice ? `₹${ipo.currentPrice}` : '--'}</p></div>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + IPO_PAGE_SIZE)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-gray-500 py-8">No data available for this filter.</p>
      )}
    </div>
  );
}
