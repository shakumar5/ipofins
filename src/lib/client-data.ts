/** Cached fetch for large static JSON payloads (smart money, etc.). */

const jsonCache = new Map<string, unknown>();

export async function fetchJsonCached<T>(url: string): Promise<T> {
  const cached = jsonCache.get(url);
  if (cached) return cached as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as T;
  jsonCache.set(url, data);
  return data;
}

export function monthFileSlug(month: string): string {
  return month.toLowerCase().replace(/\s+/g, '-');
}

export function monthDataUrl(basePath: string, month: string): string {
  return `${basePath}/${monthFileSlug(month)}.json`;
}
