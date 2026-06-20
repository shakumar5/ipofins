/** Smart Money Signal — stock-level aggregation, percentile scoring within market-cap bucket. */

export type SmartMoneySignalType =
  | 'Aggressive Accumulation'
  | 'Strong Accumulation'
  | 'Moderate Accumulation'
  | 'Neutral'
  | 'Distribution'
  | 'Strong Distribution';

/** Stock market-cap buckets (SEBI-style) — peer group for percentile scoring. */
export const STOCK_CAP_CATEGORIES = [
  'Large Cap',
  'Mid Cap',
  'Small Cap',
  'Micro Cap',
  'Unknown',
] as const;

export type StockCapCategory = (typeof STOCK_CAP_CATEGORIES)[number];

/** @deprecated Fund scheme categories — Smart Money Tracker only. */
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
] as const;

export type SignalCategory = StockCapCategory;

export function normalizeStockCapCategory(raw: string | null | undefined): StockCapCategory {
  const v = String(raw || '').toLowerCase().replace(/_/g, ' ').trim();
  if (!v) return 'Unknown';
  if (v.includes('micro')) return 'Micro Cap';
  if (v.includes('small')) return 'Small Cap';
  if (v.includes('mid')) return 'Mid Cap';
  if (v.includes('large')) return 'Large Cap';
  return 'Unknown';
}

const FUND_CATEGORY_STOCK_CAP_VOTES: Record<string, StockCapCategory[]> = {
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

const STOCK_CAP_PRIORITY: StockCapCategory[] = ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap'];

export function inferStockCapFromFundVotes(votes: Record<string, number> | undefined): StockCapCategory {
  const totals: Partial<Record<StockCapCategory, number>> = {};
  for (const [fundCat, count] of Object.entries(votes || {})) {
    const targets = FUND_CATEGORY_STOCK_CAP_VOTES[fundCat];
    if (!targets?.length) continue;
    const share = Number(count) / targets.length;
    for (const cap of targets) {
      totals[cap] = (totals[cap] || 0) + share;
    }
  }
  let best: StockCapCategory = 'Unknown';
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

export function signalMarketCapFilterOptions(
  categories: string[],
  scoringModel?: 'stock-cap-v2' | 'fund-scheme-v1',
): string[] {
  const useStockCapBuckets =
    scoringModel === 'stock-cap-v2' || !isLegacyFundSchemeSignals(categories);
  if (!useStockCapBuckets) {
    const rest = categories.filter((c) => c !== 'All');
    return ['All', ...rest];
  }
  const caps = STOCK_CAP_CATEGORIES.filter((c) => c !== 'Unknown');
  const showUnknown = categories.includes('Unknown');
  return ['All', ...caps, ...(showUnknown ? ['Unknown'] : [])];
}

/** Mutual fund scheme types — not a stock's market-cap classification. */
const FUND_SCHEME_ONLY = new Set([
  'Large & Mid Cap',
  'Multi Cap',
  'Flexi Cap',
  'Value',
  'Focused',
  'ELSS',
  'Sectoral/Thematic',
  'Sectoral',
  'Contra',
  'Dividend Yield',
  'Index',
]);

/** Label for UI subtitles — returns null for legacy fund-scheme categories (e.g. Flexi Cap). */
export function stockCapDisplayLabel(category: string): string | null {
  if (!category || category === 'Unknown' || FUND_SCHEME_ONLY.has(category)) return null;
  if ((STOCK_CAP_CATEGORIES as readonly string[]).includes(category as StockCapCategory)) {
    return `${category} stock`;
  }
  return null;
}

export function isLegacyFundSchemeSignals(categories: string[]): boolean {
  return categories.some((c) => FUND_SCHEME_ONLY.has(c));
}

export function consecutiveAggregatedNetWeightTrend(
  sortedMonths: string[],
  groupKey: string,
  byKey: Map<string, { netWeightChangePct: number }>,
): number {
  let count = 0;
  for (let i = sortedMonths.length - 1; i >= 0; i--) {
    const entry = byKey.get(`${groupKey}|${sortedMonths[i]}`);
    if (!entry || entry.netWeightChangePct <= 0) break;
    count++;
  }
  return count;
}

export interface SignalFactorScores {
  netWeightChange: number;
  netBuying: number;
  freshEntries: number;
  completeExits: number;
  amcParticipation: number;
  trend: number;
}

export interface FactorBreakdown {
  raw: number;
  categoryMax: number;
  points: number;
  maxPoints: number;
}

export interface SmartMoneySignalRow {
  stockName: string;
  stockSlug: string;
  sector: string;
  /** Stock market-cap bucket (Large / Mid / Small / Micro). */
  category: string;
  month: string;
  convictionScore: number;
  signal: SmartMoneySignalType;
  signalEmoji: string;
  increasedCount: number;
  decreasedCount: number;
  freshEntries: number;
  completeExits: number;
  netBuying: number;
  netWeightChangePct: number;
  amcCount: number;
  amcsBuying: number;
  buyingFunds: number;
  institutionalConfidence: string;
  confidenceStars: number;
  consecutivePositiveMonths: number;
  factorScores: SignalFactorScores;
  factorBreakdown: {
    netWeightChange: FactorBreakdown;
    netBuying: FactorBreakdown;
    freshEntries: FactorBreakdown;
    completeExits: FactorBreakdown;
    amcBreadth: FactorBreakdown;
    trend: FactorBreakdown;
  };
  interpretation: string;
  fundsHolding: number;
  topFundHolders: string[];
}

export const SIGNAL_OPTIONS: { value: SmartMoneySignalType | 'All'; label: string }[] = [
  { value: 'All', label: 'All Signals' },
  { value: 'Aggressive Accumulation', label: '🚀 Aggressive Accumulation' },
  { value: 'Strong Accumulation', label: '🟢 Strong Accumulation' },
  { value: 'Moderate Accumulation', label: '🟡 Moderate Accumulation' },
  { value: 'Neutral', label: '⚪ Neutral' },
  { value: 'Distribution', label: '🟠 Distribution' },
  { value: 'Strong Distribution', label: '🔴 Strong Distribution' },
];

export interface RawStockMonthCategoryMetrics {
  stockGroupKey: string;
  stockName: string;
  stockSlug: string;
  sector: string;
  category: string;
  month: string;
  increasedCount: number;
  decreasedCount: number;
  freshEntries: number;
  completeExits: number;
  netWeightChangePct: number;
  pctChanges: number[];
  amcIdsAll: Set<number>;
  amcIdsBuying: Set<number>;
}

export interface SmartMoneySignalsData {
  months: string[];
  categories: string[];
  rows: SmartMoneySignalRow[];
}

const FACTOR_MAX = {
  netWeight: 35,
  netBuying: 20,
  freshEntries: 15,
  exits: 10,
  amcBreadth: 10,
  trend: 10,
} as const;

export function scoreToSignal(score: number): { signal: SmartMoneySignalType; emoji: string } {
  if (score >= 90) return { signal: 'Aggressive Accumulation', emoji: '🚀' };
  if (score >= 75) return { signal: 'Strong Accumulation', emoji: '🟢' };
  if (score >= 60) return { signal: 'Moderate Accumulation', emoji: '🟡' };
  if (score >= 40) return { signal: 'Neutral', emoji: '⚪' };
  if (score >= 25) return { signal: 'Distribution', emoji: '🟠' };
  return { signal: 'Strong Distribution', emoji: '🔴' };
}

export function amcInstitutionalConfidence(amcCount: number): { label: string; stars: number } {
  if (amcCount >= 20) return { label: 'Very High', stars: 5 };
  if (amcCount >= 15) return { label: 'High', stars: 4 };
  if (amcCount >= 10) return { label: 'Medium', stars: 3 };
  if (amcCount >= 5) return { label: 'Low', stars: 2 };
  return { label: 'Very Low', stars: 1 };
}

export function buildInterpretation(stockName: string, signal: SmartMoneySignalType): string {
  const shortName = stockName.replace(/\s+(Limited|Ltd\.?)$/i, '').trim();
  switch (signal) {
    case 'Aggressive Accumulation':
      return `Mutual funds across the industry are aggressively increasing their exposure to ${shortName}. This indicates strong institutional conviction and broad-based buying interest.`;
    case 'Strong Accumulation':
      return `Fund managers are meaningfully adding to ${shortName} across mutual funds. Institutional interest is clearly positive this month.`;
    case 'Moderate Accumulation':
      return `There is steady but measured buying in ${shortName}. Conviction is building without extreme one-sided activity.`;
    case 'Neutral':
      return `Fund activity in ${shortName} is mixed this month. Increases and reductions largely offset each other.`;
    case 'Distribution':
      return `More funds reduced than added to ${shortName} this month. Institutional conviction appears to be fading.`;
    case 'Strong Distribution':
      return `Mutual funds are exiting ${shortName} at scale. This reflects weak institutional conviction and broad selling pressure.`;
  }
}

export function concentrationMultiplier(ratio: number): number {
  if (ratio >= 0.4) return 1.0;
  if (ratio >= 0.2) return 0.75;
  if (ratio >= 0.1) return 0.5;
  return 0.25;
}

export function breadthRaw(amcsBuying: number, buyingFunds: number): number {
  if (buyingFunds <= 0 || amcsBuying <= 0) return 0;
  return amcsBuying * concentrationMultiplier(amcsBuying / buyingFunds);
}

/** Negative net weight — explicit tiers (points out of 35). */
export function negativeNetWeightPoints(pct: number): number {
  if (pct >= 0) return 0;
  if (pct >= -0.5) return 9.8;
  if (pct >= -1) return 7.0;
  if (pct >= -2) return 4.9;
  if (pct >= -3) return 2.8;
  return 0;
}

export function percentilePoints(value: number, max: number, factorMax: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(factorMax, (value / max) * factorMax);
}

export function invertedPercentilePoints(value: number, max: number, factorMax: number): number {
  if (max <= 0) return factorMax;
  return Math.max(0, (1 - value / max) * factorMax);
}

export function isStrictPositiveMonth(m: { pctChanges: number[] }): boolean {
  if (m.pctChanges.length === 0) return false;
  return m.pctChanges.every((p) => p > 0);
}

export function consecutiveStrictTrend(
  sortedMonths: string[],
  lookup: (month: string) => { pctChanges: number[] } | undefined
): number {
  let count = 0;
  for (let i = sortedMonths.length - 1; i >= 0; i--) {
    const m = lookup(sortedMonths[i]);
    if (!m || !isStrictPositiveMonth(m)) break;
    count++;
  }
  return count;
}

export interface CategoryMaxes {
  maxPositiveNetWeight: number;
  maxNetBuying: number;
  maxFreshEntries: number;
  maxCompleteExits: number;
  maxBreadthRaw: number;
  maxConsecutiveMonths: number;
}

export function computeCategoryMaxes(
  items: Array<{
    netWeightChangePct: number;
    increasedCount: number;
    decreasedCount: number;
    freshEntries: number;
    completeExits: number;
    amcsBuying: number;
    buyingFunds: number;
    consecutivePositiveMonths: number;
  }>
): CategoryMaxes {
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
    const netBuying = item.increasedCount - item.decreasedCount;
    if (netBuying > maxNetBuying) maxNetBuying = netBuying;
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function scoreStockInCategory(
  raw: RawStockMonthCategoryMetrics & { consecutivePositiveMonths: number },
  maxes: CategoryMaxes
): {
  convictionScore: number;
  factorScores: SignalFactorScores;
  factorBreakdown: SmartMoneySignalRow['factorBreakdown'];
} {
  const netWeight = raw.netWeightChangePct;
  const netBuying = raw.increasedCount - raw.decreasedCount;
  const buyingFunds = raw.increasedCount + raw.freshEntries;
  const amcsBuying = raw.amcIdsBuying.size;
  const brRaw = breadthRaw(amcsBuying, buyingFunds);
  const trendMonths = raw.consecutivePositiveMonths;

  const netWeightPoints =
    netWeight >= 0
      ? percentilePoints(netWeight, maxes.maxPositiveNetWeight, FACTOR_MAX.netWeight)
      : negativeNetWeightPoints(netWeight);

  const netBuyingPoints = percentilePoints(netBuying, maxes.maxNetBuying, FACTOR_MAX.netBuying);
  const freshPoints = percentilePoints(raw.freshEntries, maxes.maxFreshEntries, FACTOR_MAX.freshEntries);
  const exitPoints = invertedPercentilePoints(
    raw.completeExits,
    maxes.maxCompleteExits,
    FACTOR_MAX.exits
  );
  const amcPoints = percentilePoints(brRaw, maxes.maxBreadthRaw, FACTOR_MAX.amcBreadth);
  const trendPoints = percentilePoints(trendMonths, maxes.maxConsecutiveMonths, FACTOR_MAX.trend);

  const factorScores: SignalFactorScores = {
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
          factorScores.trend
      )
    )
  );

  const factorBreakdown = {
    netWeightChange: {
      raw: round1(netWeight),
      categoryMax: round1(maxes.maxPositiveNetWeight),
      points: factorScores.netWeightChange,
      maxPoints: FACTOR_MAX.netWeight,
    },
    netBuying: {
      raw: netBuying,
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

export function shortFundDisplayName(name: string): string {
  const shortened = String(name)
    .replace(/\s*-\s*Direct\s+Plan.*$/i, '')
    .replace(/\s*FUND\s*-\s*DIRECT\s+PLAN.*$/i, '')
    .replace(/\s*Direct\s+Plan.*$/i, '')
    .replace(/\s+Growth\s+Option.*$/i, '')
    .replace(/\s+Growth\s*$/i, '')
    .trim();
  return shortened || name;
}

export function buildSignalRowFromMetrics(
  raw: RawStockMonthCategoryMetrics & { consecutivePositiveMonths: number },
  maxes: CategoryMaxes
): SmartMoneySignalRow {
  const { convictionScore, factorScores, factorBreakdown } = scoreStockInCategory(raw, maxes);
  const { signal, emoji } = scoreToSignal(convictionScore);
  const amcCount = raw.amcIdsAll.size;
  const conf = amcInstitutionalConfidence(amcCount);
  const buyingFunds = raw.increasedCount + raw.freshEntries;

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
    netBuying: raw.increasedCount - raw.decreasedCount,
    netWeightChangePct: round1(raw.netWeightChangePct),
    amcCount,
    amcsBuying: raw.amcIdsBuying.size,
    buyingFunds,
    institutionalConfidence: conf.label,
    confidenceStars: conf.stars,
    consecutivePositiveMonths: raw.consecutivePositiveMonths,
    factorScores,
    factorBreakdown,
    interpretation: buildInterpretation(raw.stockName, signal),
    fundsHolding: 0,
    topFundHolders: [],
  };
}

/** @deprecated Rows are one-per-stock; kept for safe client merges during rollout. */
export function dedupeSignalsByStock(rows: SmartMoneySignalRow[]): SmartMoneySignalRow[] {
  const bySlug = new Map<string, SmartMoneySignalRow>();
  for (const row of rows) {
    const prev = bySlug.get(row.stockSlug);
    if (!prev || row.convictionScore > prev.convictionScore) {
      bySlug.set(row.stockSlug, row);
    }
  }
  return [...bySlug.values()];
}

export function stockSignalMetaLine(row: SmartMoneySignalRow): string {
  const cap = stockCapDisplayLabel(row.category);
  const parts = [row.sector];
  if (cap) parts.push(cap);
  parts.push(row.month);
  return parts.join(' · ');
}
