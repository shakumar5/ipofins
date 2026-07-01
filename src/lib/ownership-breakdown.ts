import type { OnePercentRow, ShpCategorySummary, StockShareholdingDetail } from './tracked-entities';
import { toNum } from './tracked-display';

export interface OwnershipSegment {
  key: string;
  label: string;
  pct: number;
  colorClass: string;
}

export const OWNERSHIP_SEGMENT_COLORS: Record<string, string> = {
  promoters: 'bg-amber-500',
  fii: 'bg-blue-500',
  mf: 'bg-violet-500',
  dii: 'bg-teal-500',
  retail: 'bg-surface-400 dark:bg-surface-500',
};

function sumHolderPct(rows: OnePercentRow[]): number {
  return rows.reduce((s, h) => s + (h.pctOfCompany ?? 0), 0);
}

export function buildVerifiedOwnershipSegments(summary: ShpCategorySummary): OwnershipSegment[] {
  if (summary.dataQuality !== 'verified') return [];
  return [
    { key: 'promoters', label: 'Promoters', pct: summary.promoterPct, colorClass: OWNERSHIP_SEGMENT_COLORS.promoters! },
    { key: 'fii', label: 'FII', pct: summary.fiiPct, colorClass: OWNERSHIP_SEGMENT_COLORS.fii! },
    { key: 'mf', label: 'Mutual Funds', pct: summary.mfPct, colorClass: OWNERSHIP_SEGMENT_COLORS.mf! },
    { key: 'dii', label: 'DII (ex-MF)', pct: summary.diiExMfPct, colorClass: OWNERSHIP_SEGMENT_COLORS.dii! },
    { key: 'retail', label: 'Retail & others', pct: summary.retailPct, colorClass: OWNERSHIP_SEGMENT_COLORS.retail! },
  ]
    .map((s) => ({ ...s, pct: toNum(s.pct) ?? 0 }))
    .filter((s) => s.pct > 0.01);
}

export function buildEstimatedOwnershipSegments(
  detail: Pick<StockShareholdingDetail, 'promoters' | 'fii' | 'mutualFunds' | 'dii' | 'superInvestors' | 'onePercentClub'>,
): OwnershipSegment[] {
  const promoterPct = sumHolderPct(detail.promoters);
  const fiiPct = sumHolderPct(detail.fii);
  const mfPct = sumHolderPct(detail.mutualFunds);
  const diiPct = sumHolderPct(detail.dii);
  const namedOtherPct = sumHolderPct(detail.superInvestors) + sumHolderPct(detail.onePercentClub);
  const namedTotal = promoterPct + fiiPct + mfPct + diiPct + namedOtherPct;
  const retailPct = namedTotal > 0 && namedTotal < 99.5 ? Math.max(0, 100 - namedTotal) : 0;

  return [
    { key: 'promoters', label: 'Promoters', pct: promoterPct, colorClass: OWNERSHIP_SEGMENT_COLORS.promoters! },
    { key: 'fii', label: 'FII', pct: fiiPct, colorClass: OWNERSHIP_SEGMENT_COLORS.fii! },
    { key: 'mf', label: 'Mutual Funds', pct: mfPct, colorClass: OWNERSHIP_SEGMENT_COLORS.mf! },
    { key: 'dii', label: 'DII (ex-MF)', pct: diiPct, colorClass: OWNERSHIP_SEGMENT_COLORS.dii! },
    { key: 'retail', label: 'Retail & others (est.)', pct: retailPct, colorClass: OWNERSHIP_SEGMENT_COLORS.retail! },
  ].filter((s) => s.pct > 0.01);
}

export type OwnershipBreakdownMode = 'verified' | 'estimated' | 'none';

export function getOwnershipBreakdown(detail: StockShareholdingDetail): {
  segments: OwnershipSegment[];
  mode: OwnershipBreakdownMode;
  chartTotal: number;
  superInvestorTotalPct: number;
  onePercentClubTotalPct: number;
} {
  const superInvestorTotalPct = sumHolderPct(detail.superInvestors);
  const onePercentClubTotalPct = sumHolderPct(detail.onePercentClub);

  const verified = buildVerifiedOwnershipSegments(detail.summary);
  if (verified.length > 0) {
    return {
      segments: verified,
      mode: 'verified',
      chartTotal: verified.reduce((s, x) => s + x.pct, 0),
      superInvestorTotalPct,
      onePercentClubTotalPct,
    };
  }

  const estimated = buildEstimatedOwnershipSegments(detail);
  if (estimated.length > 0) {
    return {
      segments: estimated,
      mode: 'estimated',
      chartTotal: estimated.reduce((s, x) => s + x.pct, 0),
      superInvestorTotalPct,
      onePercentClubTotalPct,
    };
  }

  return {
    segments: [],
    mode: 'none',
    chartTotal: 0,
    superInvestorTotalPct,
    onePercentClubTotalPct,
  };
}