import { useMemo, useState } from 'react';

export interface CuratedOption {
  name: string;
  slug: string;
}

export interface HolderOption {
  slug: string;
  name: string;
  entitySlug: string | null;
}

interface Props {
  curated: CuratedOption[];
  holders: HolderOption[];
  superInvestorBase: string;
  holderBase: string;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

type Result =
  | { kind: 'curated'; name: string; slug: string }
  | { kind: 'holder'; name: string; slug: string; entitySlug: string | null };

export default function CuratedInvestorSearch({
  curated,
  holders,
  superInvestorBase,
  holderBase,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const q = norm(query);

  const results = useMemo((): Result[] => {
    if (!q) return [];

    const out: Result[] = [];
    const seen = new Set<string>();

    for (const c of curated) {
      if (!norm(c.name).includes(q) && !c.slug.includes(q.replace(/\s+/g, '-'))) continue;
      const key = `c:${c.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: 'curated', name: c.name, slug: c.slug });
    }

    for (const h of holders) {
      if (!norm(h.name).includes(q)) continue;
      if (h.entitySlug && seen.has(`c:${h.entitySlug}`)) continue;
      const key = h.entitySlug ? `c:${h.entitySlug}` : `h:${h.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: 'holder', name: h.name, slug: h.slug, entitySlug: h.entitySlug });
    }

    return out.slice(0, 12);
  }, [q, curated, holders]);

  function go(result: Result) {
    if (result.kind === 'curated') {
      window.location.href = `${superInvestorBase}/${result.slug}`;
      return;
    }
    if (result.entitySlug) {
      window.location.href = `${superInvestorBase}/${result.entitySlug}`;
      return;
    }
    window.location.href = `${holderBase}/${result.slug}`;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (results[0]) go(results[0]);
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
              <li key={`${r.kind}-${r.kind === 'curated' ? r.slug : r.slug}-${r.name}`}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-900 dark:text-white flex items-center justify-between gap-2"
                  onClick={() => go(r)}
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
      <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">
        Curated investors open their portfolio page. Other names with ≥1% holdings link to their 1% Club
        disclosure list.
      </p>
    </div>
  );
}
