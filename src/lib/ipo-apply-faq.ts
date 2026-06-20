import type { IPORecord } from '../types/ipo';

function upperPrice(ipo: IPORecord): number {
  if (ipo.priceMax != null && ipo.priceMax > 0) return ipo.priceMax;
  const upper = ipo.priceRange.split('-').pop()?.trim();
  const parsed = upper ? parseInt(upper, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function subscriptionTone(total: number): string {
  if (total >= 100) return 'exceptionally strong';
  if (total >= 25) return 'strong';
  if (total >= 5) return 'moderate';
  return 'muted';
}

function riskLabel(score: number): string {
  if (score <= 3) return 'lower';
  if (score <= 6) return 'moderate';
  return 'elevated';
}

function formatSubscriptionSentence(ipo: IPORecord): string {
  const total = ipo.subscription as number;
  const tone = subscriptionTone(total);
  const qib = ipo.subscriptionDetails?.qib;
  const retail = ipo.subscriptionDetails?.retail;

  let sentence = `${ipo.name} is drawing ${tone} interest at ${total.toFixed(1)}x overall subscription`;

  if (qib != null && retail != null) {
    sentence += ` (QIB ${qib.toFixed(1)}x, retail ${retail.toFixed(1)}x)`;
  } else if (qib != null) {
    sentence += `, with QIB at ${qib.toFixed(1)}x`;
  }

  if (total >= 10 && ipo.status !== 'listed') {
    sentence += ' — high retail oversubscription usually means lower allotment odds per application';
  }

  return `${sentence}.`;
}

function formatListingSentence(ipo: IPORecord): string {
  const upper = upperPrice(ipo);
  const listing = ipo.listingPrice as number;
  const pct = upper > 0 ? (((listing - upper) / upper) * 100).toFixed(1) : null;
  const pctNum = pct != null ? parseFloat(pct) : 0;
  const move = pctNum >= 0 ? 'premium' : 'discount';

  let sentence = `${ipo.name} listed at ₹${listing}`;
  if (pct != null) {
    sentence += ` (${pctNum >= 0 ? '+' : ''}${pct}% ${move} to the ₹${upper} issue price)`;
  }

  if (ipo.subscription != null && ipo.subscription > 0) {
    sentence += ` after ${ipo.subscription.toFixed(1)}x subscription`;
  }

  return `${sentence}.`;
}

function formatPreOpenSentence(ipo: IPORecord): string {
  const openHint = ipo.openDate ? ` and opens ${ipo.openDate}` : '';
  return `${ipo.name} is a ${ipo.sector} ${ipo.type} IPO${openHint} with a ₹${ipo.priceRange} price band (${ipo.issueSize} issue) — subscription data is not live yet, so demand signals are unavailable.`;
}

function formatGmpSentence(ipo: IPORecord, gmp: number): string {
  const upper = upperPrice(ipo);
  const pct = upper > 0 ? Math.round((gmp / upper) * 100) : null;
  const pctPart = pct != null ? `, roughly ${pct}% above the ₹${upper} upper band` : '';

  return `Unofficial grey market premium is around ₹${gmp}${pctPart} for this ${ipo.sector} IPO — useful as a sentiment check before listing, but not verified by NSE/BSE/SEBI.`;
}

function formatContextSentence(ipo: IPORecord, gmp?: number | null): string {
  if (ipo.aiScore != null && ipo.aiSummary) {
    return `IPOFins Score ${ipo.aiScore}/10: ${ipo.aiSummary}`;
  }

  if (gmp != null && gmp > 0 && ipo.status !== 'listed') {
    return formatGmpSentence(ipo, gmp);
  }

  const risk = riskLabel(ipo.riskScore);
  const smeNote =
    ipo.type === 'sme'
      ? 'SME listings tend to be more volatile and less liquid after listing, so '
      : '';

  if (ipo.status === 'listed') {
    return `${smeNote}As a ${ipo.sector} name with ${risk} risk (${ipo.riskScore}/10 on IPOFins), treat listing-day gains as one data point — not a long-term verdict on the business.`;
  }

  if (ipo.subscription != null && ipo.subscription >= 10) {
    return `${smeNote}In ${ipo.sector}, ${risk} risk (${ipo.riskScore}/10) and the ${ipo.issueSize} issue size still matter more than headline subscription — read the DRHP before applying beyond one lot.`;
  }

  return `${smeNote}For a ${ipo.sector} ${ipo.type} IPO at ${risk} risk (${ipo.riskScore}/10), weigh DRHP financials and sector comps against the ₹${ipo.priceRange} band before you apply.`;
}

/**
 * Two-sentence FAQ answer for "Should I apply?" — uses IPO-specific subscription,
 * GMP (when available), listing outcome, and sector/risk context.
 */
export function buildShouldApplyFaqAnswer(ipo: IPORecord, gmp?: number | null): string {
  let lead: string;

  if (ipo.status === 'listed' && ipo.listingPrice) {
    lead = formatListingSentence(ipo);
  } else if (ipo.subscription != null && ipo.subscription > 0) {
    lead = formatSubscriptionSentence(ipo);
  } else if (['upcoming', 'drhp-filed', 'open', 'live'].includes(ipo.status)) {
    lead = formatPreOpenSentence(ipo);
  } else {
    lead = `${ipo.name} is a ${ipo.sector} ${ipo.type} IPO; IPOFins does not have fresh subscription figures for this stage yet.`;
  }

  return `${lead} ${formatContextSentence(ipo, gmp)}`;
}
