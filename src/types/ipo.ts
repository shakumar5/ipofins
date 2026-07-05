/**
 * Full IPO record type — matches the shape in src/data/ipos.json
 * and the merged output of all data sources.
 */

export type IPOStatus =
  | 'drhp-filed'
  | 'sebi-approved'
  | 'upcoming'
  | 'open'
  | 'live'
  | 'closed'
  | 'allotment'
  | 'listed'
  | 'failed'
  | 'withdrawn';

export type IPOType = 'mainboard' | 'sme';

/**
 * Canonical IPO verdict type. Always use this — do NOT use `IpoVerdict`
 * from lib/ipo-score.ts (which is the deprecated alias, kept for build compat).
 *
 * 'apply'   → Score ≥ 7, signals are constructive
 * 'avoid'   → Score ≤ 4, signals are weak
 * 'neutral' → Score 5–6, mixed signals
 * null      → No score signal available yet (pre-subscription)
 */
export type IPOVerdict = 'apply' | 'avoid' | 'neutral' | null;

export interface SubscriptionDetails {
  retail: number | null;
  /** HNI (High Net-worth Individual) — called "nii" (Non-Institutional Investor) in Groww */
  nii: number | null;
  qib: number | null;
  employee: number | null;
}

/** Year-wise financial entry (revenue, profit, total_assets) from Groww */
export interface FinancialYearEntry {
  year: string;
  label?: string;
  value: number | null;
}

/** KPI metrics fetched from Groww detail page */
export interface IPOKPIs {
  roe?: number;
  roce?: number;
  ebitdaMargin?: number;
  patMargin?: number;
  debtEquity?: number;
  eps?: number;
  nav?: number;
  ronw?: number;
}

/** Financial data: keys are metric names (e.g. "revenue", "profit", "total_assets") */
export type IPOFinancials = Record<string, FinancialYearEntry[]>;

export interface IPORecord {
  // ── Core (Zerodha) ──────────────────────────────────────────
  name: string;
  slug: string;
  type: IPOType;
  status: IPOStatus;
  priceRange: string;
  priceMax?: number;
  lotSize: number;
  issueSize: string;
  sector: string;

  // ── Dates (Zerodha) ─────────────────────────────────────────
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  refundDate?: string;
  creditDate?: string;
  listingDate?: string;

  // ── Company (Zerodha + Groww) ────────────────────────────────
  description?: string;
  purpose?: string;
  highlights: string[];
  risks: string[];
  founders?: string;
  headquarters?: string;
  founded?: string;
  registrar?: string;

  // ── Documents (Groww — authoritative) ───────────────────────
  drhpUrl?: string;
  drhpDate?: string;

  // ── Subscription (NSE / exchange data) ──────────────────────
  subscription?: number | null;
  subscriptionDetails?: SubscriptionDetails;
  subscriptionUpdatedAt?: string;

  /** Latest unofficial grey market premium (₹/share) when sourced — not exchange-verified */
  gmp?: number | null;

  // ── Listing (Zerodha + Groww fallback) ──────────────────────
  listingPrice?: number | null;

  // ── Post-listing performance (ipo_performance table) ─────────
  currentPrice?: number | null;
  price1w?: number | null;
  price1m?: number | null;
  price3m?: number | null;
  price6m?: number | null;
  price1y?: number | null;
  return1mPct?: number | null;
  return1yPct?: number | null;

  // ── Financials & KPIs (Groww detail page) ───────────────────
  financials?: IPOFinancials;
  kpis?: IPOKPIs;

  // ── IPOFins Score (computed in lib/ipo-score.ts at build time) ─
  ipoScore?: number | null;
  ipoSummary?: string | null;
  verdict?: IPOVerdict;

  /** @deprecated Use ipoScore instead — renamed for clarity (was never AI-generated) */
  aiScore?: number | null;
  /** @deprecated Use ipoSummary instead */
  aiSummary?: string | null;

  // ── Risk ────────────────────────────────────────────────────
  riskScore: number;

  // ── Meta ────────────────────────────────────────────────────
  lastUpdated?: string;
}
