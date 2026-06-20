/** Client-safe signals index types and URL helpers (no Node fs/path). */

import { categoryFileSlug, monthFileSlug } from './client-data';
import type { SmartMoneySignalType, SmartMoneySignalsData } from './smart-money-signals';

export const SIGNALS_INDEX_PUBLIC_PATH = '/data/smart-money-signals-index.json';
export const SIGNALS_CATEGORY_PUBLIC_BASE = '/data/smart-money-signals';

export type SignalsDataTier = 'list+detail+search' | 'by-category' | 'monolith';

export interface SignalsIndexDisk {
  months: string[];
  categories: string[];
  layout?: 'by-category' | 'monolith';
  scoringModel?: 'conviction-v2' | 'stock-cap-v2' | 'fund-scheme-v1';
  dataTier?: SignalsDataTier;
  exportedAt?: string;
}

/** Lightweight search index entry — one row per stock per month. */
export interface SignalSearchEntry {
  stockSlug: string;
  stockName: string;
  sector: string;
  category: string;
  convictionScore: number;
  signal: SmartMoneySignalType;
  nseSymbol?: string;
}

export interface SignalsSearchIndexFile {
  month: string;
  stocks: SignalSearchEntry[];
}

/** @deprecated Inline bootstrap removed — fetch /data/smart-money-signals-index.json client-side. */
export interface SmartMoneySignalsIndexBootstrap {
  index: SignalsIndexDisk;
  initialMonth: string;
}

/** @deprecated Full data bootstrap — too large for inline HTML; fetch JSON client-side. */
export interface SmartMoneySignalsBootstrap extends SmartMoneySignalsIndexBootstrap {
  data: SmartMoneySignalsData | null;
}

export function signalCategoryFileName(month: string, category: string): string {
  return `${monthFileSlug(month)}--${categoryFileSlug(category)}.json`;
}

export function signalCategoryDetailFileName(month: string, category: string): string {
  return `${monthFileSlug(month)}--${categoryFileSlug(category)}--detail.json`;
}

export function signalSearchFileName(month: string): string {
  return `${monthFileSlug(month)}--search.json`;
}

export function signalCategoryPublicUrl(month: string, category: string): string {
  return `${SIGNALS_CATEGORY_PUBLIC_BASE}/${signalCategoryFileName(month, category)}`;
}

export function signalCategoryDetailPublicUrl(month: string, category: string): string {
  return `${SIGNALS_CATEGORY_PUBLIC_BASE}/${signalCategoryDetailFileName(month, category)}`;
}

export function signalSearchPublicUrl(month: string): string {
  return `${SIGNALS_CATEGORY_PUBLIC_BASE}/${signalSearchFileName(month)}`;
}
