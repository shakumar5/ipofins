/**
 * IPO Status Utility
 * 
 * Computes the correct status for an IPO based on current date.
 * Used at build time to ensure static pages always show correct status,
 * even if the data fetch hasn't run recently.
 * 
 * Status lifecycle (from diagram):
 * ════════════════════════════════════════════════════════════════════
 *
 *   DRHP_FILED  →  UPCOMING  →  OPEN  →  LIVE  →  CLOSED  →  ALLOTMENT  →  LISTED
 *                                                      ↘ FAILED (manual, undersubscribed)
 *   WITHDRAWN (manual flag, any stage)
 *
 * Status transitions:
 *   - DRHP_FILED: no open_date yet (RHP not filed, price band not set)
 *   - UPCOMING:   today < open_date - 2 days (RHP filed, price band set)
 *   - OPEN:       open_date - 2 days <= today < open_date (finalised, investors can plan)
 *   - LIVE:       open_date <= today <= close_date (subscription window active)
 *   - CLOSED:     close_date < today < allotment_date
 *   - ALLOTMENT:  allotment_date <= today < listing_date
 *   - LISTED:     today >= listing_date
 *   - FAILED:     manual flag (undersubscribed IPO)
 *   - WITHDRAWN:  manual flag (can happen at any stage)
 *
 * Why OPEN and LIVE are different:
 *   OPEN: price band, lot size, dates are all finalised and published —
 *         but today is still before open_date. Investors can read and plan, not apply yet.
 *   LIVE: today is inside [open_date, close_date]. Subscription window is
 *         active — bidding, ASBA, UPI mandate approval all happen now.
 *   The CTA button is the visible difference: OPEN shows "Opens on [date]",
 *   LIVE shows "Apply now" — same page, different button and badge colour.
 */

interface IPORecord {
  name: string;
  slug: string;
  status: string;
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  listingDate?: string;
  [key: string]: any;
}

export type IPOStatus = 'drhp-filed' | 'upcoming' | 'open' | 'live' | 'closed' | 'allotment' | 'listed' | 'failed' | 'withdrawn';

/**
 * Parse various IPO date string formats into a Date object.
 * Handles: "Jun 09, 2026", "10th Jun 2026", "DD-MM-YYYY"
 * 
 * @param rejectRanges - If true, returns null for date ranges (e.g. "10th – 12th Jun 2026").
 *                       Used for listingDate which must be a single date.
 */
function parseIPODate(dateStr: string | undefined | null, rejectRanges = false): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  // Detect date ranges — not valid for single-date fields like listingDate
  if (rejectRanges) {
    const rangePattern = /\d{1,2}(?:st|nd|rd|th)?\s*[–\-]\s*\d{1,2}(?:st|nd|rd|th)?/;
    if (rangePattern.test(dateStr)) return null;
  }

  // Try standard Date parse first (handles "Jun 09, 2026")
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Handle "10th Jun 2026" (single ordinal date)
  const ordinalPattern = /(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})/g;
  const matches = [...dateStr.matchAll(ordinalPattern)];
  if (matches.length > 0) {
    // If multiple ordinal dates found and we're rejecting ranges, return null
    if (rejectRanges && matches.length > 1) return null;
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

/**
 * Compute the correct status for a single IPO based on today's date.
 * Manual statuses ('failed', 'withdrawn') are never overridden.
 */
export function computeIPOStatus(ipo: IPORecord): IPOStatus {
  // Manual flags — never auto-transition these
  if (ipo.status === 'failed') return 'failed';
  if (ipo.status === 'withdrawn') return 'withdrawn';
  // DRHP-filed stays until openDate is populated
  if (ipo.status === 'drhp-filed') {
    // If openDate is now set, promote to upcoming/open/live
    if (!ipo.openDate) return 'drhp-filed';
    // Fall through to date-based logic
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const openDate = parseIPODate(ipo.openDate);
  const closeDate = parseIPODate(ipo.closeDate);
  const allotmentDate = parseIPODate(ipo.allotmentDate, true);
  const listingDate = parseIPODate(ipo.listingDate, true); // rejectRanges: listing must be a single date

  // LISTED: today >= listing_date
  if (listingDate && now >= listingDate) {
    return 'listed';
  }

  // ALLOTMENT: allotment_date <= today < listing_date
  if (allotmentDate && now >= allotmentDate) {
    return 'allotment';
  }

  // CLOSED: close_date < today < allotment_date
  if (closeDate && now > closeDate) {
    return 'closed';
  }

  // LIVE: open_date <= today <= close_date
  if (openDate && closeDate && now >= openDate && now <= closeDate) {
    return 'live';
  }

  // OPEN: within 2 days of opening (open_date - 2 days <= today < open_date)
  if (openDate) {
    const twoDaysBefore = new Date(openDate);
    twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
    
    if (now >= twoDaysBefore && now < openDate) {
      return 'open';
    }
  }

  // UPCOMING: today < open_date - 2 days (but openDate is known)
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
export function withCorrectStatuses<T extends IPORecord>(ipos: T[]): (T & { status: IPOStatus })[] {
  return ipos.map(ipo => ({
    ...ipo,
    status: computeIPOStatus(ipo),
  })) as (T & { status: IPOStatus })[];
}
