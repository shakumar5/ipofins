import type { PageMeta } from './page-meta';
import { monthDisplay, monthSlug } from '../utils/month-slug';

export type TrackerViewType = 'most_bought' | 'most_sold' | 'fresh_entries' | 'complete_exits';

export const TRACKER_BASE_PATH = '/mutual-funds/smart-money';

export const TRACKER_VIEW_OPTIONS: { id: TrackerViewType; label: string; slug: string }[] = [
  { id: 'most_bought', label: 'Most Bought Stocks', slug: 'most-bought-stocks' },
  { id: 'most_sold', label: 'Most Sold Stocks', slug: 'most-sold-stocks' },
  { id: 'fresh_entries', label: 'Fresh Entries', slug: 'fresh-entries' },
  { id: 'complete_exits', label: 'Complete Exits', slug: 'complete-exits' },
];

const SLUG_TO_VIEW = new Map(TRACKER_VIEW_OPTIONS.map((v) => [v.slug, v.id]));
const VIEW_TO_SLUG = new Map(TRACKER_VIEW_OPTIONS.map((v) => [v.id, v.slug]));
const VIEW_TO_LABEL = new Map(TRACKER_VIEW_OPTIONS.map((v) => [v.id, v.label]));

const MONTH_SLUG_RE = /^[a-z]+-\d{4}$/;

export function trackerLabel(view: TrackerViewType): string {
  return VIEW_TO_LABEL.get(view) || 'Smart Money Tracker';
}

export function trackerSegmentFromViewMonth(view: TrackerViewType, monthLabel: string): string {
  const viewSlug = VIEW_TO_SLUG.get(view);
  if (!viewSlug) return '';
  return `${viewSlug}-in-${monthSlug(monthLabel)}`;
}

export function trackerPathFromViewMonth(view: TrackerViewType, monthLabel: string): string {
  const segment = trackerSegmentFromViewMonth(view, monthLabel);
  return segment ? `${TRACKER_BASE_PATH}/${segment}` : TRACKER_BASE_PATH;
}

export function parseTrackerFromPathname(pathname: string): {
  view: TrackerViewType;
  monthLabel: string;
  segment: string;
} | null {
  if (!pathname.startsWith(TRACKER_BASE_PATH)) return null;
  const rest = pathname.slice(TRACKER_BASE_PATH.length).replace(/^\//, '').split('?')[0];
  const segmentOnly = rest.split('/')[0];
  if (!segmentOnly || segmentOnly.startsWith('signal/')) return null;

  const inIdx = segmentOnly.indexOf('-in-');
  if (inIdx < 1) return null;

  const viewPart = segmentOnly.slice(0, inIdx);
  const monthPart = segmentOnly.slice(inIdx + 4);
  if (!MONTH_SLUG_RE.test(monthPart)) return null;

  const view = SLUG_TO_VIEW.get(viewPart);
  if (!view) return null;

  return {
    view,
    monthLabel: monthDisplay(monthPart),
    segment: segmentOnly,
  };
}

export function getSmartMoneyTrackerPageMeta(view: TrackerViewType, monthLabel: string): PageMeta {
  const label = trackerLabel(view);
  const path = trackerPathFromViewMonth(view, monthLabel);
  const heading = `${label} in ${monthLabel}`;

  const descriptions: Record<TrackerViewType, string> = {
    most_bought:
      `Stocks mutual funds increased the most in ${monthLabel} by portfolio weight. Ranked by number of funds buying, with average and total weight added from AMC disclosures.`,
    most_sold:
      `Stocks mutual funds reduced the most in ${monthLabel} by portfolio weight. Ranked by number of funds selling, with average and total weight reduced from AMC disclosures.`,
    fresh_entries:
      `Stocks newly added to mutual fund portfolios in ${monthLabel}. Fresh entries ranked by number of funds and average portfolio weight from AMC disclosures.`,
    complete_exits:
      `Stocks fully sold out of mutual fund portfolios in ${monthLabel}. Complete exits ranked by number of funds and average prior weight from AMC disclosures.`,
  };

  return {
    title: `${heading} — Smart Money Tracker | IPOFins`,
    description: descriptions[view],
    path,
    heading,
    subtitle: `Institutional stock activity for ${monthLabel} — from official AMC monthly portfolio disclosures.`,
    breadcrumbLabel: label,
  };
}
