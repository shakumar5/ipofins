import type { HoldingsCompareIndex } from './holdings-compare-client';

export const HOLDINGS_COMPARE_BOOTSTRAP_ID = 'holdings-compare-bootstrap';

export function readHoldingsCompareBootstrapFromDom(): HoldingsCompareIndex | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(HOLDINGS_COMPARE_BOOTSTRAP_ID);
  if (!el?.textContent?.trim()) return null;
  try {
    const parsed = JSON.parse(el.textContent) as HoldingsCompareIndex;
    if (!Array.isArray(parsed.months) || !Array.isArray(parsed.amcs) || parsed.amcs.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Prefer inline JSON (reliable), then Astro prop, for SSR/bootstrap. */
export function resolveHoldingsCompareIndex(
  propIndex?: HoldingsCompareIndex | null,
): HoldingsCompareIndex | null {
  const fromDom = readHoldingsCompareBootstrapFromDom();
  if (fromDom) return fromDom;
  if (propIndex?.amcs?.length && propIndex.months?.length) return propIndex;
  return null;
}
