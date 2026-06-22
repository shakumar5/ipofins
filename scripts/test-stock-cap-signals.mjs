/**
 * Golden tests — six-factor percentile scoring within stock cap bucket.
 * Run: node scripts/test-stock-cap-signals.mjs
 */
import {
  buildSignalRowFromMetrics,
  computeCategoryMaxes,
  scoreStockInCategory,
} from './lib/smart-money-signals-core.mjs';

const errors = [];

function makeRaw(overrides = {}) {
  return {
    stockGroupKey: 'TEST',
    stockName: 'Test Ltd',
    stockSlug: 'test',
    sector: 'Banks',
    category: 'Large Cap',
    month: 'May 2026',
    increasedCount: 5,
    decreasedCount: 1,
    freshEntries: 2,
    completeExits: 0,
    netWeightChangePct: 1.5,
    amcIdsAll: new Set([1, 2, 3]),
    amcIdsBuying: new Set([1, 2]),
    consecutivePositiveMonths: 2,
    fundsHolding: 40,
    ...overrides,
  };
}

// Leader in bucket should score near 100 on positive factors
const leader = makeRaw({
  netWeightChangePct: 5,
  increasedCount: 20,
  decreasedCount: 0,
  freshEntries: 10,
  completeExits: 0,
  consecutivePositiveMonths: 4,
  amcIdsBuying: new Set([1, 2, 3, 4, 5]),
  amcIdsAll: new Set([1, 2, 3, 4, 5, 6]),
});

const laggard = makeRaw({
  netWeightChangePct: 0.1,
  increasedCount: 1,
  decreasedCount: 0,
  freshEntries: 0,
  completeExits: 0,
  consecutivePositiveMonths: 0,
  amcIdsBuying: new Set([1]),
  amcIdsAll: new Set([1, 2]),
});

const maxes = computeCategoryMaxes([
  {
    netWeightChangePct: leader.netWeightChangePct,
    increasedCount: leader.increasedCount,
    decreasedCount: leader.decreasedCount,
    freshEntries: leader.freshEntries,
    completeExits: leader.completeExits,
    amcsBuying: leader.amcIdsBuying.size,
    buyingFunds: leader.increasedCount + leader.freshEntries,
    consecutivePositiveMonths: leader.consecutivePositiveMonths,
  },
  {
    netWeightChangePct: laggard.netWeightChangePct,
    increasedCount: laggard.increasedCount,
    decreasedCount: laggard.decreasedCount,
    freshEntries: laggard.freshEntries,
    completeExits: laggard.completeExits,
    amcsBuying: laggard.amcIdsBuying.size,
    buyingFunds: laggard.increasedCount + laggard.freshEntries,
    consecutivePositiveMonths: laggard.consecutivePositiveMonths,
  },
]);

const leaderScore = scoreStockInCategory(leader, maxes);
const laggardScore = scoreStockInCategory(laggard, maxes);

if (leaderScore.convictionScore <= laggardScore.convictionScore) {
  errors.push(
    `leader should outscore laggard: ${leaderScore.convictionScore} vs ${laggardScore.convictionScore}`,
  );
}

if (leaderScore.convictionScore < 90) {
  errors.push(`leader expected ~100, got ${leaderScore.convictionScore}`);
}

const row = buildSignalRowFromMetrics(leader, maxes);
if (row.category !== 'Large Cap') {
  errors.push(`expected Large Cap category, got ${row.category}`);
}
if (!row.factorBreakdown?.netWeightChange) {
  errors.push('factorBreakdown missing netWeightChange');
}
if (row.convictionV2 != null) {
  errors.push('convictionV2 should not be present');
}

// One stock per row — category is stock cap, not fund scheme
const midCap = buildSignalRowFromMetrics(
  makeRaw({ category: 'Mid Cap', stockSlug: 'mid-test' }),
  computeCategoryMaxes([
    {
      netWeightChangePct: 1.5,
      increasedCount: 5,
      decreasedCount: 1,
      freshEntries: 2,
      completeExits: 0,
      amcsBuying: 2,
      buyingFunds: 7,
      consecutivePositiveMonths: 2,
    },
  ]),
);
if (midCap.category !== 'Mid Cap') {
  errors.push(`expected Mid Cap, got ${midCap.category}`);
}

// Shriram-like: many fresh entries, positive net fund flow — should not score as distribution
const shriramLike = makeRaw({
  stockName: 'Shriram Finance Limited',
  netWeightChangePct: 61,
  increasedCount: 9,
  decreasedCount: 6,
  freshEntries: 29,
  completeExits: 9,
  consecutivePositiveMonths: 0,
  amcIdsBuying: new Set(Array.from({ length: 20 }, (_, i) => i + 1)),
  amcIdsAll: new Set(Array.from({ length: 30 }, (_, i) => i + 1)),
});
const bucketMaxes = computeCategoryMaxes([
  {
    netWeightChangePct: 157.4,
    increasedCount: 79,
    decreasedCount: 12,
    freshEntries: 38,
    completeExits: 19,
    amcsBuying: 30,
    buyingFunds: 106,
    consecutivePositiveMonths: 2,
  },
  {
    netWeightChangePct: shriramLike.netWeightChangePct,
    increasedCount: shriramLike.increasedCount,
    decreasedCount: shriramLike.decreasedCount,
    freshEntries: shriramLike.freshEntries,
    completeExits: shriramLike.completeExits,
    amcsBuying: shriramLike.amcIdsBuying.size,
    buyingFunds: shriramLike.increasedCount + shriramLike.freshEntries,
    consecutivePositiveMonths: shriramLike.consecutivePositiveMonths,
  },
]);
const shriramScore = scoreStockInCategory(shriramLike, bucketMaxes);
if (shriramScore.convictionScore < 50) {
  errors.push(`Shriram-like profile expected score >= 50, got ${shriramScore.convictionScore}`);
}
const shriramRow = buildSignalRowFromMetrics(shriramLike, bucketMaxes);
if (shriramRow.signal === 'Distribution' || shriramRow.signal === 'Strong Distribution') {
  errors.push(`Shriram-like profile should not be distribution, got ${shriramRow.signal}`);
}

// GMR-like: low peer rank but positive net flow — Light Accumulation, not Distribution
const gmrLike = makeRaw({
  stockName: 'GMR Airports Limited',
  stockSlug: 'gmr-airports-ltd',
  category: 'Mid Cap',
  netWeightChangePct: 4.7,
  increasedCount: 1,
  decreasedCount: 0,
  freshEntries: 2,
  completeExits: 0,
  consecutivePositiveMonths: 0,
  amcIdsBuying: new Set([1]),
  amcIdsAll: new Set([1, 2, 3]),
});
const midCapMaxes = computeCategoryMaxes([
  {
    netWeightChangePct: 93,
    increasedCount: 45,
    decreasedCount: 2,
    freshEntries: 30,
    completeExits: 0,
    amcsBuying: 25,
    buyingFunds: 75,
    consecutivePositiveMonths: 3,
  },
  {
    netWeightChangePct: gmrLike.netWeightChangePct,
    increasedCount: gmrLike.increasedCount,
    decreasedCount: gmrLike.decreasedCount,
    freshEntries: gmrLike.freshEntries,
    completeExits: gmrLike.completeExits,
    amcsBuying: gmrLike.amcIdsBuying.size,
    buyingFunds: gmrLike.increasedCount + gmrLike.freshEntries,
    consecutivePositiveMonths: gmrLike.consecutivePositiveMonths,
  },
]);
const gmrScore = scoreStockInCategory(gmrLike, midCapMaxes);
const gmrRow = buildSignalRowFromMetrics(gmrLike, midCapMaxes);
if (gmrRow.netBuying <= 0) {
  errors.push(`GMR-like should have positive net flow, got ${gmrRow.netBuying}`);
}
if (gmrScore.convictionScore >= 40) {
  errors.push(`GMR-like expected low peer rank score, got ${gmrScore.convictionScore}`);
}
if (gmrRow.signal === 'Distribution' || gmrRow.signal === 'Strong Distribution') {
  errors.push(`GMR-like should not be distribution, got ${gmrRow.signal}`);
}
if (gmrRow.signal !== 'Light Accumulation') {
  errors.push(`GMR-like expected Light Accumulation, got ${gmrRow.signal}`);
}

if (errors.length) {
  console.error('FAIL');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('PASS stock-cap-v2 scoring');
console.log(`  leader=${leaderScore.convictionScore}, laggard=${laggardScore.convictionScore}`);
