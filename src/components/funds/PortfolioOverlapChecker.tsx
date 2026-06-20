import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeMultiFundOverlap,
  fundHasHoldings,
  type OverlapFund,
  type PortfolioOverlapData,
} from '../../lib/portfolio-overlap';
import { fetchJsonCached } from '../../lib/client-data';
import { applyClientPageMeta } from '../../lib/apply-client-page-meta';
import {
  comparisonPathFromSlugs,
  getPortfolioOverlapPageMeta,
  parseComparisonFromPathname,
} from '../../lib/portfolio-overlap-meta';

const DATA_URL = '/data/portfolio-overlap.json';
const MAX_FUNDS = 4;
const MIN_FUNDS = 2;

interface FundSlot {
  id: string;
  slug: string;
}

let slotSeq = 0;
function newSlot(): FundSlot {
  slotSeq += 1;
  return { id: `slot-${slotSeq}`, slug: '' };
}

function FundSearchSelect({
  funds,
  value,
  onChange,
  placeholder,
  excludeSlugs,
}: {
  funds: OverlapFund[];
  value: string;
  onChange: (slug: string) => void;
  placeholder: string;
  excludeSlugs: Set<string>;
}) {
  const [query, setQuery] = useState('');
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
    const q = query.trim().toLowerCase();
    return funds
      .filter((f) => !excludeSlugs.has(f.slug) || f.slug === value)
      .filter((f) => {
        if (!q) return true;
        return (
          f.name.toLowerCase().includes(q) ||
          f.amc.toLowerCase().includes(q) ||
          f.slug.includes(q.replace(/\s+/g, '-'))
        );
      })
      .slice(0, 12);
  }, [funds, query, excludeSlugs, value]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) onChange('');
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
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
                <span className="font-medium text-surface-900 dark:text-white block truncate">{f.name}</span>
                <span className="text-xs text-surface-500">{f.amc}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function createSlots(slugCount: number, slugs: string[] = []): FundSlot[] {
  const count = Math.max(MIN_FUNDS, Math.min(MAX_FUNDS, slugCount || MIN_FUNDS));
  return Array.from({ length: count }, (_, i) => ({
    id: newSlot().id,
    slug: slugs[i] || '',
  }));
}

function validSlugsFromData(data: PortfolioOverlapData, slugs: string[]): string[] {
  const known = new Set(data.funds.map((f) => f.slug));
  return slugs.filter((slug) => known.has(slug) && fundHasHoldings(data, slug));
}

interface Props {
  initialSlugs?: string[];
}

export default function PortfolioOverlapChecker({ initialSlugs = [] }: Props) {
  const [data, setData] = useState<PortfolioOverlapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<FundSlot[]>(() => createSlots(
    Math.max(initialSlugs.length, MIN_FUNDS),
    initialSlugs,
  ));
  const [result, setResult] = useState<ReturnType<typeof computeMultiFundOverlap>>(null);
  const [compared, setCompared] = useState(false);
  const [computing, setComputing] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const urlSyncReady = useRef(false);

  const fundNameBySlug = useMemo(() => {
    if (!data) return new Map<string, string>();
    return new Map(data.funds.map((f) => [f.slug, f.name]));
  }, [data]);

  const syncPageMeta = useCallback((slugs: string[]) => {
    if (!data) return;
    applyClientPageMeta(getPortfolioOverlapPageMeta(slugs, fundNameBySlug, data.month));
  }, [data, fundNameBySlug]);

  const syncUrl = useCallback((slugs: string[]) => {
    if (typeof window === 'undefined') return;
    const path = comparisonPathFromSlugs(slugs);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== path) {
      window.history.replaceState(null, '', path);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const slugs = parseComparisonFromPathname(window.location.pathname);
    if (slugs.length >= MIN_FUNDS) {
      setSlots(createSlots(slugs.length, slugs));
    }
    urlSyncReady.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onPopState = () => {
      const slugs = parseComparisonFromPathname(window.location.pathname);
      setSlots(createSlots(Math.max(slugs.length, MIN_FUNDS), slugs));
      setCompared(false);
      setResult(null);
      if (data) syncPageMeta(slugs);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [data, syncPageMeta]);

  useEffect(() => {
    if (!data || !urlSyncReady.current) return;

    const slugs = slots.map((s) => s.slug).filter(Boolean);
    const valid = validSlugsFromData(data, slugs);

    if (valid.length >= MIN_FUNDS) {
      syncUrl(valid);
      syncPageMeta(valid);
      return;
    }

    if (parseComparisonFromPathname(window.location.pathname).length > 0) {
      syncUrl([]);
      syncPageMeta([]);
    }
  }, [slots, data, syncUrl, syncPageMeta]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJsonCached<PortfolioOverlapData>(DATA_URL)
      .then((data) => {
        if (!cancelled) setData(data);
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
  }, [retryKey]);

  const selectedSlugs = useMemo(
    () => slots.map((s) => s.slug).filter(Boolean),
    [slots],
  );

  const fundsMissingHoldings = useMemo(() => {
    if (!data) return [];
    return slots
      .filter((s) => s.slug && !fundHasHoldings(data, s.slug))
      .map((s) => {
        const fund = data.funds.find((f) => f.slug === s.slug);
        return { slotId: s.id, slug: s.slug, name: fund?.name || s.slug };
      });
  }, [data, slots]);

  const validSelectedSlugs = useMemo(() => {
    if (!data) return [];
    return selectedSlugs.filter((slug) => fundHasHoldings(data, slug));
  }, [data, selectedSlugs]);

  const canCompare = validSelectedSlugs.length >= MIN_FUNDS && fundsMissingHoldings.length === 0;

  const excludeForSlot = useCallback(
    (slotId: string) => {
      const slug = slots.find((s) => s.id === slotId)?.slug;
      return new Set(slots.map((s) => s.slug).filter((s) => s && s !== slug));
    },
    [slots],
  );

  const handleCompare = () => {
    if (!data || !canCompare || computing) return;
    setComputing(true);
    setCompared(false);
    setResult(null);
    window.setTimeout(() => {
      setResult(computeMultiFundOverlap(validSelectedSlugs, data.holdings));
      setCompared(true);
      setComputing(false);
    }, 0);
  };

  const addFund = () => {
    if (slots.length >= MAX_FUNDS) return;
    setSlots((prev) => [...prev, newSlot()]);
    setCompared(false);
    setResult(null);
  };

  const removeFund = (id: string) => {
    if (slots.length <= MIN_FUNDS) return;
    setSlots((prev) => prev.filter((s) => s.id !== id));
    setCompared(false);
    setResult(null);
  };

  if (loading) {
    return <p className="text-center py-12 text-sm text-surface-500">Loading funds with portfolio data…</p>;
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-600">
          {error || 'No data'} — run <code className="text-xs">npm run export:client-data</code>
        </p>
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-surface-500 mb-4">
        Compare up to {MAX_FUNDS} funds with portfolio holdings ({data.month}). Only funds with disclosed holdings appear in search.
      </p>

      {fundsMissingHoldings.length > 0 && (
        <div
          className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3"
          role="alert"
        >
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Holdings not available for {data.month}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-100">
            {fundsMissingHoldings.map((f) => (
              <li key={f.slotId}>
                <strong>{f.name}</strong> — remove this fund and select another to compare.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4 mb-6">
        {slots.map((slot, i) => {
          const missing = slot.slug && data && !fundHasHoldings(data, slot.slug);
          const fundName = data.funds.find((f) => f.slug === slot.slug)?.name;
          return (
          <div key={slot.id} className="flex flex-col sm:flex-row sm:items-end gap-2">
            <div className="flex-1">
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-1.5">
                Fund {i + 1}
              </label>
              <FundSearchSelect
                funds={data.funds}
                value={slot.slug}
                onChange={(slug) => {
                  setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, slug } : s)));
                  setCompared(false);
                  setResult(null);
                }}
                placeholder="Search fund name or AMC…"
                excludeSlugs={excludeForSlot(slot.id)}
              />
              {missing && (
                <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  No holdings for {fundName || 'this fund'} ({data.month}). Remove or pick a different fund.
                </p>
              )}
            </div>
            {slots.length > MIN_FUNDS && (
              <button
                type="button"
                onClick={() => removeFund(slot.id)}
                className="px-3 py-2.5 text-sm text-surface-500 hover:text-red-600 border border-surface-200 dark:border-surface-600 rounded-lg"
              >
                Remove
              </button>
            )}
          </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <button
          type="button"
          onClick={handleCompare}
          disabled={!canCompare || computing}
          className="px-5 py-2.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {computing ? 'Comparing…' : 'Compare overlap'}
        </button>
        {slots.length < MAX_FUNDS && (
          <button
            type="button"
            onClick={addFund}
            className="px-5 py-2.5 text-sm font-medium rounded-lg border border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
          >
            + Add fund ({slots.length}/{MAX_FUNDS})
          </button>
        )}
      </div>

      {compared && result && (
        <div className="card p-5 md:p-6">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-1">Overlap</p>
            <p className="text-4xl font-bold text-primary-600 tabular-nums">{result.overlapPct}%</p>
            <p className="text-xs text-surface-400 mt-1">
              Based on {validSelectedSlugs.length} funds · {data.month} disclosure
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">
              Common holdings ({result.commonCount})
            </p>
            {result.commonHoldings.length > 0 ? (
              <p className="text-sm text-surface-800 dark:text-surface-200 leading-relaxed">
                {result.commonHoldings.join(', ')}
              </p>
            ) : (
              <p className="text-sm text-surface-500">No stocks in common across all selected funds.</p>
            )}
          </div>
        </div>
      )}

      {compared && !result && fundsMissingHoldings.length === 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Could not compute overlap — ensure each selected fund has holdings data for {data.month}.
        </p>
      )}
    </div>
  );
}
