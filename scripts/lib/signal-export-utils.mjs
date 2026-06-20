/**
 * Smart Money Signal export tiers — list JSON must stay small (table/search).
 * Full breakdown + fund names live in per-category detail files only.
 */

export function categoryFileSlug(category) {
  return String(category)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function monthFileSlug(month) {
  return String(month).toLowerCase().replace(/\s+/g, '-');
}

export function signalCategoryFileName(month, category) {
  return `${monthFileSlug(month)}--${categoryFileSlug(category)}.json`;
}

export function signalCategoryDetailFileName(month, category) {
  return `${monthFileSlug(month)}--${categoryFileSlug(category)}--detail.json`;
}

export function signalSearchFileName(month) {
  return `${monthFileSlug(month)}--search.json`;
}

/** Whitelist — never spread ...rest (prevents accidental heavy fields). */
export function slimSignalRow(row) {
  return {
    stockName: row.stockName,
    stockSlug: row.stockSlug,
    sector: row.sector,
    category: row.category,
    month: row.month,
    convictionScore: row.convictionScore,
    signal: row.signal,
    signalEmoji: row.signalEmoji,
    increasedCount: row.increasedCount,
    decreasedCount: row.decreasedCount,
    freshEntries: row.freshEntries,
    completeExits: row.completeExits,
    netBuying: row.netBuying,
    netWeightChangePct: row.netWeightChangePct,
    amcCount: row.amcCount,
    amcsBuying: row.amcsBuying,
    buyingFunds: row.buyingFunds,
    institutionalConfidence: row.institutionalConfidence,
    confidenceStars: row.confidenceStars,
    consecutivePositiveMonths: row.consecutivePositiveMonths,
    fundsHolding: row.fundsHolding,
    topFundHolders: Array.isArray(row.topFundHolders) ? row.topFundHolders.slice(0, 3) : [],
    ...(row.nseSymbol ? { nseSymbol: row.nseSymbol } : {}),
    ...(row.convictionV2 ? { convictionV2: row.convictionV2 } : {}),
  };
}

/** Detail overlay keyed by stockSlug in detail JSON files. */
export function detailSignalRow(row) {
  const hasDetail =
    row.factorBreakdown ||
    row.factorScores ||
    row.fundActivity ||
    row.interpretation;
  if (!hasDetail) return null;

  return {
    stockSlug: row.stockSlug,
    factorScores: row.factorScores,
    factorBreakdown: row.factorBreakdown,
    fundActivity: row.fundActivity,
    interpretation: row.interpretation,
  };
}

export function searchIndexEntry(row) {
  return {
    stockSlug: row.stockSlug,
    stockName: row.stockName,
    sector: row.sector,
    category: row.category,
    convictionScore: row.convictionScore,
    signal: row.signal,
    ...(row.nseSymbol ? { nseSymbol: row.nseSymbol } : {}),
  };
}

/** Fail build if list export regresses (heavy fields or oversized files). */
export function assertSlimListRow(row, context = '') {
  const forbidden = ['factorBreakdown', 'factorScores', 'fundActivity', 'interpretation'];
  for (const key of forbidden) {
    if (key in row && row[key] != null) {
      throw new Error(`List row must not include ${key}${context ? ` (${context})` : ''}`);
    }
  }
}
