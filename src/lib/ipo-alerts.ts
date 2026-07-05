/**
 * IPO email alert types and helpers.
 */

export type IPOAlertEvent = 'open' | 'reminder' | 'close' | 'allotment' | 'listing';

export const DEFAULT_ALERT_TYPES: IPOAlertEvent[] = ['open', 'reminder', 'close', 'allotment', 'listing'];

export interface IPOAlertRow {
  id: string;
  email: string;
  ipo_id: number;
  alert_types: string[];
  unsubscribe_token: string;
  is_active: boolean;
}

export interface IPOAlertIpoRow {
  id: number;
  slug: string;
  name: string;
  status: string;
  price_min: number | null;
  price_max: number | null;
  open_date: string | null;
  close_date: string | null;
  listing_date: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidAlertEmail(email: string): boolean {
  const n = normalizeEmail(email);
  return n.length <= 254 && EMAIL_RE.test(n);
}

export function parseAlertTypes(raw: unknown): IPOAlertEvent[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ALERT_TYPES];
  const allowed = new Set<IPOAlertEvent>(DEFAULT_ALERT_TYPES);
  const parsed = raw.filter((t): t is IPOAlertEvent => typeof t === 'string' && allowed.has(t as IPOAlertEvent));
  return parsed.length ? parsed : [...DEFAULT_ALERT_TYPES];
}

/** Map current IPO status (+ dates) to alert events that should fire now. */
export function eventsForIpo(ipo: IPOAlertIpoRow, now = new Date()): IPOAlertEvent[] {
  const events: IPOAlertEvent[] = [];
  const status = ipo.status;

  if (['open', 'live'].includes(status)) {
    events.push('open');
    const close = ipo.close_date ? new Date(ipo.close_date) : null;
    if (close && !Number.isNaN(close.getTime())) {
      const msUntilClose = close.getTime() - now.getTime();
      const daysUntilClose = msUntilClose / (1000 * 60 * 60 * 24);
      if (daysUntilClose >= 0 && daysUntilClose <= 1.5) events.push('reminder', 'close');
    }
  }

  if (status === 'closed') events.push('close');
  if (status === 'allotment') events.push('allotment');

  if (status === 'listed') {
    const listing = ipo.listing_date ? new Date(ipo.listing_date) : null;
    if (listing && !Number.isNaN(listing.getTime())) {
      const daysSinceListing = (now.getTime() - listing.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceListing >= 0 && daysSinceListing <= 3) events.push('listing');
    }
  }

  return [...new Set(events)];
}

export function siteUrl(): string {
  return (import.meta.env.SITE || process.env.SITE || 'https://ipofins.com').replace(/\/$/, '');
}
