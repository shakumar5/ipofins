import { catToSlug } from './fund-category-slug';
import type { FundTableKind } from './fund-table-meta';
import { SMART_MONEY_BASE_PATH, smartMoneyTabPath } from './smart-money-meta';
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
  const base = detailSlug.replace(/-holdings$/, '');
  return appendFromParam(`/mutual-funds/fund/${base}-holdings`, table);
}

/** Holdings page link with list-context query params for ListBackLink. */
export function fundHoldingsDetailHref(
  detailSlug: string,
  from: MfListFrom,
  extra?: Record<string, string>,
): string {
  const base = detailSlug.replace(/-holdings$/, '');
  return appendFromParam(`/mutual-funds/fund/${base}-holdings`, from, extra);
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
  return appendFromParam(stockSignalPath(stockSlug), from, params);
}

export function stockSignalDetailBackNav(): { href: string; label: string } {
  return SMART_MONEY_LIST_BACK.signals;
}

/** Resolve contextual back link from URL search params (client or Astro.url). */
export function resolveListBackFromParams(
  params: URLSearchParams,
  variants: Record<string, { href: string; label: string }>,
  fallbackHref: string,
  fallbackLabel: string,
): { href: string; label: string } {
  const from = params.get('from');
  if (!from) {
    return { href: fallbackHref, label: fallbackLabel };
  }

  if (from === 'sector') {
    const sector = params.get('sector');
    if (sector) {
      const sectorLabel = params.get('sectorLabel');
      return {
        href: `/ipo/sector/${sector}`,
        label: sectorLabel ? `Back to ${sectorLabel} IPOs` : 'Back to Sector IPOs',
      };
    }
  }

  if (from === 'fund') {
    const fundSlug = params.get('fundSlug');
    if (fundSlug) {
      const fundName = params.get('fundName');
      return {
        href: `/mutual-funds/fund/${fundSlug}`,
        label: fundName ? `Back to ${fundName}` : 'Back to Fund Details',
      };
    }
  }

  if (from === 'fund-overlap') {
    const fundSlug = params.get('fundSlug');
    if (fundSlug) {
      const fundName = params.get('fundName');
      return {
        href: `/mutual-funds/fund-overlap/${fundSlug}`,
        label: fundName ? `Back to ${fundName} overlap` : 'Back to Fund Overlap',
      };
    }
  }

  if (from === 'tracker-view') {
    const viewPath = params.get('viewPath');
    if (viewPath && viewPath.startsWith('/mutual-funds/smart-money/')) {
      const viewLabel = params.get('viewLabel');
      return {
        href: viewPath,
        label: viewLabel || 'Back to Smart Money Tracker',
      };
    }
  }

  if (from === 'signals') {
    const month = params.get('month');
    const category = params.get('category');
    let href = '/mutual-funds/smart-money/smart-money-signal';
    const q = new URLSearchParams();
    if (month) q.set('month', month);
    if (category && category !== 'All') q.set('category', category);
    const qs = q.toString();
    if (qs) href += `?${qs}`;
    return { href, label: 'Back to Smart Money Signal' };
  }

  if (from === 'stock-signal') {
    const stockSlug = params.get('stockSlug');
    const stockName = params.get('stockName');
    const href = stockSlug
      ? stockSignalPath(stockSlug)
      : STOCK_SIGNAL_BASE;
    return {
      href,
      label: stockName ? `Back to ${stockName}` : 'Back to Stock Signal',
    };
  }

  const match = variants[from];
  if (match) return match;

  return { href: fallbackHref, label: fallbackLabel };
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
