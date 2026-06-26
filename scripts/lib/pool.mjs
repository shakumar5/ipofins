/**
 * Bounded-concurrency async pool — map items with at most `concurrency` in flight.
 */
export async function mapPool(items, concurrency, fn) {
  if (!items.length) return [];
  const limit = Math.max(1, concurrency);
  const results = new Array(items.length);
  let nextIdx = 0;

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
