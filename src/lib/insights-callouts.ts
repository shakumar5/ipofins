import { getInsightsArticles, type LearnArticle } from './learn-articles';

export type InsightCalloutContext =
  | 'smart-money-hub'
  | 'fresh-entries'
  | 'complete-exits'
  | 'signals'
  | 'sectors'
  | 'overlap'
  | 'holdings-amc'
  | 'sast'
  | 'one-percent';

export function monthLabelToSlug(month: string): string {
  return month.toLowerCase().replace(/\s+/g, '-');
}

function findInsightBySlug(slug: string): LearnArticle | undefined {
  return getInsightsArticles().find((a) => a.slug === slug);
}

/** Latest disclosure month from generated insights (e.g. "may-2026"). */
export function getLatestInsightsMonthSlug(): string | null {
  const withMonth = getInsightsArticles().find((a) => a.month);
  return withMonth?.month ? monthLabelToSlug(withMonth.month) : null;
}

export function getInsightCallout(
  context: InsightCalloutContext,
  opts?: { amcSlug?: string; monthSlug?: string },
): LearnArticle | null {
  const monthSlug = opts?.monthSlug ?? getLatestInsightsMonthSlug();

  switch (context) {
    case 'smart-money-hub':
      return monthSlug ? findInsightBySlug(`smart-money-monthly-${monthSlug}`) ?? null : null;
    case 'fresh-entries':
      return monthSlug ? findInsightBySlug(`mf-fresh-entries-${monthSlug}`) ?? null : null;
    case 'complete-exits':
      return monthSlug ? findInsightBySlug(`mf-complete-exits-${monthSlug}`) ?? null : null;
    case 'signals':
      return monthSlug ? findInsightBySlug(`mf-conviction-by-cap-${monthSlug}`) ?? null : null;
    case 'sectors':
      return monthSlug ? findInsightBySlug(`mf-sector-rotation-${monthSlug}`) ?? null : null;
    case 'overlap':
      if (monthSlug) {
        const match = findInsightBySlug(`highest-mf-overlap-pairs-${monthSlug}`);
        if (match) return match;
      }
      return getInsightsArticles().find((a) => a.slug.startsWith('highest-mf-overlap-pairs-')) ?? null;
    case 'holdings-amc':
      if (!opts?.amcSlug || !monthSlug) return null;
      return findInsightBySlug(`${opts.amcSlug}-stocks-bought-${monthSlug}`) ?? null;
    case 'sast':
      return findInsightBySlug('sast-weekly-digest') ?? null;
    case 'one-percent':
      return findInsightBySlug('one-percent-club-snapshot') ?? null;
    default:
      return null;
  }
}

interface SmartMoneyCalloutInput {
  parsedTab: 'tracker' | 'signals' | 'sectors' | 'stock-signal' | null;
  trackerView?: 'most_bought' | 'most_sold' | 'fresh_entries' | 'complete_exits' | null;
}

/** Pick the best insights article for the current Smart Money view. */
export function getSmartMoneyInsightCallout(input: SmartMoneyCalloutInput): LearnArticle | null {
  const { parsedTab, trackerView } = input;

  if (parsedTab === 'signals') return getInsightCallout('signals');
  if (parsedTab === 'sectors') return getInsightCallout('sectors');
  if (trackerView === 'fresh_entries') return getInsightCallout('fresh-entries');
  if (trackerView === 'complete_exits') return getInsightCallout('complete-exits');
  if (trackerView) return getInsightCallout('smart-money-hub');
  if (!parsedTab || parsedTab === 'tracker') return getInsightCallout('smart-money-hub');
  return null;
}

export const INSIGHT_CALLOUT_LABELS: Record<InsightCalloutContext, string> = {
  'smart-money-hub': 'Monthly digest',
  'fresh-entries': 'Fresh entries analysis',
  'complete-exits': 'Complete exits analysis',
  signals: 'Conviction analysis',
  sectors: 'Sector rotation analysis',
  overlap: 'Overlap analysis',
  'holdings-amc': 'AMC holdings analysis',
  sast: 'SAST digest',
  'one-percent': '1% Club snapshot',
};
