import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { fetchJsonCached } from '../../lib/client-data';
import { fundHasHoldings, type OverlapFund, type PortfolioOverlapData } from '../../lib/portfolio-overlap';
import {
  buildSectorLookup,
  computeXRay,
  type UserHolding,
  type XRayResult,
} from '../../lib/mf-xray';
import { withErrorBoundary } from '../withErrorBoundary';

const OVERLAP_URL = '/data/portfolio-overlap.json';
const SECTOR_URL = '/data/smart-money-conviction.json';
const MAX_FUNDS = 8;

interface FundRow {
  id: string;
  slug: string;
  amount: number;
}

let rowSeq = 0;
function newRow(): FundRow {
  rowSeq += 1;
  return { id: `row-${rowSeq}`, slug: '', amount: 100000 };
}

function formatInr(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function FundSearchSelect({
  funds,
  value,
  onChange,
  excludeSlugs,
}: {
  funds: OverlapFund[];
  value: string;
  onChange: (slug: string) => void;
  excludeSlugs: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = funds.find((f) => f.slug === value);

  useEffect(() => {
    if (selected) setQuery(selected.name);
  }, [selected?.slug, selected?.name]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const options = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return funds
      .filter((f) => !excludeSlugs.has(f.slug) || f.slug === value)
      .filter((f) => !q || f.name.toLowerCase().includes(q) || f.amc.toLowerCase().includes(q))
      .slice(0, 12);
  }, [funds, deferredQuery, excludeSlugs, value]);

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) onChange('');
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search mutual fund…"
        className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 text-surface-900 dark:text-white"
        autoComplete="off"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-900 shadow-lg">
          {options.map((f) => (
            <li key={f.slug}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-800"
                onClick={() => {
                  onChange(f.slug);
                  setQuery(f.name);
                  setOpen(false);
                }}
              >
                <span className="font-medium block truncate">{f.name}</span>
                <span className="text-xs text-surface-500">{f.amc}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MFXRayInner() {
  const [overlapData, setOverlapData] = useState<PortfolioOverlapData | null>(null);
  const [sectorLookup, setSectorLookup] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FundRow[]>([newRow(), newRow()]);
  const [result, setResult] = useState<XRayResult | null>(null);
  const [analyzed, setAnalyzed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchJsonCached<PortfolioOverlapData>(OVERLAP_URL),
      fetchJsonCached<{ rows: { stockName: string; sector: string }[] }>(SECTOR_URL),
    ])
      .then(([overlap, conviction]) => {
        if (cancelled) return;
        setOverlapData(overlap);
        setSectorLookup(buildSectorLookup(conviction.rows ?? []));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'Failed to load fund data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fundsWithHoldings = useMemo(() => {
    if (!overlapData) return [];
    return overlapData.funds.filter((f) => fundHasHoldings(overlapData, f.slug));
  }, [overlapData]);

  const excludeForRow = useCallback(
    (rowId: string) => {
      const slug = rows.find((r) => r.id === rowId)?.slug;
      return new Set(rows.map((r) => r.slug).filter((s) => s && s !== slug));
    },
    [rows],
  );

  const validHoldings = useMemo((): UserHolding[] => {
    if (!overlapData) return [];
    return rows
      .filter((r) => r.slug && r.amount > 0 && fundHasHoldings(overlapData, r.slug))
      .map((r) => ({ fundSlug: r.slug, amount: r.amount }));
  }, [rows, overlapData]);

  const canAnalyze = validHoldings.length >= 1;

  const handleAnalyze = () => {
    if (!overlapData || !canAnalyze) return;
    const xray = computeXRay(validHoldings, overlapData, sectorLookup);
    setResult(xray);
    setAnalyzed(true);
  };

  const addRow = () => {
    if (rows.length >= MAX_FUNDS) return;
    setRows((prev) => [...prev, newRow()]);
    setAnalyzed(false);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    setAnalyzed(false);
  };

  if (loading) {
    return <p className="text-center py-12 text-sm text-surface-500">Loading fund holdings data…</p>;
  }

  if (error || !overlapData) {
    return (
      <p className="text-center py-12 text-sm text-red-600">
        {error || 'Fund data unavailable'}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-surface-200 dark:border-surface-700 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-surface-900 dark:text-white">Your Portfolio</h2>
          <span className="text-xs text-surface-500">Holdings as of {overlapData.month}</span>
        </div>

        {rows.map((row) => (
          <div key={row.id} className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <FundSearchSelect
              funds={fundsWithHoldings}
              value={row.slug}
              onChange={(slug) => {
                setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, slug } : r)));
                setAnalyzed(false);
              }}
              excludeSlugs={excludeForRow(row.id)}
            />
            <div className="flex items-center gap-2 sm:w-44 flex-shrink-0">
              <label className="sr-only" htmlFor={`amount-${row.id}`}>Investment amount</label>
              <span className="text-sm text-surface-500">₹</span>
              <input
                id={`amount-${row.id}`}
                type="number"
                min={1000}
                step={1000}
                value={row.amount}
                onChange={(e) => {
                  const amount = Math.max(0, Number(e.target.value) || 0);
                  setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, amount } : r)));
                  setAnalyzed(false);
                }}
                className="w-full px-3 py-2.5 text-sm border border-surface-200 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-900 font-mono"
              />
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="text-xs text-danger-600 hover:underline sm:w-16"
                aria-label="Remove fund"
              >
                Remove
              </button>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-2 pt-2">
          {rows.length < MAX_FUNDS && (
            <button type="button" onClick={addRow} className="btn-secondary px-4 py-2 text-sm">
              + Add Fund
            </button>
          )}
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            Analyze Portfolio
          </button>
        </div>
        <p className="text-xs text-surface-500">
          Enter current investment value per fund. Analysis runs entirely in your browser — nothing is uploaded.
        </p>
      </div>

      {analyzed && result && (
        <div className="space-y-6">
          {/* Risk metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Invested', value: formatInr(result.totalInvested) },
              { label: 'Top 5 Stocks', value: `${result.riskMetrics.top5Concentration}%` },
              { label: 'Top 10 Stocks', value: `${result.riskMetrics.top10Concentration}%` },
              { label: 'Unique Stocks', value: String(result.riskMetrics.uniqueStocks) },
            ].map((m) => (
              <div key={m.label} className="card-compact text-center">
                <p className="text-xs text-surface-500">{m.label}</p>
                <p className="text-lg font-bold font-mono text-surface-900 dark:text-white mt-1">{m.value}</p>
              </div>
            ))}
          </div>

          {/* Sector breakdown */}
          {result.sectorBreakdown.length > 0 && (
            <section>
              <h3 className="text-base font-semibold text-surface-900 dark:text-white mb-3">Sector Exposure</h3>
              <div className="space-y-2">
                {result.sectorBreakdown.slice(0, 12).map((s) => (
                  <div key={s.sector} className="flex items-center gap-3">
                    <span className="text-sm text-surface-700 dark:text-surface-300 w-40 truncate flex-shrink-0" title={s.sector}>
                      {s.sector}
                    </span>
                    <div className="flex-1 h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full"
                        style={{ width: `${Math.min(s.weightedPct * 2, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono font-semibold text-surface-800 dark:text-surface-200 w-12 text-right">
                      {s.weightedPct}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-surface-500 mt-2">Sectors mapped from Smart Money stock classifications where available.</p>
            </section>
          )}

          {/* Top stocks */}
          <section>
            <h3 className="text-base font-semibold text-surface-900 dark:text-white mb-3">Top Underlying Stocks</h3>
            <div className="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 dark:bg-surface-800/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-surface-600">Stock</th>
                    <th className="text-left px-3 py-2 font-medium text-surface-600">Sector</th>
                    <th className="text-right px-3 py-2 font-medium text-surface-600">Exposure</th>
                    <th className="text-right px-3 py-2 font-medium text-surface-600">Funds</th>
                  </tr>
                </thead>
                <tbody>
                  {result.topStocks.slice(0, 15).map((s) => (
                    <tr key={s.isin || s.name} className="border-t border-surface-100 dark:border-surface-800">
                      <td className="px-3 py-2 text-surface-900 dark:text-white">{s.name}</td>
                      <td className="px-3 py-2 text-surface-500 text-xs">{s.sector}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{s.weightedPct}%</td>
                      <td className="px-3 py-2 text-right text-surface-500">{s.fundCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Overlap matrix */}
          {result.overlapMatrix.length > 0 && (
            <section>
              <h3 className="text-base font-semibold text-surface-900 dark:text-white mb-3">Fund Overlap</h3>
              <div className="space-y-2">
                {result.overlapMatrix.map((pair) => (
                  <div key={`${pair.fundA}-${pair.fundB}`} className="card-compact flex items-center justify-between gap-3">
                    <p className="text-xs text-surface-700 dark:text-surface-300 truncate">
                      {pair.fundA} ↔ {pair.fundB}
                    </p>
                    <span className={`text-sm font-bold font-mono flex-shrink-0 ${pair.overlapPct > 40 ? 'text-warning-600' : 'text-primary-600'}`}>
                      {pair.overlapPct}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-surface-500 mt-2">
                High overlap ({'>'}40%) means funds hold many of the same stocks — consider diversifying.
              </p>
            </section>
          )}
        </div>
      )}

      <p className="text-xs text-surface-400">
        Portfolio X-Ray uses monthly MF holdings disclosures. Not investment advice. Past holdings may not reflect current allocations.
      </p>
    </div>
  );
}

export default withErrorBoundary(MFXRayInner, 'MF Portfolio X-Ray');
