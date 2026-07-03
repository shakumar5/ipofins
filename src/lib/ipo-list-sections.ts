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

export function sanitizeIpoOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n;
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
    .filter((s) => s.ipos.length > 0);
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
