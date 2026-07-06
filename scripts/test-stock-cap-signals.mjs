/**
 * Golden tests — six-factor percentile scoring within stock cap bucket.
 * Run: node scripts/test-stock-cap-signals.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSignalRowFromMetrics,
  computeCategoryMaxes,
  deriveSignal,
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

// Karur-like: strong positive aggregate weight despite mildly negative fund-event flow
const karurLike = makeRaw({
  stockName: 'Karur Vysya Bank Ltd.',
  stockSlug: 'karur-vysya-bank-ltd',
  category: 'Small Cap',
  netWeightChangePct: 34.4,
  increasedCount: 10,
  decreasedCount: 40,
  freshEntries: 21,
  completeExits: 1,
  consecutivePositiveMonths: 0,
  amcIdsBuying: new Set(Array.from({ length: 19 }, (_, i) => i + 1)),
  amcIdsAll: new Set(Array.from({ length: 31 }, (_, i) => i + 1)),
});
const karurMaxes = computeCategoryMaxes([
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
    netWeightChangePct: karurLike.netWeightChangePct,
    increasedCount: karurLike.increasedCount,
    decreasedCount: karurLike.decreasedCount,
    freshEntries: karurLike.freshEntries,
    completeExits: karurLike.completeExits,
    amcsBuying: karurLike.amcIdsBuying.size,
    buyingFunds: karurLike.increasedCount + karurLike.freshEntries,
    consecutivePositiveMonths: karurLike.consecutivePositiveMonths,
  },
]);
const karurRow = buildSignalRowFromMetrics(karurLike, karurMaxes);
if (karurRow.netBuying >= 0) {
  errors.push(`Karur-like should have negative net fund flow, got ${karurRow.netBuying}`);
}
if (karurRow.signal === 'Distribution' || karurRow.signal === 'Strong Distribution') {
  errors.push(`Karur-like should not be distribution with +34.4% weight, got ${karurRow.signal}`);
}
if (!karurRow.signal.includes('Accumulation')) {
  errors.push(`Karur-like expected accumulation signal, got ${karurRow.signal}`);
}

const karurExported = deriveSignal(58, -10, 34.4);
if (karurExported.signal !== 'Moderate Accumulation') {
  errors.push(
    `Karur exported row (58, -10, +34.4% weight) expected Moderate Accumulation, got ${karurExported.signal}`,
  );
}

const sagilityExported = deriveSignal(31, -12, 4.8);
if (sagilityExported.signal !== 'Light Accumulation') {
  errors.push(
    `SAGILITY (31, -12, +4.8% weight) expected Light Accumulation, got ${sagilityExported.signal}`,
  );
}

const cclExported = deriveSignal(31, -8, 8.1);
if (cclExported.signal !== 'Light Accumulation') {
  errors.push(
    `CCL Products (31, -8, +8.1% weight) expected Light Accumulation, got ${cclExported.signal}`,
  );
}

const bikajiExported = deriveSignal(26, -8, 4.1);
if (bikajiExported.signal !== 'Light Accumulation') {
  errors.push(
    `Bikaji (26, -8, +4.1% weight) expected Light Accumulation, got ${bikajiExported.signal}`,
  );
}

const bemlExported = deriveSignal(26, -11, 6.8);
if (bemlExported.signal !== 'Light Accumulation') {
  errors.push(`BEML (26, -11, +6.8% weight) expected Light Accumulation, got ${bemlExported.signal}`);
}

const pricolExported = deriveSignal(26, 0, 4.4);
if (pricolExported.signal !== 'Light Accumulation') {
  errors.push(`Pricol (26, flow 0, +4.4% weight) expected Light Accumulation, got ${pricolExported.signal}`);
}

const tcsExported = deriveSignal(25, -64, 4.7);
if (tcsExported.signal !== 'Light Accumulation') {
  errors.push(`TCS (25, -64, +4.7% weight) expected Light Accumulation, got ${tcsExported.signal}`);
}

const hclExported = deriveSignal(25, -19, 9.5);
if (hclExported.signal !== 'Light Accumulation') {
  errors.push(`HCL (25, -19, +9.5% weight) expected Light Accumulation, got ${hclExported.signal}`);
}

const bajajFinservExported = deriveSignal(25, 27, 4.4);
if (bajajFinservExported.signal !== 'Light Accumulation') {
  errors.push(`Bajaj Finserv (25, +27, +4.4% weight) expected Light Accumulation, got ${bajajFinservExported.signal}`);
}

for (const [label, score, flow, weight] of [
  ['Voltamp', 25, -4, 1.7],
  ['Five-Star Finance', 25, -9, 3.7],
  ['Balrampur Chini', 25, -7, 4.1],
  ['Great Eastern Shipping', 25, -9, 3.4],
]) {
  const resolved = deriveSignal(score, flow, weight);
  if (resolved.signal !== 'Light Accumulation') {
    errors.push(`${label} (${score}, ${flow}, +${weight}% weight) expected Light Accumulation, got ${resolved.signal}`);
  }
}

// Audit live export chunks — positive aggregate weight must not label as distribution.
const indexPath = join(process.cwd(), 'public/data/smart-money-signals-index.json');
if (existsSync(indexPath)) {
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const monthSlug = String(index.months?.[0] || '')
    .toLowerCase()
    .replace(/\s+/g, '-');
  let audited = 0;
  for (const cat of index.categories || []) {
    const catSlug = String(cat).toLowerCase().replace(/\s+/g, '-');
    const filePath = join(process.cwd(), 'public/data/smart-money-signals', `${monthSlug}--${catSlug}.json`);
    if (!existsSync(filePath)) continue;
    const file = JSON.parse(readFileSync(filePath, 'utf8'));
    for (const row of file.rows || []) {
      audited++;
      const flow = row.netBuying ?? 0;
      const weight = row.netWeightChangePct ?? 0;
      const { signal } = deriveSignal(row.convictionScore ?? 0, flow, weight);
      if (weight > 0 && (signal === 'Distribution' || signal === 'Strong Distribution')) {
        errors.push(
          `${row.stockName} has +${weight}% weight but signal ${signal} (flow ${flow})`,
        );
      }
    }
  }
  if (!audited) {
    errors.push('signal export audit found 0 rows — export data missing?');
  }
}

if (errors.length) {
  console.error('FAIL');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('PASS stock-cap-v2 scoring');
console.log(`  leader=${leaderScore.convictionScore}, laggard=${laggardScore.convictionScore}`);
