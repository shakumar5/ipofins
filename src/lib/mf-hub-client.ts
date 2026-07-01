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

function hubCacheBust(meta: MfHubMeta | null | undefined): string {
  if (!meta?.dataDate || meta.dataDate === 'N/A') return '';
  return `?v=${encodeURIComponent(meta.dataDate.replace(/\s+/g, '-'))}`;
}

export async function loadMfHubFunds(table: 'best' | 'all'): Promise<MfHubFundRow[]> {
  const meta = await loadMfHubMeta().catch(() => null);
  return fetchJsonCached<MfHubFundRow[]>(`/data/mf-hub/${table}.json${hubCacheBust(meta)}`);
}

export function holdingsMetaUrl(meta?: MfHubMeta | null): string {
  return `/data/fund-holdings-meta.json${hubCacheBust(meta)}`;
}

export function holdingsAliasesUrl(meta?: MfHubMeta | null): string {
  return `/data/fund-holdings-aliases.json${hubCacheBust(meta)}`;
}
