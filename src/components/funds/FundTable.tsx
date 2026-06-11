import { useState, useMemo } from 'react';

interface Fund {
  name: string;
  slug: string;
  category: string;
  returns1y?: number | null;
  returns3y?: number | null;
  returns5y?: number | null;
  nav: number;
  rating?: number | null;
  aum?: string;
  riskLevel: string;
  hasHoldings?: boolean;
}

interface Props {
  funds: Fund[];
  categories: string[];
  holdingSlugs?: string[];
}

// Fixed category display order
const CATEGORY_ORDER = [
  'Large Cap',
  'Large & Mid Cap',
  'Mid Cap',
  'Multi Cap',
  'Flexi Cap',
  'Small Cap',
  'Value',
  'Focused',
  'ELSS',
  'Sectoral/Thematic',
  'Contra',
  'Dividend Yield',
];

function formatReturn(val: number | null | undefined): string {
  if (val === null || val === undefined) return '--';
  return val >= 0 ? `+${val}%` : `${val}%`;
}

function returnColor(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'text-gray-400';
  return val >= 0 ? 'text-green-600' : 'text-red-500';
}

export default function FundTable({ funds, categories, holdingSlugs = [] }: Props) {
  const [catFilter, setCatFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'returns3y' | 'returns1y' | 'returns5y' | 'nav' | 'holdings'>('returns3y');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const holdingSet = useMemo(() => new Set(holdingSlugs), [holdingSlugs]);

  // Sort categories in defined order
  const orderedCategories = useMemo(() => {
    return CATEGORY_ORDER.filter(cat => categories.includes(cat));
  }, [categories]);

  const filtered = useMemo(() => {
    let data = catFilter === 'All' ? funds : funds.filter(f => f.category === catFilter);
    data = [...data].sort((a, b) => {
      if (sortBy === 'holdings') {
        const aH = holdingSet.has(a.slug) ? 1 : 0;
        const bH = holdingSet.has(b.slug) ? 1 : 0;
        return sortDir === 'desc' ? bH - aH : aH - bH;
      }
      const aVal = (a[sortBy] as number) || 0;
      const bVal = (b[sortBy] as number) || 0;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return data;
  }, [funds, catFilter, sortBy, sortDir, holdingSet]);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => (
    <span className="ml-0.5 inline-block">
      {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );

  return (
    <div>
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setCatFilter('All')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg tab-bounce ${catFilter === 'All' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
        >All ({funds.length})</button>
        {orderedCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg tab-bounce ${catFilter === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
          >{cat} ({funds.filter(f => f.category === cat).length})</button>
        ))}
      </div>

      <p className="text-xs text-gray-500 mb-3 tabular-nums">{filtered.length} funds • Sorted by {sortBy === 'returns1y' ? '1Y' : sortBy === 'returns3y' ? '3Y' : sortBy === 'returns5y' ? '5Y' : sortBy === 'nav' ? 'NAV' : 'Holdings'} ({sortDir === 'desc' ? 'high to low' : 'low to high'})</p>

      {/* Table Header */}
      <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 mb-2">
        <div className="col-span-1 text-center">#</div>
        <div className="col-span-3">Fund</div>
        <div className="col-span-1 text-center">
          <button onClick={() => handleSort('nav')} className="hover:text-blue-600 cursor-pointer">NAV<SortIcon col="nav" /></button>
        </div>
        <div className="col-span-1 text-center">
          <button onClick={() => handleSort('returns1y')} className="hover:text-blue-600 cursor-pointer">1Y<SortIcon col="returns1y" /></button>
        </div>
        <div className="col-span-1 text-center">
          <button onClick={() => handleSort('returns3y')} className="hover:text-blue-600 cursor-pointer">3Y<SortIcon col="returns3y" /></button>
        </div>
        <div className="col-span-1 text-center">
          <button onClick={() => handleSort('returns5y')} className="hover:text-blue-600 cursor-pointer">5Y<SortIcon col="returns5y" /></button>
        </div>
        <div className="col-span-1 text-center">Rating</div>
        <div className="col-span-1 text-center">Risk</div>
        <div className="col-span-1 text-center">
          <button onClick={() => handleSort('holdings')} className="hover:text-blue-600 cursor-pointer">Holdings<SortIcon col="holdings" /></button>
        </div>
      </div>

      {/* Mobile Sort */}
      <div className="md:hidden flex flex-wrap gap-2 mb-3">
        <span className="text-xs text-gray-500">Sort:</span>
        {(['nav', 'returns1y', 'returns3y', 'returns5y', 'holdings'] as const).map(col => (
          <button
            key={col}
            onClick={() => handleSort(col)}
            className={`text-xs px-2 py-1 rounded ${sortBy === col ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:text-blue-600'}`}
          >
            {col === 'nav' ? 'NAV' : col === 'returns1y' ? '1Y' : col === 'returns3y' ? '3Y' : col === 'returns5y' ? '5Y' : 'Portfolio'}
            {sortBy === col && (sortDir === 'desc' ? ' ↓' : ' ↑')}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {filtered.map((fund, i) => {
          const hasHold = holdingSet.has(fund.slug);
          return (
          <a
            key={fund.slug}
            href={`/mutual-funds/fund/${fund.slug}`}
            className="block p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all list-accent-hover"
          >
            {/* Desktop */}
            <div className="hidden md:grid grid-cols-12 gap-2 items-center">
              <div className="col-span-1 text-center text-xs text-gray-400">{i + 1}</div>
              <div className="col-span-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">{fund.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{fund.category} • {fund.aum}</p>
              </div>
              <div className="col-span-1 text-center">
                <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                  ₹{fund.nav?.toFixed(2) || '--'}
                </span>
              </div>
              <div className="col-span-1 text-center">
                <span className={`text-sm font-bold tabular-nums ${returnColor(fund.returns1y)}`}>
                  {formatReturn(fund.returns1y)}
                </span>
              </div>
              <div className="col-span-1 text-center">
                <span className={`text-sm font-bold tabular-nums ${returnColor(fund.returns3y)}`}>
                  {formatReturn(fund.returns3y)}
                </span>
              </div>
              <div className="col-span-1 text-center">
                <span className={`text-xs font-bold tabular-nums ${returnColor(fund.returns5y)}`}>
                  {formatReturn(fund.returns5y)}
                </span>
              </div>
              <div className="col-span-1 text-center">
                <div className="flex justify-center">
                  {fund.rating ? Array.from({ length: fund.rating }).map((_, j) => (
                    <svg key={j} className="w-2.5 h-2.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                  )) : <span className="text-xs text-gray-400">--</span>}
                </div>
              </div>
              <div className="col-span-1 text-center">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${
                  fund.riskLevel === 'low' ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                  fund.riskLevel === 'moderate' ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  fund.riskLevel === 'high' ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                  'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                }`}>{fund.riskLevel.replace('-', ' ')}</span>
              </div>
              <div className="col-span-1 text-center">
                {hasHold ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800">✓ Available</span>
                ) : (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Coming Soon</span>
                )}
              </div>
            </div>
            {/* Mobile */}
            <div className="md:hidden">
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{i+1}. {fund.name}</h3>
                <div className="flex items-center gap-1.5">
                  {hasHold && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">✓ Portfolio</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
                    fund.riskLevel === 'low' ? 'bg-green-50 text-green-600' :
                    fund.riskLevel === 'moderate' ? 'bg-yellow-50 text-yellow-600' :
                    fund.riskLevel === 'high' ? 'bg-orange-50 text-orange-600' :
                    'bg-red-50 text-red-600'
                  }`}>{fund.riskLevel.replace('-',' ')}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">{fund.category} • {fund.aum} • NAV ₹{fund.nav?.toFixed(2) || '--'}</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-gray-400">1Y</p>
                  <p className={`font-bold tabular-nums ${returnColor(fund.returns1y)}`}>{formatReturn(fund.returns1y)}</p>
                </div>
                <div>
                  <p className="text-gray-400">3Y</p>
                  <p className={`font-bold tabular-nums ${returnColor(fund.returns3y)}`}>{formatReturn(fund.returns3y)}</p>
                </div>
                <div>
                  <p className="text-gray-400">5Y</p>
                  <p className={`font-bold tabular-nums ${returnColor(fund.returns5y)}`}>{formatReturn(fund.returns5y)}</p>
                </div>
              </div>
            </div>
          </a>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-8 text-gray-500">No funds found for this filter.</p>
      )}
    </div>
  );
}
