/** Client-safe signals index types and URL helpers (no Node fs/path). */

import { categoryFileSlug, monthFileSlug } from './client-data';
import type { SmartMoneySignalsData } from './smart-money-signals';

export const SIGNALS_INDEX_PUBLIC_PATH = '/data/smart-money-signals-index.json';
export const SIGNALS_CATEGORY_PUBLIC_BASE = '/data/smart-money-signals';

export interface SignalsIndexDisk {
  months: string[];
  categories: string[];
  layout?: 'by-category' | 'monolith';
  scoringModel?: 'conviction-v2' | 'stock-cap-v2' | 'fund-scheme-v1';
  exportedAt?: string;
}

export interface SmartMoneySignalsBootstrap {
  index: SignalsIndexDisk;
  initialMonth: string;
  data: SmartMoneySignalsData | null;
}

export function signalCategoryFileName(month: string, category: string): string {
  return `${monthFileSlug(month)}--${categoryFileSlug(category)}.json`;
}

export function signalCategoryPublicUrl(month: string, category: string): string {
  return `${SIGNALS_CATEGORY_PUBLIC_BASE}/${signalCategoryFileName(month, category)}`;
}
