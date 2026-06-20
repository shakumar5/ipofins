/**
 * Golden test — BSE Ltd worked example from Conviction Score v2.0 spec.
 * Run: node scripts/test-conviction-v2.mjs
 */
import { computeConvictionScoreV2 } from './lib/conviction-score-v2.mjs';

const bse = computeConvictionScoreV2({
  increasedCount: 42,
  decreasedCount: 4,
  freshEntries: 18,
  completeExits: 0,
  fundsHolding: 45,
  amcsBuying: 22,
  totalActiveAmcs: 45,
  consecutivePositiveMonths: 4,
  netWeightChangePct: 21,
  category: 'Mid Cap',
});

const errors = [];

if (Math.abs(bse.rawTotal - 72.9) > 0.15) {
  errors.push(`rawTotal expected ~72.9, got ${bse.rawTotal}`);
}
if (Math.abs(bse.convictionScore - 94.8) > 0.15) {
  errors.push(`convictionScore expected 94.8, got ${bse.convictionScore}`);
}
if (bse.capMultiplier !== 1.3) {
  errors.push(`capMultiplier expected 1.3, got ${bse.capMultiplier}`);
}

// Edge cases — negative / zero components
const zeroActivity = computeConvictionScoreV2({
  increasedCount: 2,
  decreasedCount: 8,
  freshEntries: 0,
  completeExits: 0,
  fundsHolding: 10,
  amcsBuying: 0,
  totalActiveAmcs: 40,
  consecutivePositiveMonths: 0,
  netWeightChangePct: -3,
  category: 'Large Cap',
});
if (zeroActivity.factorScores.netFundActivity !== 0) {
  errors.push('negative net activity should score 0');
}
if (zeroActivity.factorScores.netWeightChange !== 0) {
  errors.push('negative net weight should score 0');
}

const capped = computeConvictionScoreV2({
  increasedCount: 50,
  decreasedCount: 0,
  freshEntries: 40,
  completeExits: 0,
  fundsHolding: 50,
  amcsBuying: 40,
  totalActiveAmcs: 45,
  consecutivePositiveMonths: 6,
  netWeightChangePct: 25,
  category: 'Small Cap',
});
if (capped.convictionScore > 100) {
  errors.push(`score should cap at 100, got ${capped.convictionScore}`);
}

if (errors.length) {
  console.error('FAIL');
  for (const e of errors) console.error(' -', e);
  console.error('BSE result:', JSON.stringify(bse, null, 2));
  process.exit(1);
}

console.log('PASS — BSE golden test');
console.log(`  rawTotal=${bse.rawTotal}, final=${bse.convictionScore}, multiplier=${bse.capMultiplier}`);
