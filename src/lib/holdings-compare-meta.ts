import type { PageMeta } from './page-meta';
import { mfTabConfig } from './mf-section-config';
import { monthDisplay, monthSlug } from '../utils/month-slug';

export const HOLDINGS_CHANGES_BASE = '/mutual-funds/mutual-fund-holdings-changes';

const defaultMeta = mfTabConfig('holdings-changes');

export function fundSlugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function categoryFromSlug(slug: string, known: string[]): string | null {
  const hit = known.find((c) => categorySlug(c) === slug);
  return hit ?? null;
}

export interface HoldingsChangesUrlState {
  amcSlug: string;
  amcName: string;
  month2: string;
  month1: string;
  fundSlug: string;
  fundName: string;
  category: string;
}

function buildQuery(opts: {
  month1?: string;
  month2?: string;
  fund?: string;
  category?: string;
  allMonths?: string[];
}): string {
  const params = new URLSearchParams();
  if (opts.month1 && opts.month2 && opts.allMonths?.length) {
    const idx = opts.allMonths.indexOf(opts.month2);
    const autoPrev = idx > 0 ? opts.allMonths[idx - 1] : '';
    if (opts.month1 !== autoPrev) params.set('from', monthSlug(opts.month1));
  }
  if (opts.fund && opts.fund !== 'All') {
    params.set('fund', fundSlugFromName(opts.fund));
  }
  if (opts.category && opts.category !== 'All') {
    params.set('category', categorySlug(opts.category));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Canonical shareable path (matches static /[amc]/[month] pages + optional query). */
export function holdingsChangesPath(opts: {
  amcSlug?: string;
  month2?: string;
  month1?: string;
  fund?: string;
  category?: string;
  allMonths?: string[];
}): string {
  const { amcSlug, month2, month1, fund, category, allMonths } = opts;
  if (!amcSlug || !month2) {
    return HOLDINGS_CHANGES_BASE;
  }

  const path = `${HOLDINGS_CHANGES_BASE}/${amcSlug}/${monthSlug(month2)}`;
  return path + buildQuery({ month1, month2, fund, category, allMonths });
}

export function parseHoldingsChangesLocation(
  pathname: string,
  search: string,
  amcNameBySlug: Record<string, string>,
  fundNameBySlug?: Map<string, string>,
  knownCategories: string[] = [],
): Partial<HoldingsChangesUrlState> {
  const out: Partial<HoldingsChangesUrlState> = {
    amcSlug: '',
    amcName: '',
    month2: '',
    month1: '',
    fundSlug: '',
    fundName: '',
    category: 'All',
  };

  if (!pathname.startsWith(HOLDINGS_CHANGES_BASE)) return out;

  const rest = pathname.slice(HOLDINGS_CHANGES_BASE.length).replace(/^\//, '');
  const [amcSlug, month2Slug] = rest.split('/').filter(Boolean);

  if (amcSlug) {
    out.amcSlug = decodeURIComponent(amcSlug);
    out.amcName = amcNameBySlug[out.amcSlug] || '';
  }
  if (month2Slug) {
    out.month2 = monthDisplay(decodeURIComponent(month2Slug));
  }

  const params = new URLSearchParams(search);
  const fromSlug = params.get('from');
  if (fromSlug) out.month1 = monthDisplay(fromSlug);

  const fundSlug = params.get('fund');
  if (fundSlug) {
    out.fundSlug = fundSlug;
    out.fundName = fundNameBySlug?.get(fundSlug) || '';
  }

  const catSlug = params.get('category');
  if (catSlug) {
    out.category = categoryFromSlug(catSlug, knownCategories) || 'All';
  }

  return out;
}

export function buildFundSlugMap(holdings: Record<string, { name: string }> | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!holdings) return map;
  for (const f of Object.values(holdings)) {
    map.set(fundSlugFromName(f.name), f.name);
  }
  return map;
}

export function getHoldingsComparePageMeta(opts: {
  amcName?: string;
  month2?: string;
  month1?: string;
  fundName?: string;
  amcSlug?: string;
  path: string;
}): PageMeta {
  const { amcName, month2, month1, fundName, path } = opts;

  if (!amcName || !month2) {
    return {
      title: defaultMeta.title,
      description: defaultMeta.description,
      path: HOLDINGS_CHANGES_BASE,
      heading: defaultMeta.heading,
      subtitle: defaultMeta.subtitle,
      breadcrumbLabel: 'Holdings Changes',
    };
  }

  const fundNote = fundName && fundName !== 'All' ? ` — ${fundName}` : '';
  const range = month1 ? `${month1} → ${month2}` : month2;

  return {
    title: `${amcName} Holdings Changes ${month2}${fundNote} | IPOFins`,
    description: `Stocks bought and sold by ${amcName} mutual funds${fundNote} between ${range}. Official AMC monthly portfolio disclosures.`,
    path,
    heading: `${amcName} Holdings Changes — ${month2}`,
    subtitle: `Portfolio additions and removals${fundNote ? ` for ${fundName}` : ''} (${range})`,
    breadcrumbLabel: `${amcName} — ${month2}`,
  };
}
