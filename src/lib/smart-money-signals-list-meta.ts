import type { PageMeta } from './page-meta';
import { withBrandSuffix } from './brand';
import { categoryFileSlug } from './client-data';
import { smartMoneyTabPath, getSmartMoneyPageMeta } from './smart-money-meta';
import type { SmartMoneySignalType } from './smart-money-signals';
import { SIGNAL_OPTIONS } from './smart-money-signals';
import { monthDisplay, monthSlug } from '../utils/month-slug';

export const SMART_MONEY_SIGNALS_LIST_BASE = smartMoneyTabPath('signals');

export interface SmartMoneySignalsListFilters {
  month: string;
  category: string;
  signal: SmartMoneySignalType | 'All';
}

export const DEFAULT_SIGNALS_LIST_FILTERS: Pick<SmartMoneySignalsListFilters, 'category' | 'signal'> = {
  category: 'All',
  signal: 'All',
};

const SIGNAL_SLUG_TO_TYPE = new Map<string, SmartMoneySignalType>();
for (const opt of SIGNAL_OPTIONS) {
  if (opt.value === 'All') continue;
  SIGNAL_SLUG_TO_TYPE.set(signalTypeSlug(opt.value), opt.value);
}

function isSignal(v: string | null): v is SmartMoneySignalType | 'All' {
  return SIGNAL_OPTIONS.some((o) => o.value === v);
}

export function signalTypeSlug(signal: SmartMoneySignalType): string {
  return signal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function signalTypeFromSlug(slug: string): SmartMoneySignalType | null {
  return SIGNAL_SLUG_TO_TYPE.get(slug) ?? null;
}

export function signalCategorySlug(category: string): string {
  return category === 'All' ? 'all' : categoryFileSlug(category);
}

export function signalCategoryFromSlug(slug: string, categories: string[]): string {
  if (slug === 'all') return 'All';
  return categories.find((c) => categoryFileSlug(c) === slug) ?? 'All';
}

/** @deprecated Legacy query URLs — use parseSmartMoneySignalsListFiltersFromPathname. */
export function parseSmartMoneySignalsListFiltersFromSearch(
  search: string,
  defaultMonth = '',
): SmartMoneySignalsListFilters {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const monthParam = params.get('month');
  const categoryParam = params.get('category');
  const signalParam = params.get('signal');
  return {
    month: monthParam || defaultMonth,
    category: categoryParam || DEFAULT_SIGNALS_LIST_FILTERS.category,
    signal: isSignal(signalParam) ? signalParam : DEFAULT_SIGNALS_LIST_FILTERS.signal,
  };
}

export function parseSmartMoneySignalsListFiltersFromPathname(
  pathname: string,
  categories: string[] = [],
  defaultMonth = '',
): SmartMoneySignalsListFilters | null {
  const prefix = `${SMART_MONEY_SIGNALS_LIST_BASE}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).replace(/\/$/, '');
  if (!rest) return null;

  const parts = rest.split('/').filter(Boolean);
  if (!parts.length) return null;

  const month = monthDisplay(parts[0]);
  const category =
    parts.length >= 2 ? signalCategoryFromSlug(parts[1], categories) : DEFAULT_SIGNALS_LIST_FILTERS.category;
  const signal =
    parts.length >= 3
      ? signalTypeFromSlug(parts[2]) ?? DEFAULT_SIGNALS_LIST_FILTERS.signal
      : DEFAULT_SIGNALS_LIST_FILTERS.signal;

  return {
    month: month || defaultMonth,
    category,
    signal,
  };
}

export function smartMoneySignalsListPath(filters: Partial<SmartMoneySignalsListFilters> = {}): string {
  const month = filters.month;
  const category = filters.category ?? DEFAULT_SIGNALS_LIST_FILTERS.category;
  const signal = filters.signal ?? DEFAULT_SIGNALS_LIST_FILTERS.signal;

  if (!month) return SMART_MONEY_SIGNALS_LIST_BASE;

  const segments = [monthSlug(month)];
  if (category !== 'All') {
    segments.push(signalCategorySlug(category));
    if (signal !== 'All') {
      segments.push(signalTypeSlug(signal));
    }
  } else if (signal !== 'All') {
    segments.push('all', signalTypeSlug(signal));
  }

  return `${SMART_MONEY_SIGNALS_LIST_BASE}/${segments.join('/')}`;
}

export function getSmartMoneySignalsListPageMeta(filters: SmartMoneySignalsListFilters): PageMeta {
  const base = getSmartMoneyPageMeta('signals');
  const parts: string[] = [];
  if (filters.category && filters.category !== 'All') parts.push(filters.category);
  if (filters.signal && filters.signal !== 'All') parts.push(filters.signal);
  if (filters.month) parts.push(filters.month);

  if (!parts.length) return base;

  const label = parts.join(' · ');
  return {
    ...base,
    title: withBrandSuffix(`${label} — Smart Money Signal`),
    description: `Mutual fund conviction scores for ${label}. Ranked 0–100 with institutional buy/sell signals from AMC disclosures.`,
    path: smartMoneySignalsListPath(filters),
    heading: base.heading,
    subtitle: `Filtered view: ${label}`,
  };
}
