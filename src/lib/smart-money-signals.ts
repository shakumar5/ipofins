import { computeConvictionScoreV2 } from './conviction-score-v2';

export type SmartMoneySignalType =
  | 'Aggressive Accumulation'
  | 'Strong Accumulation'
  | 'Accumulation'
  | 'Positive'
  | 'Neutral'
  | 'Distribution'
  | 'Aggressive Distribution';

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
  scoringModel?: 'conviction-v2' | 'stock-cap-v2' | 'fund-scheme-v1',
): string[] {
  const useStockCapBuckets =
    scoringModel === 'conviction-v2' ||
    scoringModel === 'stock-cap-v2' ||
    !isLegacyFundSchemeSignals(categories);
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
  netFundActivity: number;
  freshEntry: number;
  exitPenalty: number;
  amcParticipation: number;
  trend: number;
  netWeightChange: number;
}

export interface FactorBreakdown {
  raw: number;
  detail: string;
  points: number;
  maxPoints: number;
}

export interface ConvictionV2Meta {
  rawTotal: number;
  capMultiplier: number;
  totalActiveAmcs: number;
}

export interface FundActivityLists {
  increased: string[];
  decreased: string[];
  freshEntry: string[];
  completeExit: string[];
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
  factorScores?: SignalFactorScores;
  factorBreakdown?: {
    netFundActivity: FactorBreakdown;
    freshEntry: FactorBreakdown;
    exitPenalty: FactorBreakdown;
    amcParticipation: FactorBreakdown;
    trend: FactorBreakdown;
    netWeightChange: FactorBreakdown;
  };
  convictionV2?: ConvictionV2Meta;
  fundActivity?: FundActivityLists;
  interpretation?: string;
  fundsHolding: number;
  topFundHolders: string[];
  /** NSE trading symbol when available (e.g. TCS, INFY). */
  nseSymbol?: string;
}

export const SIGNAL_OPTIONS: { value: SmartMoneySignalType | 'All'; label: string }[] = [
  { value: 'All', label: 'All Signals' },
  { value: 'Aggressive Accumulation', label: '🚀 Aggressive Accumulation' },
  { value: 'Strong Accumulation', label: '🟢 Strong Accumulation' },
  { value: 'Accumulation', label: '🟡 Accumulation' },
  { value: 'Positive', label: '⚪ Positive' },
  { value: 'Neutral', label: '⚪ Neutral' },
  { value: 'Distribution', label: '🟠 Distribution' },
  { value: 'Aggressive Distribution', label: '🚨 Aggressive Distribution' },
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
  amcIdsAll: Set<number>;
  amcIdsBuying: Set<number>;
  fundsHolding?: number;
  totalActiveAmcs?: number;
  fundActivity?: FundActivityLists;
  nseSymbol?: string;
}

export interface SmartMoneySignalsData {
  months: string[];
  categories: string[];
  rows: SmartMoneySignalRow[];
  scoringModel?: 'conviction-v2';
  totalActiveAmcsByMonth?: Record<string, number>;
}

/** v2 stock signal bands — use for Smart Money Signal rows only. */
export function scoreToStockSignal(score: number): { signal: SmartMoneySignalType; emoji: string } {
  if (score >= 90) return { signal: 'Aggressive Accumulation', emoji: '🚀' };
  if (score >= 80) return { signal: 'Strong Accumulation', emoji: '🟢' };
  if (score >= 70) return { signal: 'Accumulation', emoji: '🟡' };
  if (score >= 60) return { signal: 'Positive', emoji: '⚪' };
  if (score >= 40) return { signal: 'Neutral', emoji: '⚪' };
  if (score >= 20) return { signal: 'Distribution', emoji: '🟠' };
  return { signal: 'Aggressive Distribution', emoji: '🚨' };
}

/** Legacy sector bands (percentile AUM model). */
export function scoreToSignal(score: number): { signal: string; emoji: string } {
  if (score >= 90) return { signal: 'Aggressive Accumulation', emoji: '🚀' };
  if (score >= 75) return { signal: 'Strong Accumulation', emoji: '🟢' };
  if (score >= 60) return { signal: 'Moderate Accumulation', emoji: '🟡' };
  if (score >= 40) return { signal: 'Neutral', emoji: '⚪' };
  if (score >= 25) return { signal: 'Distribution', emoji: '🟠' };
  return { signal: 'Strong Distribution', emoji: '🔴' };
}

/** Confidence derived from conviction score (v2). */
export function scoreBasedConfidence(score: number): { label: string; stars: number } {
  if (score >= 90) return { label: 'Very High', stars: 5 };
  if (score >= 75) return { label: 'High', stars: 4 };
  if (score >= 60) return { label: 'Medium', stars: 3 };
  if (score >= 40) return { label: 'Low', stars: 2 };
  return { label: 'Very Low', stars: 1 };
}

export function buildInterpretation(stockName: string, signal: SmartMoneySignalType): string {
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
  }
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
): SmartMoneySignalRow {
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

  const factorScores: SignalFactorScores = {
    netFundActivity: v2.factorScores.netFundActivity,
    freshEntry: v2.factorScores.freshEntry,
    exitPenalty: v2.factorScores.exitPenalty,
    amcParticipation: v2.factorScores.amcParticipation,
    trend: v2.factorScores.trend,
    netWeightChange: v2.factorScores.netWeightChange,
  };

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
    factorScores,
    factorBreakdown: v2.factorBreakdown,
    convictionV2: {
      rawTotal: v2.rawTotal,
      capMultiplier: v2.capMultiplier,
      totalActiveAmcs,
    },
    ...(raw.fundActivity ? { fundActivity: raw.fundActivity } : {}),
    interpretation: buildInterpretation(raw.stockName, signal),
    fundsHolding,
    topFundHolders: [],
    ...(raw.nseSymbol ? { nseSymbol: raw.nseSymbol } : {}),
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

/** Drop bulky fields from table/search payloads; detail pages load full rows per category. */
export function stripSignalRowForList(row: SmartMoneySignalRow): SmartMoneySignalRow {
  if (!row.fundActivity) return row;
  const { fundActivity: _fa, ...lite } = row;
  return lite;
}
