/** Canonical IPO name key — keep in sync with scripts/lib/ipo-utils.mjs */
export function ipoCanonicalKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*(limited|ltd|\.|ipo|india|pvt|private|company|technologies|industries|corporation|corp)\s*/gi, '')
    .replace(/[^a-z0-9]/g, '');
}

export function ipoNamesMatch(a: string, b: string): boolean {
  const n1 = ipoCanonicalKey(a);
  const n2 = ipoCanonicalKey(b);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  const short = n1.length < n2.length ? n1 : n2;
  const long = n1.length < n2.length ? n2 : n1;
  return short.length >= 10 && long.startsWith(short);
}

export function pickPreferredSlug(a: string, b: string): string {
  const slugs = [a, b].filter(Boolean);
  if (slugs.length <= 1) return slugs[0] ?? a;
  const noCompany = slugs.find((s) => !s.includes('-company'));
  if (noCompany) return noCompany;
  return [...slugs].sort((x, y) => x.length - y.length)[0];
}

/** Prefer fresher / richer row when two DB records map to the same company. */
export function pickPreferredIPO<T extends {
  slug: string;
  name: string;
  sector?: string;
  lastUpdated?: string;
  status?: string;
}>(a: T, b: T): T {
  const score = (x: T) => {
    let s = 0;
    if (x.sector?.trim()) s += 4;
    if (x.lastUpdated) s += 2;
    if (x.status === 'live' || x.status === 'open') s += 1;
    if (!x.slug.includes('-company')) s += 1;
    return s;
  };
  const winner = score(a) >= score(b) ? a : b;
  const loser = winner === a ? b : a;
  const slug = pickPreferredSlug(winner.slug, loser.slug);
  const name = winner.name.length <= loser.name.length ? winner.name : loser.name;
  return { ...loser, ...winner, slug, name };
}
