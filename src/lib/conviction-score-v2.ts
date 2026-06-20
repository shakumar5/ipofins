/** Conviction Score v2.0 — absolute component scoring with cap multipliers. */

import type { StockCapCategory } from './smart-money-signals';
import { normalizeStockCapCategory } from './smart-money-signals';

export const V2_FACTOR_MAX = {
  netFundActivity: 25,
  freshEntry: 20,
  exitPenalty: 15,
  amcParticipation: 15,
  trend: 15,
  netWeightChange: 10,
} as const;

export interface ConvictionV2Input {
  increasedCount: number;
  decreasedCount: number;
  freshEntries: number;
  completeExits: number;
  fundsHolding: number;
  amcsBuying: number;
  totalActiveAmcs: number;
  consecutivePositiveMonths: number;
  netWeightChangePct: number;
  category: string;
}

export interface ConvictionV2FactorDetail {
  raw: number;
  detail: string;
  points: number;
  maxPoints: number;
}

export interface ConvictionV2Result {
  rawTotal: number;
  capMultiplier: number;
  convictionScore: number;
  factorScores: {
    netFundActivity: number;
    freshEntry: number;
    exitPenalty: number;
    amcParticipation: number;
    trend: number;
    netWeightChange: number;
  };
  factorBreakdown: {
    netFundActivity: ConvictionV2FactorDetail;
    freshEntry: ConvictionV2FactorDetail;
    exitPenalty: ConvictionV2FactorDetail;
    amcParticipation: ConvictionV2FactorDetail;
    trend: ConvictionV2FactorDetail;
    netWeightChange: ConvictionV2FactorDetail;
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Large 1.0 · Mid 1.3 · Small/Micro 1.8 · Unknown 1.0 */
export function capCategoryMultiplier(category: string): number {
  const cap = normalizeStockCapCategory(category);
  if (cap === 'Mid Cap') return 1.3;
  if (cap === 'Small Cap' || cap === 'Micro Cap') return 1.8;
  return 1.0;
}

/** Component 1 — Net Fund Activity (max 25). Edge / negative → 0. */
export function scoreNetFundActivity(increased: number, decreased: number): number {
  const sum = increased + decreased;
  if (sum <= 0) return 0;
  const ratio = (increased - decreased) / sum;
  if (ratio <= 0) return 0;
  return Math.min(V2_FACTOR_MAX.netFundActivity, ratio * V2_FACTOR_MAX.netFundActivity);
}

/** Component 2 — Fresh Entry (max 20). Denominator = funds holding after month. */
export function scoreFreshEntry(fresh: number, fundsHolding: number): number {
  if (fresh <= 0 || fundsHolding <= 0) return 0;
  return Math.min(V2_FACTOR_MAX.freshEntry, (fresh / fundsHolding) * V2_FACTOR_MAX.freshEntry);
}

/**
 * Component 3 — Exit penalty (max 15).
 * Linear: 15 × (1 − exits / priorHolders) where priorHolders = endHolding + exits.
 */
export function scoreExitPenalty(completeExits: number, fundsHolding: number): number {
  if (completeExits <= 0) return V2_FACTOR_MAX.exitPenalty;
  const priorHolders = fundsHolding + completeExits;
  if (priorHolders <= 0) return 0;
  const ratio = completeExits / priorHolders;
  return Math.max(0, V2_FACTOR_MAX.exitPenalty * (1 - ratio));
}

/** Component 4 — AMC participation (max 15). */
export function scoreAmcParticipation(amcsBuying: number, totalActiveAmcs: number): number {
  if (amcsBuying <= 0 || totalActiveAmcs <= 0) return 0;
  return Math.min(
    V2_FACTOR_MAX.amcParticipation,
    (amcsBuying / totalActiveAmcs) * V2_FACTOR_MAX.amcParticipation,
  );
}

/** Component 5 — Trend consistency (discrete table). */
export function scoreTrend(consecutiveMonths: number): number {
  if (consecutiveMonths >= 5) return 15;
  if (consecutiveMonths === 4) return 12;
  if (consecutiveMonths === 3) return 9;
  if (consecutiveMonths === 2) return 6;
  if (consecutiveMonths === 1) return 3;
  return 0;
}

/** Component 6 — Net weight change tiers (max 10). Negative → 0. */
export function scoreNetWeightChange(pct: number): number {
  if (pct <= 0) return 0;
  if (pct > 20) return 10;
  if (pct > 10) return 8;
  if (pct > 5) return 6;
  if (pct > 2) return 4;
  return 2;
}

export function computeConvictionScoreV2(input: ConvictionV2Input): ConvictionV2Result {
  const fundsHolding = Math.max(0, input.fundsHolding);

  const netFundActivity = scoreNetFundActivity(input.increasedCount, input.decreasedCount);
  const freshEntry = scoreFreshEntry(input.freshEntries, fundsHolding);
  const exitPenalty = scoreExitPenalty(input.completeExits, fundsHolding);
  const amcParticipation = scoreAmcParticipation(input.amcsBuying, input.totalActiveAmcs);
  const trend = scoreTrend(input.consecutivePositiveMonths);
  const netWeightChange = scoreNetWeightChange(input.netWeightChangePct);

  const factorScores = {
    netFundActivity: round1(netFundActivity),
    freshEntry: round1(freshEntry),
    exitPenalty: round1(exitPenalty),
    amcParticipation: round1(amcParticipation),
    trend: round1(trend),
    netWeightChange: round1(netWeightChange),
  };

  const rawTotal = round1(
    factorScores.netFundActivity +
      factorScores.freshEntry +
      factorScores.exitPenalty +
      factorScores.amcParticipation +
      factorScores.trend +
      factorScores.netWeightChange,
  );

  const capMultiplier = capCategoryMultiplier(input.category);
  const convictionScore = Math.min(100, round1(rawTotal * capMultiplier));

  const activityDenom = input.increasedCount + input.decreasedCount;
  const activityRatio = activityDenom > 0 ? (input.increasedCount - input.decreasedCount) / activityDenom : 0;
  const priorHolders = fundsHolding + input.completeExits;

  return {
    rawTotal,
    capMultiplier,
    convictionScore,
    factorScores,
    factorBreakdown: {
      netFundActivity: {
        raw: round1(activityRatio * 100),
        detail: `${input.increasedCount} increased − ${input.decreasedCount} reduced / ${activityDenom} active`,
        points: factorScores.netFundActivity,
        maxPoints: V2_FACTOR_MAX.netFundActivity,
      },
      freshEntry: {
        raw: input.freshEntries,
        detail: `${input.freshEntries} fresh / ${fundsHolding} funds holding`,
        points: factorScores.freshEntry,
        maxPoints: V2_FACTOR_MAX.freshEntry,
      },
      exitPenalty: {
        raw: input.completeExits,
        detail:
          input.completeExits === 0
            ? 'No complete exits'
            : `${input.completeExits} exits / ${priorHolders} prior holders`,
        points: factorScores.exitPenalty,
        maxPoints: V2_FACTOR_MAX.exitPenalty,
      },
      amcParticipation: {
        raw: input.amcsBuying,
        detail: `${input.amcsBuying} AMCs buying / ${input.totalActiveAmcs} active AMCs`,
        points: factorScores.amcParticipation,
        maxPoints: V2_FACTOR_MAX.amcParticipation,
      },
      trend: {
        raw: input.consecutivePositiveMonths,
        detail: `${input.consecutivePositiveMonths} consecutive month(s) — all holders increased weight`,
        points: factorScores.trend,
        maxPoints: V2_FACTOR_MAX.trend,
      },
      netWeightChange: {
        raw: round1(input.netWeightChangePct),
        detail: `${input.netWeightChangePct >= 0 ? '+' : ''}${round1(input.netWeightChangePct)}% aggregate MoM`,
        points: factorScores.netWeightChange,
        maxPoints: V2_FACTOR_MAX.netWeightChange,
      },
    },
  };
}

export function capBucketLabel(category: string): StockCapCategory {
  return normalizeStockCapCategory(category);
}
