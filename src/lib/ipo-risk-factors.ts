import type { IPOFinancials, IPORecord } from '../types/ipo';

export type RiskTier = 'Low risk' | 'Medium risk' | 'High risk';

export function getRiskTierLabel(score: number): RiskTier {
  if (score <= 3) return 'Low risk';
  if (score <= 6) return 'Medium risk';
  return 'High risk';
}

/**
 * Distinct DRHP risk *content* categories (not raw count). Each category adds
 * risk once, so two IPOs that both list "5 risks" score differently based on
 * what those risks actually are. Total content contribution is capped so a long
 * boilerplate list cannot max out the score.
 */
const RISK_TEXT_SIGNALS: Array<{ re: RegExp; delta: number }> = [
  { re: /loss|losses|not profitable|negative.*profit|incurred a loss/, delta: 1.6 },
  { re: /top \d+ customers?|key customers?|limited number of customers?|customers?.*concentrat|concentrat.*customers?|\d+%.*customers?/, delta: 1.0 },
  { re: /government|discom|public sector|state-owned|\bpsu\b/, delta: 0.8 },
  { re: /debt|borrow|leverage|working capital|interest cost|trade receivable/, delta: 0.8 },
  { re: /limited.*track|new entrant|commenced operations|short operating history|relatively new/, delta: 0.7 },
  { re: /regulatory|\bsebi\b|compliance|litigation|legal proceeding/, delta: 0.6 },
  { re: /limited number of suppliers?|suppliers?.*concentrat|top \d+ suppliers?/, delta: 0.6 },
  { re: /geographic|concentrated in [a-z]+|single (state|region|market)/, delta: 0.5 },
  { re: /competition|competitive/, delta: 0.4 },
];

/**
 * Transparent, deterministic IPO risk score (1–10) built from the evidence we
 * actually have: DRHP risk content, subscription demand, issue structure, and
 * (when available) financials. Replaces the old `4 + risk_count` formula that
 * collapsed almost every IPO to 9.
 */
export function computeIpoRiskScore(ipo: IPORecord): number {
  let risk = 5;

  const risksText = (ipo.risks || []).join(' \n ').toLowerCase();
  let contentDelta = 0;
  for (const signal of RISK_TEXT_SIGNALS) {
    if (signal.re.test(risksText)) contentDelta += signal.delta;
  }
  risk += Math.min(3, contentDelta);

  const latestProfit = latestMetric(ipo.financials, 'profit');
  if (latestProfit != null && latestProfit < 0) risk += 1.2;
  else if (latestProfit != null && latestProfit > 0) risk -= 0.8;

  const latestRevenue = latestMetric(ipo.financials, 'revenue');
  const issueCr = parseIssueSizeCr(ipo.issueSize);
  if (latestRevenue != null && issueCr != null && latestRevenue > 0) {
    const multiple = issueCr / latestRevenue;
    if (multiple >= 8) risk += 1.0;
    else if (multiple <= 3) risk -= 0.5;
  }

  const qib = ipo.subscriptionDetails?.qib ?? null;
  const total = ipo.subscription ?? null;
  if (qib != null) {
    if (qib >= 10) risk -= 1.5;
    else if (qib >= 3) risk -= 0.8;
    else if (qib < 1) risk += 1.5;
    else risk += 0.3;
  } else if (total != null) {
    if (total >= 10) risk -= 1.0;
    else if (total >= 3) risk -= 0.4;
    else if (total < 2) risk += 1.0;
  }

  if (ipo.type === 'sme') risk += 1.0;
  if (ipo.purpose && /offer for sale|\bofs\b|existing investors|promoter.*sell/i.test(ipo.purpose)) {
    risk += 0.5;
  }
  if (ipo.kpis?.debtEquity != null && ipo.kpis.debtEquity > 1) risk += 0.7;
  if (ipo.kpis?.patMargin != null && ipo.kpis.patMargin < 5) risk += 0.5;
  else if (ipo.kpis?.patMargin != null && ipo.kpis.patMargin >= 15) risk -= 0.5;

  return Math.max(1, Math.min(10, Math.round(risk)));
}

type FactorCandidate = {
  id: string;
  weight: number;
  tone: 'negative' | 'positive' | 'neutral';
  text: string;
};

function latestMetric(financials: IPOFinancials | undefined, key: string): number | null {
  const entries = financials?.[key];
  if (!entries?.length) return null;
  const sorted = [...entries]
    .filter((e) => e.value != null)
    .sort((a, b) => String(a.year || a.label).localeCompare(String(b.year || b.label)));
  return sorted.at(-1)?.value ?? null;
}

function parseIssueSizeCr(issueSize: string): number | null {
  const normalized = issueSize.replace(/,/g, '');
  const match = normalized.match(/([\d.]+)\s*Cr/i);
  return match ? parseFloat(match[1]) : null;
}

function drhpRiskFactor(risk: string): FactorCandidate | null {
  const r = risk.toLowerCase();

  if (/top \d+ customer|key customer|repeat customer|derives.*customer|customer.*\d+\.\d+%|\d+%.*customer/.test(r)) {
    return {
      id: 'customer-concentration',
      weight: 9,
      tone: 'negative',
      text: 'High customer concentration flagged in the DRHP',
    };
  }
  if (/government|discom|public sector|state-owned/.test(r)) {
    return {
      id: 'government-dependence',
      weight: 8,
      tone: 'negative',
      text: 'Heavy dependence on government or PSU customers',
    };
  }
  if (/loss|losses|not profitable|negative.*profit|incurred a loss/.test(r)) {
    return {
      id: 'loss-making',
      weight: 10,
      tone: 'negative',
      text: 'Loss-making or weak profitability noted in DRHP',
    };
  }
  if (/debt|borrow|leverage|working capital|interest cost/.test(r)) {
    return {
      id: 'debt-pressure',
      weight: 8,
      tone: 'negative',
      text: 'Working capital or debt pressure highlighted in DRHP',
    };
  }
  if (/limited.*track|new entrant|commenced|short operating history|relatively new/.test(r)) {
    return {
      id: 'limited-history',
      weight: 7,
      tone: 'negative',
      text: 'Limited operating history in key business lines',
    };
  }
  if (/regulatory|sebi|compliance|litigation|legal proceeding/.test(r)) {
    return {
      id: 'regulatory',
      weight: 7,
      tone: 'negative',
      text: 'Regulatory or legal risks cited in DRHP',
    };
  }
  if (/competition|intense competition|competitive/.test(r)) {
    return {
      id: 'competition',
      weight: 6,
      tone: 'negative',
      text: 'Intense competition in the company’s core market',
    };
  }

  const trimmed = risk.replace(/\s+/g, ' ').trim();
  if (trimmed.length > 20) {
    return {
      id: `risk-${trimmed.slice(0, 24)}`,
      weight: 5,
      tone: 'negative',
      text: `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1, 90)}${trimmed.length > 90 ? '…' : ''}`,
    };
  }

  return null;
}

function collectCandidates(ipo: IPORecord): FactorCandidate[] {
  const out: FactorCandidate[] = [];

  const latestProfit = latestMetric(ipo.financials, 'profit');
  const latestRevenue = latestMetric(ipo.financials, 'revenue');
  const issueCr = parseIssueSizeCr(ipo.issueSize);

  if (latestProfit != null && latestProfit < 0) {
    out.push({
      id: 'financial-loss',
      weight: 10,
      tone: 'negative',
      text: 'Loss-making company in the latest reported year',
    });
  } else if (latestProfit != null && latestProfit > 0) {
    out.push({
      id: 'financial-profit',
      weight: 8,
      tone: 'positive',
      text: `Profitable in the latest year (₹${latestProfit.toLocaleString('en-IN')} Cr PAT)`,
    });
  }

  if (latestRevenue != null && issueCr != null && latestRevenue > 0) {
    const multiple = issueCr / latestRevenue;
    if (multiple >= 8) {
      out.push({
        id: 'rich-valuation',
        weight: 9,
        tone: 'negative',
        text: `Rich valuation vs revenue (${ipo.issueSize} issue vs ~₹${latestRevenue} Cr sales)`,
      });
    } else if (multiple <= 3) {
      out.push({
        id: 'reasonable-valuation',
        weight: 6,
        tone: 'positive',
        text: `Issue size looks reasonable vs ~₹${latestRevenue} Cr revenue`,
      });
    }
  }

  if (ipo.purpose && /offer for sale|\bofs\b|existing investors|promoter.*sell/i.test(ipo.purpose)) {
    out.push({
      id: 'ofs-heavy',
      weight: 7,
      tone: 'negative',
      text: 'Offer-for-sale heavy issue (limited fresh capital for growth)',
    });
  }

  const qib = ipo.subscriptionDetails?.qib;
  if (qib != null) {
    if (qib < 1) {
      out.push({
        id: 'qib-weak',
        weight: 9,
        tone: 'negative',
        text: `Low institutional interest (QIB ${qib.toFixed(1)}x subscription)`,
      });
    } else if (qib >= 5) {
      out.push({
        id: 'qib-strong',
        weight: 8,
        tone: 'positive',
        text: `Strong institutional demand (QIB ${qib.toFixed(1)}x subscription)`,
      });
    }
  } else if (ipo.subscription != null) {
    if (ipo.subscription < 2) {
      out.push({
        id: 'sub-weak',
        weight: 7,
        tone: 'negative',
        text: `Muted IPO demand (${ipo.subscription.toFixed(1)}x overall subscription)`,
      });
    } else if (ipo.subscription >= 10) {
      out.push({
        id: 'sub-strong',
        weight: 6,
        tone: 'positive',
        text: `Healthy overall subscription (${ipo.subscription.toFixed(1)}x)`,
      });
    }
  }

  if (ipo.type === 'sme') {
    out.push({
      id: 'sme-liquidity',
      weight: 6,
      tone: 'negative',
      text: 'SME listing with thinner post-listing liquidity',
    });
  }

  if (ipo.kpis?.debtEquity != null && ipo.kpis.debtEquity > 1) {
    out.push({
      id: 'debt-equity',
      weight: 7,
      tone: 'negative',
      text: `Elevated leverage (debt-to-equity ${ipo.kpis.debtEquity.toFixed(1)}x)`,
    });
  }

  if (ipo.kpis?.patMargin != null && ipo.kpis.patMargin < 5) {
    out.push({
      id: 'thin-margin',
      weight: 6,
      tone: 'negative',
      text: `Thin profit margins (${ipo.kpis.patMargin}% PAT margin)`,
    });
  } else if (ipo.kpis?.patMargin != null && ipo.kpis.patMargin >= 10) {
    out.push({
      id: 'healthy-margin',
      weight: 6,
      tone: 'positive',
      text: `Healthy profit margins (${ipo.kpis.patMargin}% PAT margin)`,
    });
  }

  if (ipo.risks?.length) {
    out.push({
      id: 'drhp-count',
      weight: Math.min(9, 4 + ipo.risks.length),
      tone: ipo.risks.length >= 4 ? 'negative' : 'neutral',
      text: `${ipo.risks.length} material risk factors disclosed in DRHP`,
    });

    for (const risk of ipo.risks.slice(0, 4)) {
      const parsed = drhpRiskFactor(risk);
      if (parsed) out.push(parsed);
    }
  }

  if (ipo.highlights?.length >= 3) {
    out.push({
      id: 'highlights',
      weight: 5,
      tone: 'positive',
      text: 'Multiple growth drivers highlighted in the prospectus',
    });
  }

  return out;
}

function defaultFallbacks(ipo: IPORecord, score: number): FactorCandidate[] {
  return [
    {
      id: 'fb-sector',
      weight: 1,
      tone: 'neutral',
      text: `${ipo.sector} ${ipo.type} IPO — compare pricing with sector peers`,
    },
    {
      id: 'fb-issue',
      weight: 1,
      tone: 'neutral',
      text: `${ipo.issueSize} issue at ₹${ipo.priceRange} price band`,
    },
    {
      id: 'fb-method',
      weight: 1,
      tone: 'neutral',
      text:
        score >= 7
          ? 'Score reflects DRHP risk count, financials, and subscription data'
          : 'Score blends DRHP disclosures with subscription and financial signals',
    },
  ];
}

function pickFactors(candidates: FactorCandidate[], ipo: IPORecord): string[] {
  const score = ipo.riskScore;
  const seen = new Set<string>();
  const picked: FactorCandidate[] = [];

  const preferTone =
    score >= 7 ? 'negative' : score <= 3 ? 'positive' : ('negative' as FactorCandidate['tone']);

  const sorted = [...candidates].sort((a, b) => b.weight - a.weight);

  for (const tone of [preferTone, preferTone === 'negative' ? 'neutral' : 'negative', 'positive', 'neutral']) {
    for (const c of sorted) {
      if (picked.length >= 3) break;
      if (c.tone !== tone || seen.has(c.id)) continue;
      seen.add(c.id);
      picked.push(c);
    }
    if (picked.length >= 3) break;
  }

  for (const c of sorted) {
    if (picked.length >= 3) break;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    picked.push(c);
  }

  for (const fb of defaultFallbacks(ipo, score)) {
    if (picked.length >= 3) break;
    if (seen.has(fb.id)) continue;
    seen.add(fb.id);
    picked.push(fb);
  }

  return picked.slice(0, 3).map((c) => c.text);
}

export function buildIpoRiskFactors(ipo: IPORecord): { tierLabel: RiskTier; factors: string[] } {
  const tierLabel = getRiskTierLabel(ipo.riskScore);
  const candidates = collectCandidates(ipo);
  const factors = pickFactors(candidates, ipo);

  return { tierLabel, factors };
}
