import { catToSlug } from './fund-category-slug';
import type { FundTableKind } from './fund-table-meta';
import { SMART_MONEY_BASE_PATH, smartMoneyTabPath } from './smart-money-meta';
import { signalDetailPath } from './signal-detail-meta';
import { STOCK_SIGNAL_BASE, stockSignalPath } from './stock-signal-meta';

export type IpoListFrom =
  | 'all'
  | 'mainboard'
  | 'sme'
  | 'upcoming'
  | 'subscription'
  | 'allotment'
  | 'performance'
  | 'sector';

export type SmartMoneyListFrom = 'tracker' | 'signals' | 'stock-signal' | 'sectors' | 'tracker-view';

export type MfListFrom =
  | 'all'
  | 'best'
  | 'holdings-changes'
  | 'fund-overlap'
  | 'fund'
  | 'smart-money';

export function appendFromParam(path: string, from: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  params.set('from', from);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function fundListBackNav(table: FundTableKind, category: string): { href: string; label: string } {
  const slug = catToSlug(category);
  const base = table === 'best' ? '/mutual-funds/best' : '/mutual-funds/all';
  if (table === 'best') {
    return {
      href: `${base}/${slug}`,
      label: `Back to Best ${category} Mutual Funds`,
    };
  }
  return {
    href: `${base}/${slug}`,
    label: `Back to ${category} Mutual Funds`,
  };
}

export function fundListBackVariants(category: string): Record<FundTableKind, { href: string; label: string }> {
  return {
    all: fundListBackNav('all', category),
    best: fundListBackNav('best', category),
  };
}

export function fundDetailHref(detailSlug: string, table: FundTableKind): string {
  return appendFromParam(`/mutual-funds/fund/${detailSlug}-holdings`, table);
}

export const IPO_LIST_BACK: Record<IpoListFrom, { href: string; label: string }> = {
  all: { href: '/ipo', label: 'Back to All IPOs' },
  mainboard: { href: '/ipo/mainboard', label: 'Back to Mainboard IPOs' },
  sme: { href: '/ipo/sme', label: 'Back to SME IPOs' },
  upcoming: { href: '/ipo/upcoming', label: 'Back to Upcoming IPOs' },
  subscription: { href: '/ipo/subscription-status', label: 'Back to Subscription Status' },
  allotment: { href: '/ipo/allotment-status', label: 'Back to Allotment Status' },
  performance: { href: '/ipo/performance/2026', label: 'Back to IPO Performance' },
  sector: { href: '/ipo', label: 'Back to IPOs' },
};

export function defaultIpoListBack(type: 'mainboard' | 'sme'): { href: string; label: string } {
  return type === 'sme' ? IPO_LIST_BACK.sme : IPO_LIST_BACK.mainboard;
}

export function ipoDetailHref(slug: string, from: IpoListFrom, extra?: Record<string, string>): string {
  return appendFromParam(`/ipo/${slug}`, from, extra);
}

export function ipoSectorBackNav(sectorSlug: string, sectorName: string): { href: string; label: string } {
  return {
    href: `/ipo/sector/${sectorSlug}`,
    label: `Back to ${sectorName} IPOs`,
  };
}

export const SMART_MONEY_LIST_BACK: Record<Exclude<SmartMoneyListFrom, 'tracker-view'>, { href: string; label: string }> = {
  tracker: { href: smartMoneyTabPath('tracker'), label: 'Back to Smart Money Tracker' },
  signals: { href: smartMoneyTabPath('signals'), label: 'Back to Smart Money Signal' },
  'stock-signal': { href: STOCK_SIGNAL_BASE, label: 'Back to Stock Signal' },
  sectors: { href: smartMoneyTabPath('sectors'), label: 'Back to Sector Intelligence' },
};

export function defaultSignalDetailBack(): { href: string; label: string } {
  return SMART_MONEY_LIST_BACK.signals;
}

export function signalDetailHref(
  stockSlug: string,
  from: SmartMoneyListFrom,
  month?: string,
  category?: string,
  extra?: Record<string, string>,
): string {
  const params: Record<string, string> = { ...extra };
  if (month) params.month = month;
  if (category) params.category = category;
  return appendFromParam(signalDetailPath(stockSlug), from, params);
}

export function stockSignalDetailBackNav(stockName?: string, stockSlug?: string): { href: string; label: string } {
  if (stockSlug && stockName) {
    return {
      href: stockSignalPath(stockSlug),
      label: `Back to ${stockName}`,
    };
  }
  return SMART_MONEY_LIST_BACK['stock-signal'];
}

export const MF_LIST_BACK: Record<Exclude<MfListFrom, 'fund'>, { href: string; label: string }> = {
  all: { href: '/mutual-funds/all', label: 'Back to All Mutual Funds' },
  best: { href: '/mutual-funds/best', label: 'Back to Best Mutual Funds' },
  'holdings-changes': { href: '/mutual-funds/mutual-fund-holdings-changes', label: 'Back to Holdings Changes' },
  'fund-overlap': { href: '/mutual-funds/fund-overlap', label: 'Back to Fund Overlap' },
  'smart-money': { href: SMART_MONEY_BASE_PATH, label: 'Back to Smart Money Tracker' },
};

export function defaultFundOverlapBack(): { href: string; label: string } {
  return MF_LIST_BACK['fund-overlap'];
}

export function fundOverlapDetailHref(fundSlug: string, from: MfListFrom, extra?: Record<string, string>): string {
  return appendFromParam(`/mutual-funds/fund-overlap/${fundSlug}`, from, extra);
}

export function holdingsChangesDetailHref(amcSlug: string, monthSlug: string, from: MfListFrom = 'holdings-changes'): string {
  return appendFromParam(`/mutual-funds/mutual-fund-holdings-changes/${amcSlug}/${monthSlug}`, from);
}

export function defaultHoldingsChangesBack(): { href: string; label: string } {
  return MF_LIST_BACK['holdings-changes'];
}
