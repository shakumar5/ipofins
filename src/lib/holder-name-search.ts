/**
 * Fuzzy investor-name search for 1% Club (SHP filing names are often "Surname First").
 */

/** Collapse filing-name variants (case, spacing, trailing dots). Client-safe duplicate of tracked-entities. */
export function normalizeHolderSearchKey(name: string): string {
  return String(name || '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const HOLDER_STOP_WORDS = new Set([
  'ltd',
  'limited',
  'pvt',
  'private',
  'pte',
  'llp',
  'the',
  'mr',
  'mrs',
  'ms',
  'dr',
  'shri',
  'smt',
  'kumar',
  'kumari',
]);

export interface HolderSearchOption {
  slug: string;
  name: string;
  entitySlug: string | null;
  profileUrl: string | null;
  stockCount: number;
}

/** Tokenize holder / query text for order-independent matching. */
export function holderNameTokens(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[.\-,()]/g, ' ')
    .replace(/\b(ltd|limited|pvt|private|pte|llp)\b/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !HOLDER_STOP_WORDS.has(t));
}

function tokensMatch(queryToken: string, nameToken: string): boolean {
  if (nameToken === queryToken) return true;
  if (nameToken.startsWith(queryToken) || queryToken.startsWith(nameToken)) return true;
  return false;
}

/** Every query token must match some name token (any order). */
export function holderTokensMatchQuery(name: string, query: string): boolean {
  const queryTokens = holderNameTokens(query);
  if (queryTokens.length === 0) return false;
  const nameTokens = holderNameTokens(name);
  if (nameTokens.length === 0) return false;
  return queryTokens.every((qt) => nameTokens.some((nt) => tokensMatch(qt, nt)));
}

export function holderMatchesSearchQuery(holder: HolderSearchOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return false;

  const name = holder.name.toLowerCase();
  if (name.includes(q)) return true;

  if (holder.entitySlug) {
    const slugSpaced = holder.entitySlug.replace(/-/g, ' ');
    if (slugSpaced.includes(q) || q.replace(/\s+/g, '-').includes(holder.entitySlug)) return true;
  }

  return holderTokensMatchQuery(holder.name, query);
}

function holderSearchRank(holder: HolderSearchOption, query: string): number {
  const q = query.trim().toLowerCase();
  const name = holder.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (holder.entitySlug && holder.entitySlug.replace(/-/g, ' ') === q) return 2;
  if (holderTokensMatchQuery(holder.name, query)) return 3;
  return 4;
}

function dedupeKey(holder: HolderSearchOption): string {
  if (holder.entitySlug) return `entity:${holder.entitySlug}`;
  return `name:${normalizeHolderSearchKey(holder.name)}`;
}

/** Drop lower-count mystery rows when a curated entity row matched the same person. */
function dedupeHolderResults<T extends HolderSearchOption>(matches: T[]): T[] {
  const curated = matches.filter((h) => h.entitySlug);
  const curatedTokenSets = curated.map((h) => new Set(holderNameTokens(h.name)));

  const seen = new Set<string>();
  const out: T[] = [];

  for (const h of matches) {
    const key = dedupeKey(h);
    if (seen.has(key)) continue;

    if (!h.entitySlug) {
      const tokens = new Set(holderNameTokens(h.name));
      const subsumed = curatedTokenSets.some((ct) => {
        if (ct.size < 2 || tokens.size < 2) return false;
        let overlap = 0;
        for (const t of tokens) if (ct.has(t)) overlap++;
        return overlap >= Math.min(tokens.size, ct.size);
      });
      if (subsumed) continue;
    }

    seen.add(key);
    out.push(h);
  }
  return out;
}

export function filterHolderSearchQuery<T extends HolderSearchOption>(
  query: string,
  holders: T[],
  limit = 12,
): T[] {
  const q = query.trim();
  if (q.length < 2) return [];

  return dedupeHolderResults(
    holders
      .filter((h) => holderMatchesSearchQuery(h, q))
      .sort(
        (a, b) =>
          holderSearchRank(a, q) - holderSearchRank(b, q) ||
          b.stockCount - a.stockCount ||
          a.name.localeCompare(b.name),
      ),
  ).slice(0, limit);
}
