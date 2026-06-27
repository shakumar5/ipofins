/** Client-safe types for the weekly SAST updates JSON feed. */

export type SastTransactionNature = 'acquisition' | 'disposal' | 'other';

export interface SastUpdateItem {
  id: string;
  filingDate: string;
  exchange: 'BSE' | 'NSE' | null;
  stockName: string;
  stockSlug: string | null;
  nseSymbol: string | null;
  filerName: string;
  entitySlug: string | null;
  entityDisplayName: string | null;
  matchConfidence: number | null;
  prePct: number | null;
  postPct: number | null;
  transactionNature: SastTransactionNature;
  sourceUrl: string | null;
  isCuratedMatch: boolean;
  firstSeenAt: string;
}

export interface SastUpdatesPayload {
  generatedAt: string;
  lookbackDays: number;
  historyDays: number;
  curatedMatchCount: number;
  totalCount: number;
  newThisRun?: number;
  curatedNewThisRun?: number;
  items: SastUpdateItem[];
}

/** Full 90-day feed (lazy-loaded when user opens "All filings"). */
export const SAST_UPDATES_DATA_URL = '/data/sast-updates.json';

/** Small curated-only feed (SSR + default tab). */
export const SAST_UPDATES_CURATED_URL = '/data/sast-updates-curated.json';
