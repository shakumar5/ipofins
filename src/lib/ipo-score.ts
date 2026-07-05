/**
 * IPOFins Score — a transparent, deterministic quantitative signal (1–10).
 *
 * It is NOT an LLM/AI opinion. It blends the data we actually have:
 *   • disclosed risk score (from the DRHP risk engine)
 *   • subscription demand (QIB-weighted, with retail depth)
 *   • listing outcome vs the issue price (for listed IPOs)
 *   • an SME liquidity adjustment
 *
 * A score is only produced once there is a real demand signal
 * (subscription figures or a listing price). Pre-open IPOs return null so
 * we never show a number we cannot defend.
 *
 * See /methodology for the public write-up.
 */

import type { IPORecord, IPOVerdict } from '../types/ipo';
import { ipoUpperPrice } from './ipo-list-sections';

/**
 * @deprecated Use IPOVerdict from types/ipo.ts directly.
 * Kept as an alias for backward compatibility — both resolve to the same type.
 */
export type IpoVerdict = IPOVerdict;

export interface IpoScoreResult {
  score: number | null;
  summary: string | null;
  verdict: IPOVerdict;
}

/** True when we have enough signal to justify a score. */
export function hasScoreSignal(ipo: IPORecord): boolean {
  return ipo.subscription != null || ipo.listingPrice != null;
}

interface ScoreContext {
  qib: number | null;
  total: number | null;
  risk: number;
  listingGainPct: number | null;
  verdict: IPOVerdict;
}

function buildSummary(ipo: IPORecord, ctx: ScoreContext): string {
  const drivers: string[] = [];
  if (ctx.qib != null) drivers.push(`QIB demand at ${ctx.qib.toFixed(1)}x`);
  else if (ctx.total != null)
    drivers.push(`overall subscription of ${ctx.total.toFixed(1)}x`);

  const riskWord = ctx.risk <= 3 ? 'low' : ctx.risk <= 6 ? 'moderate' : 'elevated';
  drivers.push(`${riskWord} disclosed risk (${ctx.risk}/10)`);

  let lead: string;
  if (drivers.length) {
    lead = `Driven by ${drivers.join(' and ')}`;
    if (ctx.listingGainPct != null) {
      const dir = ctx.listingGainPct >= 0 ? 'a premium' : 'a discount';
      lead += `, ${ipo.name} listed at ${dir} of ${Math.abs(ctx.listingGainPct).toFixed(1)}% to its issue price`;
    }
    lead += '.';
  } else {
    lead = `${ipo.name} is a ${ipo.sector || ipo.type} IPO.`;
  }

  const smeNote =
    ipo.type === 'sme'
      ? ' SME listings are also thinner and more volatile after listing.'
      : '';

  const guidance =
    ctx.verdict === 'apply'
      ? 'The signals lean constructive — still confirm valuation against listed peers and read the DRHP before applying beyond one lot.'
      : ctx.verdict === 'avoid'
        ? 'The signals look weak — weigh the risks carefully. This is a quantitative flag, not a recommendation.'
        : 'The picture is mixed — treat this as one input alongside the DRHP, valuation, and your own risk appetite.';

  return `${lead}${smeNote} ${guidance}`;
}

/**
 * Compute the IPOFins Score for a single IPO.
 * Returns { score: null } when there isn't enough signal yet.
 */
export function computeIpoScore(ipo: IPORecord): IpoScoreResult {
  if (!hasScoreSignal(ipo)) return { score: null, summary: null, verdict: null };

  let s = 5;

  const risk = Number.isFinite(ipo.riskScore) ? ipo.riskScore : 5;
  // Lower disclosed risk lifts the score; higher risk drags it down.
  s += (5 - risk) * 0.4;

  const qib = ipo.subscriptionDetails?.qib ?? null;
  const total = ipo.subscription ?? null;
  const retail = ipo.subscriptionDetails?.retail ?? null;

  // Institutional demand is the strongest signal; fall back to overall.
  if (qib != null) {
    if (qib >= 10) s += 2;
    else if (qib >= 3) s += 1;
    else if (qib < 1) s -= 1.5;
  } else if (total != null) {
    if (total >= 10) s += 1.5;
    else if (total >= 3) s += 0.75;
    else if (total < 1) s -= 1.5;
  }
  if (retail != null && retail >= 5) s += 0.5;

  const upper = ipoUpperPrice(ipo);
  let listingGainPct: number | null = null;
  if (ipo.listingPrice != null && upper != null && upper > 0) {
    listingGainPct = ((ipo.listingPrice - upper) / upper) * 100;
    if (listingGainPct >= 20) s += 1.5;
    else if (listingGainPct > 0) s += 0.5;
    else if (listingGainPct <= -10) s -= 1.5;
    else s -= 0.5;
  }

  if (ipo.type === 'sme') s -= 0.5;

  const score = Math.max(1, Math.min(10, Math.round(s)));
  const verdict: IpoVerdict = score >= 7 ? 'apply' : score <= 4 ? 'avoid' : 'neutral';
  const summary = buildSummary(ipo, { qib, total, risk, listingGainPct, verdict });

  return { score, summary, verdict };
}

/** Return a copy of the IPO with score/summary/verdict populated. */
export function withIpoScore<T extends IPORecord>(ipo: T): T {
  const { score, summary, verdict } = computeIpoScore(ipo);
  return {
    ...ipo,
    // Canonical fields — always write to these
    ipoScore: score,
    ipoSummary: summary,
    verdict,
    // Deprecated aliases — keep populated so older code paths don't break during migration
    aiScore: score,
    aiSummary: summary,
  };
}
