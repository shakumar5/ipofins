import type { IPOStatus } from '../utils/ipo-status';

const IPO_PLACEHOLDER_RE =
  /^(&ndash;|&mdash;|&#0*8211;|&#0*8212;|n\/a|na|tba|not available|not disclosed|pending|—|–|-|\.)$/i;

/** Decode common HTML entities from scraped broker pages. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&#0*8211;/g, '–')
    .replace(/&#0*8212;/g, '—')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

export function isIpoPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return !Number.isFinite(value) || value === 0;
  const s = decodeHtmlEntities(String(value)).trim();
  if (!s) return true;
  if (IPO_PLACEHOLDER_RE.test(s)) return true;
  if (/^[–—\-\s.&]+$/u.test(s)) return true;
  return false;
}

export function ipoDisplayText(value: unknown, fallback?: string): string | undefined {
  if (isIpoPlaceholder(value)) return fallback;
  return decodeHtmlEntities(String(value)).trim();
}

export function ipoMetaLine(...parts: (unknown | false | null | undefined)[]): string {
  return parts
    .map((p) => ipoDisplayText(p))
    .filter((p): p is string => Boolean(p))
    .join(' • ');
}

export function sanitizeIpoStringField(value: unknown): string | undefined {
  const text = ipoDisplayText(value);
  return text || undefined;
}

/** Hide scrape junk like "10-10" (close-date fragments) from price band display. */
export function sanitizeIpoPriceRange(
  priceRange: unknown,
  type?: string,
  priceMax?: number | null,
): string | undefined {
  const text = sanitizeIpoStringField(priceRange);
  if (!text) return undefined;
  const nums = text.match(/\d[\d,.]*/g)?.map((n) => parseFloat(n.replace(/,/g, ''))) ?? [];
  if (!nums.length) return undefined;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const hi = priceMax != null && priceMax > 0 ? priceMax : max;
  if (!isPlausibleIpoPriceBand(min, hi, type || 'mainboard')) return undefined;
  return text;
}

export function sanitizeIpoOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n;
}

/**
 * Upper end of an IPO price band. Prefers the stored numeric `priceMax`,
 * then falls back to parsing every number out of `priceRange` (handles
 * "500-550", "500 – 550", "₹500 to ₹550") and taking the largest.
 */
function parsePriceBandNums(priceRange?: string): number[] {
  const nums = String(priceRange ?? '').match(/\d[\d,.]*/g);
  if (!nums?.length) return [];
  return nums
    .map((n) => parseFloat(n.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function looksLikeDateFragmentPrice(min?: number | null, max?: number | null): boolean {
  const lo = min != null ? Number(min) : null;
  const hi = max != null ? Number(max) : lo;
  if (hi == null || !Number.isFinite(hi)) return false;

  const hiLooksLikeYear = hi >= 2000 && hi <= 2100 && Number.isInteger(hi);
  const loLooksLikeDay = lo != null && lo >= 1 && lo <= 31 && Number.isInteger(lo);
  const loneYearLike = lo != null && lo === hi && hiLooksLikeYear;
  return hiLooksLikeYear && (loLooksLikeDay || loneYearLike);
}

function isPlausibleIpoPriceBand(
  min?: number | null,
  max?: number | null,
  type: string = 'mainboard',
): boolean {
  const hi = max != null ? max : min;
  const lo = min != null ? min : null;
  const floor = type === 'sme' ? 12 : 30;
  if (hi == null || !Number.isFinite(hi) || hi < floor) return false;
  if (lo != null && Number.isFinite(lo) && lo > hi) return false;
  if (looksLikeDateFragmentPrice(lo, hi)) return false;
  return true;
}

export function ipoUpperPrice(input: {
  priceMax?: number | null;
  priceRange?: string;
  type?: string;
}): number | null {
  if (input.priceMax != null && input.priceMax > 0 && isPlausibleIpoPriceBand(null, input.priceMax, input.type)) {
    return input.priceMax;
  }
  const parsed = parsePriceBandNums(input.priceRange);
  const max = parsed.length ? Math.max(...parsed) : null;
  return max != null && isPlausibleIpoPriceBand(null, max, input.type) ? max : null;
}

export function ipoLowerPrice(input: {
  priceMin?: number | null;
  priceMax?: number | null;
  priceRange?: string;
  type?: string;
}): number | null {
  if (input.priceMin != null && input.priceMin > 0 && isPlausibleIpoPriceBand(input.priceMin, input.priceMax ?? input.priceMin, input.type)) {
    return input.priceMin;
  }
  const parsed = parsePriceBandNums(input.priceRange);
  if (!parsed.length) return null;
  const min = Math.min(...parsed);
  const max = Math.max(...parsed);
  return isPlausibleIpoPriceBand(min, max, input.type) ? min : null;
}

/** Minimum retail investment = upper band × lot size, or null when unknown. */
export function ipoMinInvestment(input: {
  priceMax?: number | null;
  priceRange?: string;
  lotSize?: number | null;
}): number | null {
  const upper = ipoUpperPrice(input);
  const lot = input.lotSize ?? 0;
  if (!upper || !lot || lot <= 0) return null;
  return Math.round(upper * lot);
}

/** Consistent "times subscribed" formatting (no trailing "x"). */
export function formatSubscriptionTimes(value?: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 100) return Math.round(value).toLocaleString('en-IN');
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/**
 * Honest subscription-bar width. Uses a log scale so 1×, 10× and 100×+
 * are visually distinct (a flat ×10 cap made 12× and 120× look identical).
 */
export function subscriptionBarWidth(value?: number | null): number {
  if (value == null || value <= 0) return 0;
  return Math.min(100, Math.max(4, (Math.log10(value + 1) / 2) * 100));
}

/** Canonical sector → URL slug (shared by the sector page and nav). */
export function ipoSectorSlug(sector?: string | null): string {
  return String(sector ?? '')
    .toLowerCase()
    .replace(/[&]+/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Available IPO performance years (desc), always including the current year. */
export function ipoPerformanceYears(
  ipos: Array<{ listingDate?: string }>,
): string[] {
  const years = new Set<string>();
  years.add(String(new Date().getFullYear()));
  for (const ipo of ipos) {
    if (!ipo.listingDate) continue;
    const y = new Date(ipo.listingDate).getFullYear();
    if (!Number.isNaN(y)) years.add(String(y));
  }
  return [...years].sort((a, b) => Number(b) - Number(a));
}

export interface IPOListItem {
  name: string;
  slug: string;
  type: string;
  status: string;
  sector?: string;
  priceRange?: string;
  lotSize?: number;
  issueSize?: string;
  openDate?: string;
  closeDate?: string;
  listingDate?: string;
  subscription?: number | null;
  /** IPOFins quantitative score (1–10). @deprecated aiScore still works during migration. */
  ipoScore?: number | null;
  /** @deprecated Use ipoScore */
  aiScore?: number | null;
}

export interface IPOStatusSectionConfig {
  status: IPOStatus;
  title: string;
  dotClass: string;
  borderClass: string;
  badgeClass: string;
  badgeLabel?: string;
  defaultOpen: boolean;
}

export const IPO_STATUS_SECTIONS: IPOStatusSectionConfig[] = [
  {
    status: 'live',
    title: 'Live — Apply Now',
    dotClass: 'bg-success-500 animate-pulse',
    borderClass: 'border-success-500',
    badgeClass: 'badge-live',
    defaultOpen: true,
  },
  {
    status: 'open',
    title: 'Open — Opens Soon',
    dotClass: 'bg-amber-500',
    borderClass: 'border-amber-400',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    defaultOpen: true,
  },
  {
    status: 'upcoming',
    title: 'Upcoming — Opening Soon',
    dotClass: 'bg-primary-500',
    borderClass: 'border-primary-400',
    badgeClass: 'badge-upcoming',
    defaultOpen: true,
  },
  {
    status: 'allotment',
    title: 'Allotment — Shares Allocated',
    dotClass: 'bg-teal-500',
    borderClass: 'border-teal-400',
    badgeClass: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    defaultOpen: false,
  },
  {
    status: 'closed',
    title: 'Closed — Awaiting Allotment',
    dotClass: 'bg-surface-400',
    borderClass: 'border-surface-300 dark:border-surface-600',
    badgeClass: 'badge-closed',
    defaultOpen: false,
  },
  {
    status: 'listed',
    title: 'Listed — Recently Listed',
    dotClass: 'bg-warning-500',
    borderClass: 'border-warning-300 dark:border-warning-700',
    badgeClass: 'badge-listed',
    defaultOpen: false,
  },
  {
    status: 'drhp-filed',
    title: 'DRHP Filed — Awaiting SEBI',
    dotClass: 'bg-surface-400',
    borderClass: 'border-surface-300 dark:border-surface-600',
    badgeClass: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
    defaultOpen: false,
  },
];

export const DEFAULT_TAB_STATUSES: IPOStatus[] = [
  'live',
  'open',
  'upcoming',
  'allotment',
  'closed',
  'listed',
];

function parseSortDate(val?: string): number {
  if (!val?.trim()) return Number.MAX_SAFE_INTEGER;
  const d = new Date(val.replace(/(\d+)(st|nd|rd|th)/gi, '$1'));
  const t = d.getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function sortSectionIPOs(ipos: IPOListItem[], status: IPOStatus): IPOListItem[] {
  const copy = [...ipos];
  if (status === 'live' || status === 'open') {
    return copy.sort((a, b) => parseSortDate(a.closeDate) - parseSortDate(b.closeDate));
  }
  if (status === 'upcoming' || status === 'drhp-filed') {
    return copy.sort((a, b) => parseSortDate(a.openDate) - parseSortDate(b.openDate));
  }
  return copy.sort((a, b) => parseSortDate(b.closeDate) - parseSortDate(a.closeDate));
}

export function buildIPOStatusSections(
  ipos: IPOListItem[],
  options?: {
    type?: 'mainboard' | 'sme';
    statuses?: IPOStatus[];
    sections?: IPOStatusSectionConfig[];
    /** Render section shell even when empty (e.g. live IPOs with 0 count). */
    keepEmptyStatuses?: IPOStatus[];
  },
): Array<IPOStatusSectionConfig & { ipos: IPOListItem[] }> {
  let filtered = ipos;
  if (options?.type) {
    filtered = filtered.filter((i) => i.type === options.type);
  }

  const allowed = options?.statuses ?? DEFAULT_TAB_STATUSES;
  filtered = filtered.filter((i) => allowed.includes(i.status as IPOStatus));

  const sectionDefs = options?.sections ?? IPO_STATUS_SECTIONS;

  return sectionDefs
    .filter((def) => allowed.includes(def.status))
    .map((def) => ({
      ...def,
      ipos: sortSectionIPOs(
        filtered.filter((i) => i.status === def.status),
        def.status,
      ),
    }))
    .filter(
      (s) =>
        s.ipos.length > 0 ||
        (options?.keepEmptyStatuses?.includes(s.status) ?? false),
    );
}

export function ipoRowMeta(ipo: IPOListItem): string {
  const sector = ipoDisplayText(ipo.sector);
  const parts: string[] = [];
  if (sector) parts.push(sector);

  switch (ipo.status) {
    case 'live': {
      const open = ipoDisplayText(ipo.openDate);
      const close = ipoDisplayText(ipo.closeDate);
      if (open && close) parts.push(`${open} – ${close}`);
      else if (open) parts.push(`Opens ${open}`);
      else if (close) parts.push(`Closes ${close}`);
      break;
    }
    case 'open': {
      const open = ipoDisplayText(ipo.openDate);
      if (open) parts.push(`Opens: ${open}`);
      else parts.push('Opening date TBA');
      break;
    }
    case 'upcoming':
    case 'drhp-filed': {
      const open = ipoDisplayText(ipo.openDate);
      if (open) parts.push(`Opens: ${open}`);
      else parts.push('Opening date TBA');
      break;
    }
    case 'allotment':
    case 'closed': {
      const listing = ipoDisplayText(ipo.listingDate);
      if (listing) parts.push(`Listing: ${listing}`);
      else parts.push('Listing date TBA');
      break;
    }
    case 'listed': {
      const listing = ipoDisplayText(ipo.listingDate);
      if (listing) parts.push(`Listed: ${listing}`);
      break;
    }
    default: {
      const open = ipoDisplayText(ipo.openDate);
      const close = ipoDisplayText(ipo.closeDate);
      if (open && close) parts.push(`${open} – ${close}`);
      else if (open) parts.push(`Opens ${open}`);
    }
  }

  return parts.join(' • ');
}

export function ipoStatusCounts(ipos: IPOListItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ipo of ipos) {
    counts[ipo.status] = (counts[ipo.status] ?? 0) + 1;
  }
  return counts;
}

export function formatIpoTabSubtitle(
  ipos: IPOListItem[],
  options?: { type?: 'mainboard' | 'sme'; totalLabel?: string },
): string {
  let filtered = ipos.filter((i) => DEFAULT_TAB_STATUSES.includes(i.status as IPOStatus));
  if (options?.type) filtered = filtered.filter((i) => i.type === options.type);
  const counts = ipoStatusCounts(filtered);
  const parts: string[] = [];
  if (options?.totalLabel) parts.push(`${filtered.length} ${options.totalLabel}`);
  if (counts.live) parts.push(`${counts.live} live`);
  if (counts.open) parts.push(`${counts.open} open`);
  if (counts.upcoming) parts.push(`${counts.upcoming} upcoming`);
  if (counts.closed) parts.push(`${counts.closed} closed`);
  if (counts.allotment) parts.push(`${counts.allotment} allotment`);
  if (counts.listed) parts.push(`${counts.listed} listed`);
  return parts.join(' • ');
}
