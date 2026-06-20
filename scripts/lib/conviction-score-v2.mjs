/** Conviction Score v2.0 — Node export copy (mirrors src/lib/conviction-score-v2.ts). */

import { normalizeStockCapCategory } from './smart-money-signals-core.mjs';

export const V2_FACTOR_MAX = {
  netFundActivity: 25,
  freshEntry: 20,
  exitPenalty: 15,
  amcParticipation: 15,
  trend: 15,
  netWeightChange: 10,
};

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function capCategoryMultiplier(category) {
  const cap = normalizeStockCapCategory(category);
  if (cap === 'Mid Cap') return 1.3;
  if (cap === 'Small Cap' || cap === 'Micro Cap') return 1.8;
  return 1.0;
}

export function scoreNetFundActivity(increased, decreased) {
  const sum = increased + decreased;
  if (sum <= 0) return 0;
  const ratio = (increased - decreased) / sum;
  if (ratio <= 0) return 0;
  return Math.min(V2_FACTOR_MAX.netFundActivity, ratio * V2_FACTOR_MAX.netFundActivity);
}

export function scoreFreshEntry(fresh, fundsHolding) {
  if (fresh <= 0 || fundsHolding <= 0) return 0;
  return Math.min(V2_FACTOR_MAX.freshEntry, (fresh / fundsHolding) * V2_FACTOR_MAX.freshEntry);
}

export function scoreExitPenalty(completeExits, fundsHolding) {
  if (completeExits <= 0) return V2_FACTOR_MAX.exitPenalty;
  const priorHolders = fundsHolding + completeExits;
  if (priorHolders <= 0) return 0;
  const ratio = completeExits / priorHolders;
  return Math.max(0, V2_FACTOR_MAX.exitPenalty * (1 - ratio));
}

export function scoreAmcParticipation(amcsBuying, totalActiveAmcs) {
  if (amcsBuying <= 0 || totalActiveAmcs <= 0) return 0;
  return Math.min(
    V2_FACTOR_MAX.amcParticipation,
    (amcsBuying / totalActiveAmcs) * V2_FACTOR_MAX.amcParticipation,
  );
}

export function scoreTrend(consecutiveMonths) {
  if (consecutiveMonths >= 5) return 15;
  if (consecutiveMonths === 4) return 12;
  if (consecutiveMonths === 3) return 9;
  if (consecutiveMonths === 2) return 6;
  if (consecutiveMonths === 1) return 3;
  return 0;
}

export function scoreNetWeightChange(pct) {
  if (pct <= 0) return 0;
  if (pct > 20) return 10;
  if (pct > 10) return 8;
  if (pct > 5) return 6;
  if (pct > 2) return 4;
  return 2;
}

export function computeConvictionScoreV2(input) {
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
