import { useMemo, useState } from 'react';
import { holderMatchesSearchQuery } from '../../lib/holder-name-search';
import type { HolderPosition } from '../../lib/one-percent-holder-positions';
import HolderHoldingsTable from './HolderHoldingsTable';
export interface CuratedOption {
  name: string;
  slug: string;
}

export interface HolderOption {
  slug: string;
  name: string;
  entitySlug: string | null;
  profileUrl: string | null;
  stockCount?: number;
  positions?: HolderPosition[];
}
interface Props {
  curated: CuratedOption[];
  holders: HolderOption[];
  stockBase?: string;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

type Result = {
  kind: 'curated' | 'holder';
  name: string;
  profileUrl: string | null;
  entitySlug: string | null;
  holder: HolderOption;
};

export default function CuratedInvestorSearch({  curated,
  holders,
  stockBase = '/1-percent-club',
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [expandedHolder, setExpandedHolder] = useState<HolderOption | null>(null);

  const q = norm(query);
  const results = useMemo((): Result[] => {
    if (!q) return [];

    const out: Result[] = [];
    const seen = new Set<string>();

    for (const c of curated) {
      const curatedMatch =
        norm(c.name).includes(q) ||
        c.slug.includes(q.replace(/\s+/g, '-')) ||
        holderMatchesSearchQuery(
          { slug: c.slug, name: c.name, entitySlug: c.slug, profileUrl: null, stockCount: 0 },
          query,
        );
      if (!curatedMatch) continue;
      const key = `c:${c.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const holder =
        holders.find((h) => h.entitySlug === c.slug) ??
        ({
          slug: c.slug,
          name: c.name,
          entitySlug: c.slug,
          profileUrl: `/super-investors/${c.slug}`,
          stockCount: 0,
          positions: [],
        } satisfies HolderOption);      out.push({ kind: 'curated', name: c.name, profileUrl: `/super-investors/${c.slug}`, entitySlug: c.slug, holder });
    }

    for (const h of holders) {
      if (
        !holderMatchesSearchQuery(
          {
            slug: h.slug,
            name: h.name,
            entitySlug: h.entitySlug,
            profileUrl: h.profileUrl,
            stockCount: h.stockCount ?? 0,
          },
          query,
        )
      ) {
        continue;
      }
      if (h.entitySlug && seen.has(`c:${h.entitySlug}`)) continue;
      const key = h.entitySlug ? `c:${h.entitySlug}` : `h:${h.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: 'holder',
        name: h.name,
        profileUrl: h.profileUrl,
        entitySlug: h.entitySlug,
        holder: h,
      });
    }

    return out.slice(0, 12);
  }, [q, curated, holders]);

  function selectResult(result: Result) {
    if (result.profileUrl) {
      window.location.href = result.profileUrl;
      return;
    }
    setExpandedHolder((prev) => (prev?.slug === result.holder.slug ? null : result.holder));
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (results[0]) selectResult(results[0]);
  }

  return (
    <div className="card max-w-3xl">
      <form onSubmit={onSubmit} className="relative">
        <label htmlFor="si-search" className="sr-only">
          Search curated super investors
        </label>
        <input
          id="si-search"
          type="search"
          autoComplete="off"
          placeholder="Search Dolly Khanna, Vijay Kedia, or any name in quarterly filings…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setExpandedHolder(null);
          }}
          onFocus={() => setOpen(true)}
          className="w-full px-4 py-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-white text-sm"
        />
        {open && results.length > 0 && (
          <ul
            className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg"
            role="listbox"
          >
            {results.map((r) => (
              <li key={`${r.kind}-${r.holder.slug}-${r.name}`}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-900 dark:text-white flex items-center justify-between gap-2"
                  onClick={() => selectResult(r)}
                >
                  <span>{r.name}</span>
                  <span className="text-[10px] uppercase tracking-wide shrink-0 text-surface-500 dark:text-surface-400">
                    {r.kind === 'curated' || (r.kind === 'holder' && r.entitySlug)
                      ? 'Portfolio'
                      : '1% Club'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
      {expandedHolder && !expandedHolder.profileUrl && (
        <div className="mt-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900">
          <p className="px-4 py-2 text-sm font-medium text-surface-900 dark:text-white border-b border-surface-100 dark:border-surface-800">
            {expandedHolder.name}
          </p>
          <HolderHoldingsTable
            positions={expandedHolder.positions ?? []}
            stockBase={stockBase}
          />        </div>
      )}
      <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">
        Curated investors open their portfolio page. Other names with ≥1% holdings show stock-level 1% Club links below.
      </p>
    </div>
  );
}
