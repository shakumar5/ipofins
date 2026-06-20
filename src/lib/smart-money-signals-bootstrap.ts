import { seedJsonCache } from './client-data';
import type { SmartMoneySignalsData } from './smart-money-signals';
import {
  SIGNALS_INDEX_PUBLIC_PATH,
  signalCategoryPublicUrl,
  type SignalsIndexDisk,
  type SmartMoneySignalsBootstrap,
} from './smart-money-signals-meta';

export const SMART_MONEY_SIGNALS_INDEX_BOOTSTRAP_ID = 'smart-money-signals-index-bootstrap';
export const SMART_MONEY_SIGNALS_DATA_BOOTSTRAP_ID = 'smart-money-signals-data-bootstrap';

export function readSignalsIndexBootstrapFromDom(): SignalsIndexDisk | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(SMART_MONEY_SIGNALS_INDEX_BOOTSTRAP_ID);
  if (!el) return null;
  const raw = el.getAttribute('data-json') || el.textContent;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as SignalsIndexDisk;
    if (!parsed.months?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveSignalsIndexBootstrap(
  propIndex?: SignalsIndexDisk | null,
): SignalsIndexDisk | null {
  const fromDom = readSignalsIndexBootstrapFromDom();
  if (fromDom) return fromDom;
  if (propIndex?.months?.length) return propIndex;
  return null;
}

export function readSignalsDataBootstrapFromDom(): SmartMoneySignalsData | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(SMART_MONEY_SIGNALS_DATA_BOOTSTRAP_ID);
  if (!el) return null;
  const raw = el.getAttribute('data-json') || el.textContent;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as SmartMoneySignalsData;
    if (!parsed.months?.length || !parsed.rows?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveSignalsDataBootstrap(
  propData?: SmartMoneySignalsData | null,
): SmartMoneySignalsData | null {
  const fromDom = readSignalsDataBootstrapFromDom();
  if (fromDom) return fromDom;
  if (propData?.months?.length && propData.rows?.length) return propData;
  return null;
}

/** Seed client JSON cache from inline bootstrap so fetches skip the network. */
export function seedSignalsJsonCache(bootstrap: SmartMoneySignalsBootstrap | null): void {
  if (!bootstrap) return;

  seedJsonCache(SIGNALS_INDEX_PUBLIC_PATH, bootstrap.index);

  const month = bootstrap.initialMonth;
  if (!month) return;

  for (const category of bootstrap.index.categories) {
    const rows = bootstrap.data?.rows.filter(
      (r) => r.month === month && r.category === category,
    );
    if (!rows?.length) continue;
    seedJsonCache(signalCategoryPublicUrl(month, category), {
      month,
      category,
      rows,
    });
  }
}
