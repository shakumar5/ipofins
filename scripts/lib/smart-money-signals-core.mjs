/** Smart Money Signal scoring — Node build/export copy (mirrors src/lib/smart-money-signals.ts). */

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

const FACTOR_MAX = {
  netWeight: 35,
  netBuying: 20,
  freshEntries: 15,
  exits: 10,
  amcBreadth: 10,
  trend: 10,
};

export function normalizeStockCapCategory(raw) {
  const v = String(raw || '').toLowerCase().replace(/_/g, ' ').trim();
  if (!v) return 'Unknown';
  if (v.includes('micro')) return 'Micro Cap';
  if (v.includes('small')) return 'Small Cap';
  if (v.includes('mid')) return 'Mid Cap';
  if (v.includes('large')) return 'Large Cap';
  return 'Unknown';
}

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

export function scoreToSignal(score) {
  if (score >= 90) return { signal: 'Aggressive Accumulation', emoji: '🚀' };
  if (score >= 75) return { signal: 'Strong Accumulation', emoji: '🟢' };
  if (score >= 60) return { signal: 'Moderate Accumulation', emoji: '🟡' };
  if (score >= 40) return { signal: 'Neutral', emoji: '⚪' };
  if (score >= 25) return { signal: 'Light Distribution', emoji: '🟠' };
  return { signal: 'Strong Distribution', emoji: '🔴' };
}

export function signalDirection(netFundFlow, netWeightChangePct = 0) {
  if (netFundFlow > 0) return 'accumulation';
  if (netFundFlow < 0) return 'distribution';
  if (netWeightChangePct > 0) return 'accumulation';
  if (netWeightChangePct < 0) return 'distribution';
  return 'neutral';
}

export function deriveSignal(convictionScore, netFundFlow, netWeightChangePct = 0) {
  const direction = signalDirection(netFundFlow, netWeightChangePct);
  const s = convictionScore;

  if (direction === 'accumulation') {
    if (s >= 90) return { signal: 'Aggressive Accumulation', emoji: '🚀' };
    if (s >= 75) return { signal: 'Strong Accumulation', emoji: '🟢' };
    if (s >= 50) return { signal: 'Moderate Accumulation', emoji: '🟡' };
    return { signal: 'Light Accumulation', emoji: '🔵' };
  }

  if (direction === 'distribution') {
    if (s >= 75) return { signal: 'Strong Distribution', emoji: '🔴' };
    if (s >= 50) return { signal: 'Distribution', emoji: '🟠' };
    if (s >= 25) return { signal: 'Light Distribution', emoji: '🟠' };
    return { signal: 'Strong Distribution', emoji: '🔴' };
  }

  return { signal: 'Neutral', emoji: '⚪' };
}

function amcInstitutionalConfidence(amcCount) {
  if (amcCount >= 20) return { label: 'Very High', stars: 5 };
  if (amcCount >= 15) return { label: 'High', stars: 4 };
  if (amcCount >= 10) return { label: 'Medium', stars: 3 };
  if (amcCount >= 5) return { label: 'Low', stars: 2 };
  return { label: 'Very Low', stars: 1 };
}

function buildInterpretation(stockName, signal, opts = {}) {
  const shortName = stockName.replace(/\s+(Limited|Ltd\.?)$/i, '').trim();
  const flow = opts.netFundFlow ?? 0;
  const score = opts.convictionScore ?? 0;
  const fresh = opts.freshEntries ?? 0;
  const cap = opts.category && opts.category !== 'All' ? opts.category : 'market-cap';

  if (flow > 0) {
    if (flow >= 15 && (opts.netWeightChangePct ?? 0) > 0) {
      if (score >= 75) {
        return `Fund managers are meaningfully adding to ${shortName} across mutual funds. Institutional interest is clearly positive this month.`;
      }
      if (score >= 50) {
        return `Mutual funds are net buyers of ${shortName} — including ${fresh} fresh entries and broad weight increases — ranking among active ${cap} peers this month.`;
      }
      return `Funds are net adding ${shortName} (${flow} more buy-side fund moves than sells), though activity is lighter than the top ${cap} leaders this month.`;
    }
    if (signal === 'Light Accumulation') {
      return `A small number of funds added or initiated positions in ${shortName} this month (${flow} net buy-side moves). Conviction ranks low vs other ${cap} stocks, but flow direction is positive.`;
    }
  }

  if (flow < 0) {
    if (flow <= -10) {
      return `More funds reduced or exited ${shortName} than added this month. Institutional conviction appears to be fading.`;
    }
    if (signal === 'Light Distribution') {
      return `More funds trimmed or exited ${shortName} than added (${Math.abs(flow)} net sell-side moves), though selling pressure is lighter than the heaviest ${cap} exits this month.`;
    }
  }

  switch (signal) {
    case 'Aggressive Accumulation':
      return `Mutual funds across the industry are aggressively increasing their exposure to ${shortName}. This indicates strong institutional conviction and broad-based buying interest.`;
    case 'Strong Accumulation':
      return `Fund managers are meaningfully adding to ${shortName} across mutual funds. Institutional interest is clearly positive this month.`;
    case 'Moderate Accumulation':
      return `There is steady but measured buying in ${shortName}. Conviction is building without extreme one-sided activity.`;
    case 'Light Accumulation':
      return `Funds are net buyers of ${shortName}, but activity is modest compared with the most active ${cap} names this month.`;
    case 'Neutral':
      return `Fund activity in ${shortName} is mixed this month. Increases and reductions largely offset each other.`;
    case 'Light Distribution':
      return `Slightly more funds reduced or exited ${shortName} than added this month. Selling is present but not broad-based.`;
    case 'Distribution':
      return `More funds reduced than added to ${shortName} this month. Institutional conviction appears to be fading.`;
    case 'Strong Distribution':
      return `Mutual funds are exiting ${shortName} at scale. This reflects weak institutional conviction and broad selling pressure.`;
    default:
      return '';
  }
}

export function concentrationMultiplier(ratio) {
  if (ratio >= 0.4) return 1.0;
  if (ratio >= 0.2) return 0.75;
  if (ratio >= 0.1) return 0.5;
  return 0.25;
}

export function breadthRaw(amcsBuying, buyingFunds) {
  if (buyingFunds <= 0 || amcsBuying <= 0) return 0;
  return amcsBuying * concentrationMultiplier(amcsBuying / buyingFunds);
}

export function negativeNetWeightPoints(pct) {
  if (pct >= 0) return 0;
  if (pct >= -0.5) return 9.8;
  if (pct >= -1) return 7.0;
  if (pct >= -2) return 4.9;
  if (pct >= -3) return 2.8;
  return 0;
}

export function percentilePoints(value, max, factorMax) {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(factorMax, (value / max) * factorMax);
}

export function sqrtPercentilePoints(value, max, factorMax) {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(factorMax, (Math.sqrt(value) / Math.sqrt(max)) * factorMax);
}

export function netFundFlow(increasedCount, decreasedCount, freshEntries, completeExits) {
  return increasedCount + freshEntries - decreasedCount - completeExits;
}

export function invertedPercentilePoints(value, max, factorMax) {
  if (max <= 0) return factorMax;
  return Math.max(0, (1 - value / max) * factorMax);
}

export function computeCategoryMaxes(items) {
  let maxPositiveNetWeight = 0;
  let maxNetBuying = 0;
  let maxFreshEntries = 0;
  let maxCompleteExits = 0;
  let maxBreadthRaw = 0;
  let maxConsecutiveMonths = 0;

  for (const item of items) {
    if (item.netWeightChangePct > maxPositiveNetWeight) {
      maxPositiveNetWeight = item.netWeightChangePct;
    }
    const netFlow = netFundFlow(
      item.increasedCount,
      item.decreasedCount,
      item.freshEntries,
      item.completeExits,
    );
    if (netFlow > maxNetBuying) maxNetBuying = netFlow;
    if (item.freshEntries > maxFreshEntries) maxFreshEntries = item.freshEntries;
    if (item.completeExits > maxCompleteExits) maxCompleteExits = item.completeExits;
    const br = breadthRaw(item.amcsBuying, item.buyingFunds);
    if (br > maxBreadthRaw) maxBreadthRaw = br;
    if (item.consecutivePositiveMonths > maxConsecutiveMonths) {
      maxConsecutiveMonths = item.consecutivePositiveMonths;
    }
  }

  return {
    maxPositiveNetWeight,
    maxNetBuying,
    maxFreshEntries,
    maxCompleteExits,
    maxBreadthRaw,
    maxConsecutiveMonths,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function scoreStockInCategory(raw, maxes) {
  const netWeight = raw.netWeightChangePct;
  const netFlow = netFundFlow(
    raw.increasedCount,
    raw.decreasedCount,
    raw.freshEntries,
    raw.completeExits,
  );
  const buyingFunds = raw.increasedCount + raw.freshEntries;
  const amcsBuying = raw.amcIdsBuying.size;
  const brRaw = breadthRaw(amcsBuying, buyingFunds);
  const trendMonths = raw.consecutivePositiveMonths;

  const netWeightPoints =
    netWeight >= 0
      ? sqrtPercentilePoints(netWeight, maxes.maxPositiveNetWeight, FACTOR_MAX.netWeight)
      : negativeNetWeightPoints(netWeight);

  const netBuyingPoints =
    netFlow > 0 ? percentilePoints(netFlow, maxes.maxNetBuying, FACTOR_MAX.netBuying) : 0;
  const freshPoints = percentilePoints(raw.freshEntries, maxes.maxFreshEntries, FACTOR_MAX.freshEntries);
  const exitPoints = invertedPercentilePoints(
    raw.completeExits,
    maxes.maxCompleteExits,
    FACTOR_MAX.exits,
  );
  const amcPoints = percentilePoints(brRaw, maxes.maxBreadthRaw, FACTOR_MAX.amcBreadth);
  const trendPoints = percentilePoints(trendMonths, maxes.maxConsecutiveMonths, FACTOR_MAX.trend);

  const factorScores = {
    netWeightChange: round1(netWeightPoints),
    netBuying: round1(netBuyingPoints),
    freshEntries: round1(freshPoints),
    completeExits: round1(exitPoints),
    amcParticipation: round1(amcPoints),
    trend: round1(trendPoints),
  };

  const convictionScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        factorScores.netWeightChange +
          factorScores.netBuying +
          factorScores.freshEntries +
          factorScores.completeExits +
          factorScores.amcParticipation +
          factorScores.trend,
      ),
    ),
  );

  const factorBreakdown = {
    netWeightChange: {
      raw: round1(netWeight),
      categoryMax: round1(maxes.maxPositiveNetWeight),
      points: factorScores.netWeightChange,
      maxPoints: FACTOR_MAX.netWeight,
    },
    netBuying: {
      raw: netFlow,
      categoryMax: maxes.maxNetBuying,
      points: factorScores.netBuying,
      maxPoints: FACTOR_MAX.netBuying,
    },
    freshEntries: {
      raw: raw.freshEntries,
      categoryMax: maxes.maxFreshEntries,
      points: factorScores.freshEntries,
      maxPoints: FACTOR_MAX.freshEntries,
    },
    completeExits: {
      raw: raw.completeExits,
      categoryMax: maxes.maxCompleteExits,
      points: factorScores.completeExits,
      maxPoints: FACTOR_MAX.exits,
    },
    amcBreadth: {
      raw: round1(brRaw),
      categoryMax: round1(maxes.maxBreadthRaw),
      points: factorScores.amcParticipation,
      maxPoints: FACTOR_MAX.amcBreadth,
    },
    trend: {
      raw: trendMonths,
      categoryMax: maxes.maxConsecutiveMonths,
      points: factorScores.trend,
      maxPoints: FACTOR_MAX.trend,
    },
  };

  return { convictionScore, factorScores, factorBreakdown };
}

export function buildSignalRowFromMetrics(raw, maxes) {
  const { convictionScore, factorScores, factorBreakdown } = scoreStockInCategory(raw, maxes);
  const netFlow = netFundFlow(
    raw.increasedCount,
    raw.decreasedCount,
    raw.freshEntries,
    raw.completeExits,
  );
  const { signal, emoji } = deriveSignal(convictionScore, netFlow, raw.netWeightChangePct);
  const amcCount = raw.amcIdsAll.size;
  const conf = amcInstitutionalConfidence(amcCount);
  const buyingFunds = raw.increasedCount + raw.freshEntries;
  const fundsHolding = Math.max(0, raw.fundsHolding ?? 0);

  return {
    stockName: raw.stockName,
    stockSlug: raw.stockSlug,
    sector: raw.sector,
    category: raw.category,
    month: raw.month,
    convictionScore,
    signal,
    signalEmoji: emoji,
    increasedCount: raw.increasedCount,
    decreasedCount: raw.decreasedCount,
    freshEntries: raw.freshEntries,
    completeExits: raw.completeExits,
    netBuying: netFlow,
    netWeightChangePct: round1(raw.netWeightChangePct),
    amcCount,
    amcsBuying: raw.amcIdsBuying.size,
    buyingFunds,
    institutionalConfidence: conf.label,
    confidenceStars: conf.stars,
    consecutivePositiveMonths: raw.consecutivePositiveMonths,
    factorScores,
    factorBreakdown,
    ...(raw.fundActivity ? { fundActivity: raw.fundActivity } : {}),
    interpretation: buildInterpretation(raw.stockName, signal, {
      netFundFlow: netFlow,
      freshEntries: raw.freshEntries,
      convictionScore,
      category: raw.category,
      netWeightChangePct: raw.netWeightChangePct,
    }),
    fundsHolding,
    topFundHolders: raw.topFundHolders || [],
    ...(raw.nseSymbol ? { nseSymbol: raw.nseSymbol } : {}),
  };
}
