import type { PageMeta } from './page-meta';
import { withBrandSuffix } from './brand';
import { parseTrackerFromPathname } from './smart-money-tracker-meta';

export type SmartMoneyTab = 'tracker' | 'signals' | 'stock-signal' | 'sectors';

export const SMART_MONEY_BASE_PATH = '/mutual-funds/smart-money';

const TAB_SLUGS: Record<Exclude<SmartMoneyTab, 'tracker'>, string> = {
  signals: 'smart-money-signal',
  'stock-signal': 'stock-signal',
  sectors: 'sector-intelligence',
};

/** @deprecated Use smartMoneyTabPath() — legacy hash URLs redirect client-side. */
export const SMART_MONEY_TAB_HASH: Record<SmartMoneyTab, string> = {
  tracker: '',
  signals: '#signals',
  'stock-signal': '#stock-signal',
  sectors: '#sector-intelligence',
};

export function smartMoneyTabPath(tab: SmartMoneyTab): string {
  if (tab === 'tracker') return SMART_MONEY_BASE_PATH;
  return `${SMART_MONEY_BASE_PATH}/${TAB_SLUGS[tab]}`;
}

export function parseSmartMoneyTabFromPathname(pathname: string): SmartMoneyTab | null {
  if (!pathname.startsWith(SMART_MONEY_BASE_PATH)) return null;
  if (parseTrackerFromPathname(pathname)) return 'tracker';

  const rest = pathname.slice(SMART_MONEY_BASE_PATH.length).replace(/^\//, '');
  if (!rest || rest.startsWith('signal/')) return null;

  for (const [tab, slug] of Object.entries(TAB_SLUGS) as [Exclude<SmartMoneyTab, 'tracker'>, string][]) {
    if (rest === slug) return tab;
    if (rest.startsWith(`${slug}/`)) return null;
  }
  return null;
}

export function getSmartMoneyPageMeta(tab: SmartMoneyTab): PageMeta {
  const path = smartMoneyTabPath(tab);
  switch (tab) {
    case 'signals':
      return {
        title: withBrandSuffix('Smart Money Signal 2026 - Institutional Conviction Scores'),
        description:
          'Ranked stocks scored 0–100 from aggregated mutual fund activity. One row per stock, percentile-ranked vs peers in the same market-cap bucket.',
        path,
        heading: 'Smart Money Signal',
        subtitle: 'Institutional conviction — one score per stock, aggregated across all mutual funds.',
        breadcrumbLabel: 'Smart Money Signal',
      };
    case 'stock-signal':
      return {
        title: withBrandSuffix('Stock Signal 2026 - Mutual Fund Institutional Activity'),
        description:
          'Pick any stock and see conviction score, funds holding, increases, reductions, fresh entries and exits across mutual funds.',
        path,
        heading: 'Stock Signal',
        subtitle: 'Stock-level drill-down — institutional profile, conviction score, and top fund holders.',
        breadcrumbLabel: 'Stock Signal',
      };
    case 'sectors':
      return {
        title: withBrandSuffix('Sector Intelligence 2026 - Mutual Fund Sector Rotation'),
        description:
          'Track mutual fund sector rotation across Banking, IT, Pharma, Capital Markets and more. Month-on-month AUM change and conviction trends.',
        path,
        heading: 'Sector Intelligence',
        subtitle: 'Which sectors fund managers are accumulating or reducing — from official AMC disclosures.',
        breadcrumbLabel: 'Sector Intelligence',
      };
    default:
      return {
        title: withBrandSuffix('Smart Money Tracker 2026 - Fund Buying, Selling & Sector Rotation'),
        description:
          'See which stocks mutual funds are buying and selling. Most bought, most sold, fresh entries and complete exits from AMC monthly disclosures.',
        path,
        heading: 'Smart Money Tracker',
        subtitle: 'Track institutional conviction — what fund managers are buying, selling, and rotating at the stock level.',
        breadcrumbLabel: 'Smart Money',
      };
  }
}
