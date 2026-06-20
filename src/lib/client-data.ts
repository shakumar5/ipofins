/** Cached fetch for large static JSON payloads (smart money, etc.). */

const MAX_CACHE_ENTRIES = 5;
const jsonCache = new Map<string, unknown>();

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export async function fetchJsonCached<T>(url: string): Promise<T> {
  const cached = jsonCache.get(url);
  if (cached) return cached as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  await yieldToMain();
  const data = JSON.parse(text) as T;
  if (jsonCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = jsonCache.keys().next().value;
    if (oldest) jsonCache.delete(oldest);
  }
  jsonCache.set(url, data);
  return data;
}

export function monthFileSlug(month: string): string {
  return month.toLowerCase().replace(/\s+/g, '-');
}

export function categoryFileSlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function monthDataUrl(basePath: string, month: string): string {
  return `${basePath}/${monthFileSlug(month)}.json`;
}
