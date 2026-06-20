/** Cached fetch for large static JSON payloads (smart money, etc.). */

const MAX_CACHE_ENTRIES = 5;
const FETCH_TIMEOUT_MS = 25_000;
const jsonCache = new Map<string, unknown>();

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Request timed out loading ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchJsonCached<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new Error('Request cancelled');
  const cached = jsonCache.get(url);
  if (cached) return cached as T;

  const res = await fetchWithTimeout(url, signal);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (signal?.aborted) throw new Error('Request cancelled');

  await yieldToMain();
  const data = JSON.parse(text) as T;
  await yieldToMain();

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
