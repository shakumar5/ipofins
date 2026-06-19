import type { PageMeta } from './page-meta';

export type SmartMoneyTab = 'tracker' | 'signals' | 'stock-signal' | 'sectors';

const BASE_PATH = '/mutual-funds/smart-money';

export const SMART_MONEY_TAB_HASH: Record<SmartMoneyTab, string> = {
  tracker: '',
  signals: '#signals',
  'stock-signal': '#stock-signal',
  sectors: '#sector-intelligence',
};

export function getSmartMoneyPageMeta(tab: SmartMoneyTab): PageMeta {
  const path = `${BASE_PATH}${SMART_MONEY_TAB_HASH[tab]}`;
  switch (tab) {
    case 'signals':
      return {
        title: 'Smart Money Signal 2026 - Institutional Conviction Scores | IPOFins',
        description:
          'Ranked stocks scored 0–100 by mutual fund institutional activity. Net weight change, fresh entries, exits, and AMC breadth by fund category.',
        path,
        heading: 'Smart Money Signal',
        subtitle: 'Institutional conviction scores — ranked stocks by fund-manager buying and selling activity.',
        breadcrumbLabel: 'Smart Money Signal',
      };
    case 'stock-signal':
      return {
        title: 'Stock Signal 2026 - Mutual Fund Institutional Activity | IPOFins',
        description:
          'Pick any stock and see conviction score, funds holding, increases, reductions, fresh entries and exits across mutual funds.',
        path,
        heading: 'Stock Signal',
        subtitle: 'Stock-level drill-down — institutional profile, conviction score, and top fund holders.',
        breadcrumbLabel: 'Stock Signal',
      };
    case 'sectors':
      return {
        title: 'Sector Intelligence 2026 - Mutual Fund Sector Rotation | IPOFins',
        description:
          'Track mutual fund sector rotation across Banking, IT, Pharma, Capital Markets and more. Month-on-month AUM change and conviction trends.',
        path,
        heading: 'Sector Intelligence',
        subtitle: 'Which sectors fund managers are accumulating or reducing — from official AMC disclosures.',
        breadcrumbLabel: 'Sector Intelligence',
      };
    default:
      return {
        title: 'Smart Money Tracker 2026 - Fund Buying, Selling & Sector Rotation | IPOFins',
        description:
          'See which stocks mutual funds are buying and selling. Most bought, most sold, fresh entries and complete exits from AMC monthly disclosures.',
        path,
        heading: 'Smart Money Tracker',
        subtitle: 'Track institutional conviction — what fund managers are buying, selling, and rotating at the stock level.',
        breadcrumbLabel: 'Smart Money',
      };
  }
}
