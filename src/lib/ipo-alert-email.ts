/**
 * IPO alert transactional emails via Resend HTTP API.
 */
import { siteUrl, type IPOAlertEvent } from './ipo-alerts';

export interface IPOAlertEmailIpo {
  name: string;
  slug: string;
  priceMin?: number | null;
  priceMax?: number | null;
  openDate?: string | null;
  closeDate?: string | null;
  listingDate?: string | null;
}

const RESEND_API = 'https://api.resend.com/emails';

function priceBand(ipo: IPOAlertEmailIpo): string {
  const min = ipo.priceMin;
  const max = ipo.priceMax;
  if (min != null && max != null && min !== max) return `₹${min} – ₹${max}`;
  if (max != null) return `₹${max}`;
  if (min != null) return `₹${min}`;
  return 'TBA';
}

function footer(unsubscribeUrl: string): string {
  return `
    <p style="font-size:11px;color:#64748b;margin-top:24px;line-height:1.5;">
      Not investment advice. IPOFins does not recommend applying for any IPO.
      <br><a href="${unsubscribeUrl}" style="color:#64748b;">Unsubscribe from ${escapeHtml('this IPO\'s')} alerts</a>
      · <a href="${siteUrl()}/privacy" style="color:#64748b;">Privacy Policy</a>
    </p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function eventCopy(event: IPOAlertEvent, ipo: IPOAlertEmailIpo): { subject: string; headline: string; body: string } {
  const url = `${siteUrl()}/ipo/${ipo.slug}`;
  const band = priceBand(ipo);
  switch (event) {
    case 'open':
      return {
        subject: `${ipo.name} IPO is now open for subscription`,
        headline: `${ipo.name} — Now Open`,
        body: `<p>The IPO is open for bidding. Price band: <strong>${band}</strong>.</p>
          ${ipo.openDate ? `<p>Open: ${escapeHtml(ipo.openDate)}${ipo.closeDate ? ` · Close: ${escapeHtml(ipo.closeDate)}` : ''}</p>` : ''}
          <p><a href="${url}" style="color:#2563eb;font-weight:600;">View IPO details, subscription & GMP →</a></p>`,
      };
    case 'reminder':
      return {
        subject: `Last day to apply: ${ipo.name} IPO closes soon`,
        headline: `${ipo.name} — Closing Soon`,
        body: `<p>The bidding window is ending soon. Price band: <strong>${band}</strong>.</p>
          ${ipo.closeDate ? `<p>Close date: <strong>${escapeHtml(ipo.closeDate)}</strong></p>` : ''}
          <p><a href="${url}" style="color:#2563eb;font-weight:600;">Check subscription status →</a></p>`,
      };
    case 'close':
      return {
        subject: `${ipo.name} IPO subscription has closed`,
        headline: `${ipo.name} — Subscription Closed`,
        body: `<p>Bidding is closed. Allotment is typically announced within 6 working days.</p>
          <p><a href="${url}" style="color:#2563eb;font-weight:600;">View allotment timeline →</a></p>`,
      };
    case 'allotment':
      return {
        subject: `${ipo.name} IPO allotment expected today`,
        headline: `${ipo.name} — Allotment Day`,
        body: `<p>Allotment results may be published today. Check your registrar portal with your PAN.</p>
          <p><a href="${url}" style="color:#2563eb;font-weight:600;">IPO details & registrar link →</a></p>`,
      };
    case 'listing':
      return {
        subject: `${ipo.name} lists today on NSE/BSE`,
        headline: `${ipo.name} — Listing Day`,
        body: `<p>The IPO is expected to list on the exchanges today${ipo.listingDate ? ` (${escapeHtml(ipo.listingDate)})` : ''}.</p>
          <p><a href="${url}" style="color:#2563eb;font-weight:600;">View listing performance →</a></p>`,
      };
  }
}

export function buildAlertEmailHtml(
  event: IPOAlertEvent,
  ipo: IPOAlertEmailIpo,
  unsubscribeToken: string,
): { subject: string; html: string } {
  const { subject, headline, body } = eventCopy(event, ipo);
  const unsubscribeUrl = `${siteUrl()}/api/ipo-alert/unsubscribe?token=${unsubscribeToken}`;
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
      <p style="font-size:12px;color:#64748b;margin:0 0 16px;">IPOFins IPO Alert</p>
      <h2 style="font-size:20px;margin:0 0 12px;">${escapeHtml(headline)}</h2>
      ${body}
      ${footer(unsubscribeUrl)}
    </div>`;
  return { subject, html };
}

export async function sendIPOAlertEmail(
  to: string,
  event: IPOAlertEvent,
  ipo: IPOAlertEmailIpo,
  unsubscribeToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[ipo-alert-email] RESEND_API_KEY not set — skipping send');
    return { ok: false, error: 'Email service not configured' };
  }

  const from =
    import.meta.env.RESEND_FROM ||
    process.env.RESEND_FROM ||
    'IPOFins Alerts <alerts@ipofins.com>';

  const { subject, html } = buildAlertEmailHtml(event, ipo, unsubscribeToken);

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: text || `Resend HTTP ${res.status}` };
  }

  return { ok: true };
}
