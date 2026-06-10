/**
 * IPO Status Utility
 * 
 * Computes the correct status for an IPO based on current date.
 * Used at build time to ensure static pages always show correct status,
 * even if the data fetch hasn't run recently.
 * 
 * Status transitions:
 *   - today < openDate → "upcoming"
 *   - openDate <= today <= closeDate → "live"
 *   - closeDate < today < listingDate → "closed"
 *   - today >= listingDate → "listed"
 */

interface IPORecord {
  name: string;
  slug: string;
  status: string;
  openDate?: string;
  closeDate?: string;
  listingDate?: string;
  [key: string]: any;
}

/**
 * Parse various IPO date string formats into a Date object.
 * Handles: "Jun 09, 2026", "10th Jun 2026", "04th – 08th Jun 2026", "DD-MM-YYYY"
 */
function parseIPODate(dateStr: string | undefined | null): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  // Try standard Date parse first (handles "Jun 09, 2026")
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Handle "10th Jun 2026", "04th – 08th Jun 2026" (take last date)
  const ordinalPattern = /(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})/g;
  const matches = [...dateStr.matchAll(ordinalPattern)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    d = new Date(`${last[1]} ${last[2]} ${last[3]}`);
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }

  // Handle "DD-MM-YYYY" or "DD/MM/YYYY"
  const dmyPattern = /(\d{2})[-\/](\d{2})[-\/](\d{4})/;
  const dmyMatch = dateStr.match(dmyPattern);
  if (dmyMatch) {
    d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }

  return null;
}

type IPOStatus = 'live' | 'closed' | 'listed' | 'upcoming' | 'drhp-filed';

/**
 * Compute the correct status for a single IPO based on today's date.
 */
export function computeIPOStatus(ipo: IPORecord): IPOStatus {
  // Don't change drhp-filed status (they become live via openDate)
  if (ipo.status === 'drhp-filed') return 'drhp-filed';

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const openDate = parseIPODate(ipo.openDate);
  const closeDate = parseIPODate(ipo.closeDate);
  const listingDate = parseIPODate(ipo.listingDate);

  if (listingDate && now >= listingDate) {
    return 'listed';
  }
  if (closeDate && now > closeDate) {
    return 'closed';
  }
  if (openDate && closeDate && now >= openDate && now <= closeDate) {
    return 'live';
  }
  if (openDate && now < openDate) {
    return 'upcoming';
  }

  // Fallback: keep existing status if dates can't be parsed
  return (ipo.status as IPOStatus) || 'upcoming';
}

/**
 * Apply correct statuses to all IPOs based on current date.
 * Returns a new array with updated statuses (does not mutate input).
 */
export function withCorrectStatuses<T extends IPORecord>(ipos: T[]): (T & { status: 'live' | 'closed' | 'listed' | 'upcoming' | 'drhp-filed' })[] {
  return ipos.map(ipo => ({
    ...ipo,
    status: computeIPOStatus(ipo),
  })) as (T & { status: IPOStatus })[];
}
