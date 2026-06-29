/**
 * Client-safe helpers for tracked-entity UI islands.
 * Do not import tracked-entities.ts here — it pulls Neon/sql into the browser bundle.
 */

import type { StockShareholdingDetail } from './tracked-entities';

export const SUPER_INVESTORS_HUB = '/super-investors';
export const ONE_PERCENT_CLUB_HUB = '/1-percent-club';

export type StockEmptyStateKind =
  | 'not_indexed'
  | 'not_indexed_mf_available'
  | 'no_institutional_radar'
  | 'no_institutional_radar_mf_available';

export interface StockEmptyStateContent {
  kind: StockEmptyStateKind;
  headline: string;
  body: string;
  footnote: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}

const SHP_DISCLOSURE_FOOTNOTE =
  'Based on SEBI quarterly Shareholding Pattern filings — holdings below 1% are not disclosed by name.';

export function hasSmartMoneyRadarInterest(
  detail: Pick<StockShareholdingDetail, 'fii' | 'mutualFunds' | 'dii' | 'superInvestors' | 'summary'>,
): boolean {
  if (detail.fii.length || detail.mutualFunds.length || detail.dii.length || detail.superInvestors.length) {
    return true;
  }
  if (detail.summary.dataQuality === 'verified') {
    const institutional =
      (detail.summary.fiiPct ?? 0) + (detail.summary.mfPct ?? 0) + (detail.summary.diiExMfPct ?? 0);
    return institutional > 0.01;
  }
  return false;
}

export function hasCuratedSuperInvestorInterest(
  detail: Pick<StockShareholdingDetail, 'superInvestors'>,
): boolean {
  return detail.superInvestors.length > 0;
}

export function getStockEmptyStateContent(options: {
  stockName?: string;
  mfStockSignalUrl?: string | null;
  context: 'search' | 'page';
}): StockEmptyStateContent {
  const name = options.stockName?.trim();
  const label = name || 'This stock';
  const mfUrl = options.mfStockSignalUrl?.trim() || null;
  const hasMf = Boolean(mfUrl);

  if (options.context === 'search') {
    if (hasMf) {
      return {
        kind: 'not_indexed_mf_available',
        headline: `No 1% Club page for ${label}`,
        body: `We don't have Shareholding Pattern holder data for ${label} in the 1% Club yet — but mutual funds are actively tracked. See institutional conviction from AMC disclosures instead.`,
        footnote: SHP_DISCLOSURE_FOOTNOTE,
        primaryCta: { label: `View ${label} MF Stock Signal`, href: mfUrl! },
        secondaryCta: { label: 'Browse 1% Club stocks', href: ONE_PERCENT_CLUB_HUB },
      };
    }
    return {
      kind: 'not_indexed',
      headline: name ? `No 1% Club data for ${name}` : 'No matching stock in our 1% Club',
      body: name
        ? `We don't track ${name} yet, or no mutual fund, DII, FII, or super investor holds ≥1% in the latest quarter we have on file.`
        : 'We could not find this stock in the 1% Club. Try another spelling, or check back after the next quarterly SHP update.',
      footnote: SHP_DISCLOSURE_FOOTNOTE,
      secondaryCta: { label: 'Browse super investors', href: SUPER_INVESTORS_HUB },
    };
  }

  if (hasMf) {
    return {
      kind: 'no_institutional_radar_mf_available',
      headline: 'Not on the institutional radar',
      body: `In the latest Shareholding Pattern filing, ${label} has no disclosed ≥1% stake from mutual funds, DII, FII, or our curated super investors. Mutual fund activity may still show up in monthly AMC disclosures.`,
      footnote: SHP_DISCLOSURE_FOOTNOTE,
      primaryCta: { label: `View ${label} MF Stock Signal`, href: mfUrl! },
      secondaryCta: { label: 'Browse super investors', href: SUPER_INVESTORS_HUB },
    };
  }

  return {
    kind: 'no_institutional_radar',
    headline: 'Not on the institutional radar',
    body: `In the latest Shareholding Pattern filing, ${label} has no disclosed ≥1% stake from mutual funds, DII, FII, or our curated super investors.`,
    footnote: SHP_DISCLOSURE_FOOTNOTE,
    secondaryCta: { label: 'Browse 1% Club stocks', href: ONE_PERCENT_CLUB_HUB },
  };
}

/** Profile link for curated entities shown on stock detail tables. */
export function curatedEntityUrl(entitySlug: string | null | undefined): string | null {
  if (!entitySlug) return null;
  return `${SUPER_INVESTORS_HUB}/${entitySlug}`;
}

export function onePercentHolderUrl(holderSlug: string): string {
  return `${ONE_PERCENT_CLUB_HUB}/holder/${holderSlug}`;
}

export function slugifyEntity(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
}

export function holderDetailUrl(holder: { holderName: string; entitySlug?: string | null }): string | null {
  if (!holder.holderName?.trim() && !holder.entitySlug) return null;
  const slug = holder.entitySlug || slugifyEntity(holder.holderName);
  return slug ? onePercentHolderUrl(slug) : null;
}