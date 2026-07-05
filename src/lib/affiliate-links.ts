/**
 * Affiliate and partner links with UTM tracking.
 *
 * UTM convention:
 *   utm_source=ipofins
 *   utm_medium=affiliate
 *   utm_campaign={context}   e.g. ipo-apply, broker-compare, ipo-detail
 *   utm_content={placement}  e.g. sticky-cta, inline-cta, broker-card
 *
 * Always use the helpers below — do NOT hardcode UTM params across pages.
 * This centralises tracking and makes A/B testing easier.
 */

const UTM_SOURCE = 'ipofins';
const UTM_MEDIUM = 'affiliate';

function withUtm(base: string, campaign: string, content: string): string {
  const url = new URL(base);
  url.searchParams.set('utm_source', UTM_SOURCE);
  url.searchParams.set('utm_medium', UTM_MEDIUM);
  url.searchParams.set('utm_campaign', campaign);
  url.searchParams.set('utm_content', content);
  return url.toString();
}

// ── Zerodha ──────────────────────────────────────────────────
const ZERODHA_BASE = 'https://zerodha.com/open-account?c=ZP4558';

/** Zerodha CTA on IPO detail page sticky bar (live/open IPOs) */
export const ZERODHA_OPEN_ACCOUNT_URL = withUtm(ZERODHA_BASE, 'ipo-apply', 'sticky-cta');

/** Zerodha CTA within IPO detail page body (Apply / Trade section) */
export const ZERODHA_IPO_APPLY_URL = withUtm(ZERODHA_BASE, 'ipo-apply', 'inline-cta');

/** Zerodha CTA on broker comparison page */
export const ZERODHA_BROKER_COMPARE_URL = withUtm(ZERODHA_BASE, 'broker-compare', 'broker-card');

/** Zerodha CTA on broker detail page */
export const ZERODHA_BROKER_DETAIL_URL = withUtm(ZERODHA_BASE, 'broker-detail', 'broker-page');

/** Zerodha CTA on homepage / tools pages */
export const ZERODHA_GENERAL_URL = withUtm(ZERODHA_BASE, 'general', 'cta');

// ── Groww ─────────────────────────────────────────────────────
const GROWW_IPO_BASE = 'https://groww.in/ipo';
const GROWW_BASE = 'https://groww.in';

export const GROWW_IPO_APPLY_URL = withUtm(GROWW_IPO_BASE, 'ipo-apply', 'inline-cta');
export const GROWW_GENERAL_URL = withUtm(GROWW_BASE, 'general', 'cta');
export const GROWW_BROKER_COMPARE_URL = withUtm(GROWW_BASE, 'broker-compare', 'broker-card');

// ── Upstox ────────────────────────────────────────────────────
const UPSTOX_BASE = 'https://upstox.com/open-demat-account';

export const UPSTOX_OPEN_ACCOUNT_URL = withUtm(UPSTOX_BASE, 'broker-compare', 'broker-card');

// ── Angel One ─────────────────────────────────────────────────
const ANGEL_ONE_BASE = 'https://www.angelone.in/open-demat-account';

export const ANGEL_ONE_OPEN_ACCOUNT_URL = withUtm(ANGEL_ONE_BASE, 'broker-compare', 'broker-card');

// ── Dhan ──────────────────────────────────────────────────────
const DHAN_BASE = 'https://dhan.co/open-demat-account';

export const DHAN_OPEN_ACCOUNT_URL = withUtm(DHAN_BASE, 'broker-compare', 'broker-card');
