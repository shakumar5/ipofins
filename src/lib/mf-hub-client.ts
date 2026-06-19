import { fetchJsonCached } from './client-data';
import type { MfHubFundRow } from './mf-hub-build';

export interface MfHubMeta {
  categories: string[];
  bestFundsCount: number;
  totalFunds: number;
  holdingsCount: number;
  dataDate: string;
  amcCount: number;
  fundCount: number;
  latestMonth: string;
}

export function loadMfHubMeta(): Promise<MfHubMeta> {
  return fetchJsonCached<MfHubMeta>('/data/mf-hub/meta.json');
}

export function loadMfHubFunds(table: 'best' | 'all'): Promise<MfHubFundRow[]> {
  return fetchJsonCached<MfHubFundRow[]>(`/data/mf-hub/${table}.json`);
}
