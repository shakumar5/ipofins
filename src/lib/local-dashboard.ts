/** Browser-only localStorage helpers for the personal dashboard. */

export const WATCHLIST_KEY = 'ipofins-watchlist';
export const RECENTS_KEY = 'ipofins-recents';
export const CALCS_KEY = 'ipofins-calculations';

export interface RecentPage {
  url: string;
  title: string;
  ts: number;
}

export interface SavedCalculation {
  tool: string;
  summary: string;
  url?: string;
  ts: number;
}

function safeGet<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') as T | null;
  } catch {
    return null;
  }
}

function safeSet(key: string, val: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function getWatchlist(): string[] {
  return safeGet<string[]>(WATCHLIST_KEY) ?? [];
}

export function isInWatchlist(slug: string): boolean {
  return getWatchlist().includes(slug);
}

export function toggleWatchlist(slug: string): boolean {
  const list = getWatchlist();
  const next = list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
  safeSet(WATCHLIST_KEY, next);
  window.dispatchEvent(new CustomEvent('ipofins-watchlist-changed', { detail: { slug, added: !list.includes(slug) } }));
  return !list.includes(slug);
}

export function removeFromWatchlist(slug: string): void {
  safeSet(WATCHLIST_KEY, getWatchlist().filter((s) => s !== slug));
  window.dispatchEvent(new CustomEvent('ipofins-watchlist-changed', { detail: { slug, added: false } }));
}

export function trackRecentPage(url: string, title: string): void {
  if (!url || url.startsWith('/dashboard')) return;
  const recents = safeGet<RecentPage[]>(RECENTS_KEY) ?? [];
  const current: RecentPage = { url, title: title.split(' | ')[0] ?? title, ts: Date.now() };
  const next = [current, ...recents.filter((r) => r.url !== url)].slice(0, 10);
  safeSet(RECENTS_KEY, next);
}

export function getRecents(): RecentPage[] {
  return (safeGet<RecentPage[]>(RECENTS_KEY) ?? []).filter((r) => r.url !== '/dashboard');
}

export function saveCalculation(entry: Omit<SavedCalculation, 'ts'>): void {
  const calcs = safeGet<SavedCalculation[]>(CALCS_KEY) ?? [];
  const item: SavedCalculation = { ...entry, ts: Date.now() };
  const next = [item, ...calcs.filter((c) => c.url !== entry.url || c.summary !== entry.summary)].slice(0, 20);
  safeSet(CALCS_KEY, next);
}

export function getSavedCalculations(): SavedCalculation[] {
  return safeGet<SavedCalculation[]>(CALCS_KEY) ?? [];
}
