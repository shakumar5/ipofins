import type { SastUpdatesPayload } from './sast-updates';

export const SAST_ALL_BOOTSTRAP_ID = 'sast-updates-all-bootstrap';

export function readSastAllBootstrapFromDom(): SastUpdatesPayload | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(SAST_ALL_BOOTSTRAP_ID);
  if (!el) return null;
  const raw = el.getAttribute('data-json') || el.textContent;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as SastUpdatesPayload;
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Prefer inline JSON (reliable), then Astro prop, for SSR/bootstrap. */
export function resolveSastAllBootstrap(prop?: SastUpdatesPayload | null): SastUpdatesPayload | null {
  const fromDom = readSastAllBootstrapFromDom();
  if (fromDom) return fromDom;
  if (prop && Array.isArray(prop.items)) return prop;
  return null;
}
