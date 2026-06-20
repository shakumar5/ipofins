/** Smart Money Signal scoring — Node build/export copy (mirrors src/lib/smart-money-signals.ts). */

/** Stock market-cap buckets (SEBI-style). */
export const STOCK_CAP_CATEGORIES = [
  'Large Cap',
  'Mid Cap',
  'Small Cap',
  'Micro Cap',
  'Unknown',
];

/** @deprecated Fund scheme categories — only used by Smart Money Tracker, not Signal scoring. */
export const SIGNAL_CATEGORIES = [
  'Large Cap',
  'Large & Mid Cap',
  'Mid Cap',
  'Multi Cap',
  'Flexi Cap',
  'Small Cap',
  'Value',
  'Focused',
  'ELSS',
  'Sectoral/Thematic',
  'Sectoral',
  'Contra',
  'Dividend Yield',
  'Index',
];

import { computeConvictionScoreV2 } from './conviction-score-v2.mjs';

export function normalizeStockCapCategory(raw) {
  const v = String(raw || '').toLowerCase().replace(/_/g, ' ').trim();
  if (!v) return 'Unknown';
  if (v.includes('micro')) return 'Micro Cap';
  if (v.includes('small')) return 'Small Cap';
  if (v.includes('mid')) return 'Mid Cap';
  if (v.includes('large')) return 'Large Cap';
  return 'Unknown';
}

/** Fund scheme activity → stock cap vote weights when DB market_cap_category is empty. */
const FUND_CATEGORY_STOCK_CAP_VOTES = {
  'Large Cap': ['Large Cap'],
  'Large & Mid Cap': ['Large Cap', 'Mid Cap'],
  'Mid Cap': ['Mid Cap'],
  'Small Cap': ['Small Cap'],
  'Multi Cap': ['Large Cap', 'Mid Cap', 'Small Cap'],
  'Flexi Cap': ['Large Cap', 'Mid Cap', 'Small Cap'],
  Value: ['Large Cap', 'Mid Cap'],
  Focused: ['Large Cap', 'Mid Cap', 'Small Cap'],
  ELSS: ['Large Cap', 'Mid Cap'],
  'Sectoral/Thematic': ['Mid Cap', 'Small Cap'],
  Sectoral: ['Mid Cap', 'Small Cap'],
  Contra: ['Large Cap', 'Mid Cap'],
  'Dividend Yield': ['Large Cap'],
  Index: ['Large Cap'],
};

const STOCK_CAP_PRIORITY = ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap'];

export function inferStockCapFromFundVotes(votes) {
  const totals = {};
  for (const [fundCat, count] of Object.entries(votes || {})) {
    const targets = FUND_CATEGORY_STOCK_CAP_VOTES[fundCat];
    if (!targets?.length) continue;
    const share = Number(count) / targets.length;
    for (const cap of targets) {
      totals[cap] = (totals[cap] || 0) + share;
    }
  }
  let best = 'Unknown';
  let bestScore = 0;
  for (const cap of STOCK_CAP_PRIORITY) {
    const score = totals[cap] || 0;
    if (score > bestScore) {
      bestScore = score;
      best = cap;
    }
  }
  return best;
}

export function resolveStockCapCategory(dbCap, fundVotes) {
  const normalized = normalizeStockCapCategory(dbCap);
  if (normalized !== 'Unknown') return normalized;
  const inferred = inferStockCapFromFundVotes(fundVotes);
  return inferred !== 'Unknown' ? inferred : 'Unknown';
}

export function isStrictPositiveMonth(m) {
  if (!m?.pctChanges?.length) return false;
  return m.pctChanges.every((p) => p > 0);
}

export function consecutiveStrictTrend(sortedMonths, lookup) {
  let count = 0;
  for (let i = sortedMonths.length - 1; i >= 0; i--) {
    const m = lookup(sortedMonths[i]);
    if (!m || !isStrictPositiveMonth(m)) break;
    count++;
  }
  return count;
}

export function scoreToStockSignal(score) {
  if (score >= 90) return { signal: 'Aggressive Accumulation', emoji: '🚀' };
  if (score >= 80) return { signal: 'Strong Accumulation', emoji: '🟢' };
  if (score >= 70) return { signal: 'Accumulation', emoji: '🟡' };
  if (score >= 60) return { signal: 'Positive', emoji: '⚪' };
  if (score >= 40) return { signal: 'Neutral', emoji: '⚪' };
  if (score >= 20) return { signal: 'Distribution', emoji: '🟠' };
  return { signal: 'Aggressive Distribution', emoji: '🚨' };
}

/** Legacy sector bands. */
export function scoreToSignal(score) {
  if (score >= 90) return { signal: 'Aggressive Accumulation', emoji: '🚀' };
  if (score >= 75) return { signal: 'Strong Accumulation', emoji: '🟢' };
  if (score >= 60) return { signal: 'Moderate Accumulation', emoji: '🟡' };
  if (score >= 40) return { signal: 'Neutral', emoji: '⚪' };
  if (score >= 25) return { signal: 'Distribution', emoji: '🟠' };
  return { signal: 'Strong Distribution', emoji: '🔴' };
}

function scoreBasedConfidence(score) {
  if (score >= 90) return { label: 'Very High', stars: 5 };
  if (score >= 75) return { label: 'High', stars: 4 };
  if (score >= 60) return { label: 'Medium', stars: 3 };
  if (score >= 40) return { label: 'Low', stars: 2 };
  return { label: 'Very Low', stars: 1 };
}

function buildInterpretation(stockName, signal) {
  const shortName = stockName.replace(/\s+(Limited|Ltd\.?)$/i, '').trim();
  switch (signal) {
    case 'Aggressive Accumulation':
      return `Mutual funds across the industry are aggressively increasing their exposure to ${shortName}. This indicates strong institutional conviction and broad-based buying interest.`;
    case 'Strong Accumulation':
      return `Fund managers are meaningfully adding to ${shortName} across mutual funds. Institutional interest is clearly positive this month.`;
    case 'Accumulation':
      return `There is steady but measured buying in ${shortName}. Conviction is building without extreme one-sided activity.`;
    case 'Positive':
      return `Fund activity in ${shortName} leans positive this month, with more buying than selling across mutual funds.`;
    case 'Neutral':
      return `Fund activity in ${shortName} is mixed this month. Increases and reductions largely offset each other.`;
    case 'Distribution':
      return `More funds reduced than added to ${shortName} this month. Institutional conviction appears to be fading.`;
    case 'Aggressive Distribution':
      return `Mutual funds are exiting ${shortName} at scale. This reflects weak institutional conviction and broad selling pressure.`;
    default:
      return '';
  }
}

export function buildSignalRowFromMetrics(raw) {
  const fundsHolding = Math.max(0, raw.fundsHolding ?? 0);
  const totalActiveAmcs = Math.max(1, raw.totalActiveAmcs ?? 1);

  const v2 = computeConvictionScoreV2({
    increasedCount: raw.increasedCount,
    decreasedCount: raw.decreasedCount,
    freshEntries: raw.freshEntries,
    completeExits: raw.completeExits,
    fundsHolding,
    amcsBuying: raw.amcIdsBuying.size,
    totalActiveAmcs,
    consecutivePositiveMonths: raw.consecutivePositiveMonths,
    netWeightChangePct: raw.netWeightChangePct,
    category: raw.category,
  });

  const { signal, emoji } = scoreToStockSignal(v2.convictionScore);
  const amcCount = raw.amcIdsAll.size;
  const conf = scoreBasedConfidence(v2.convictionScore);
  const buyingFunds = raw.increasedCount + raw.freshEntries;

  return {
    stockName: raw.stockName,
    stockSlug: raw.stockSlug,
    sector: raw.sector,
    category: raw.category,
    month: raw.month,
    convictionScore: v2.convictionScore,
    signal,
    signalEmoji: emoji,
    increasedCount: raw.increasedCount,
    decreasedCount: raw.decreasedCount,
    freshEntries: raw.freshEntries,
    completeExits: raw.completeExits,
    netBuying: raw.increasedCount - raw.decreasedCount,
    netWeightChangePct: Math.round(raw.netWeightChangePct * 10) / 10,
    amcCount,
    amcsBuying: raw.amcIdsBuying.size,
    buyingFunds,
    institutionalConfidence: conf.label,
    confidenceStars: conf.stars,
    consecutivePositiveMonths: raw.consecutivePositiveMonths,
    factorScores: v2.factorScores,
    factorBreakdown: v2.factorBreakdown,
    convictionV2: {
      rawTotal: v2.rawTotal,
      capMultiplier: v2.capMultiplier,
      totalActiveAmcs,
    },
    ...(raw.fundActivity ? { fundActivity: raw.fundActivity } : {}),
    interpretation: buildInterpretation(raw.stockName, signal),
    fundsHolding,
    topFundHolders: raw.topFundHolders || [],
    ...(raw.nseSymbol ? { nseSymbol: raw.nseSymbol } : {}),
  };
}
