# 07 — Product Roadmap: IPOFins

> Prepared by: Product Manager (Stripe) + FinTech Product Expert + Retail Investor + Institutional Investor  
> Timeframe: 12-month execution plan  
> Goal: Transform IPOFins into India's best free finance research platform

---

## PRODUCT VISION

**From:** A data aggregation platform for MF/IPO research  
**To:** The definitive financial intelligence layer for Indian retail investors — institutional quality, zero barrier, trusted data

**North Star Metric:** Monthly Active Researchers (users who perform at least 3 meaningful data interactions per month)

---

## CURRENT PRODUCT STATE SCORECARD

| Feature | State | Quality |
|---|---|---|
| IPO tracking & analytics | ✅ Live | Good |
| Smart Money Tracker | ✅ Live | Excellent — unique |
| Super Investor portfolios | ✅ Live | Good |
| 1% Club discovery | ✅ Live | Good |
| Portfolio overlap checker | ✅ Live | Good |
| 16 Financial calculators | ✅ Live | Good UX, thin content |
| Broker comparison | ✅ Live | Exists, thin |
| Dashboard | ⚠️ Stub | Sample data only |
| Real-time prices | ❌ Missing | — |
| IPO GMP | ❌ Removed | Was the #1 traffic driver |
| User accounts | ❌ None | Intentional but limiting |
| IPO alerts | ❌ None | High retention value |
| Stock fundamentals | ❌ None | Major gap vs Screener |
| Mobile app | ❌ None | 70%+ users are mobile |

---

## SPRINT 1 (Weeks 1-2): Fix Critical Issues

### S1.1 — Rename AI Branding (1 day)
- `AIInsightBox.astro` → `IPOScoreBox.astro`
- `aiScore` field → `ipoScore` in all types and data files
- Meta description "AI-powered" → "Data-driven"
- All public copy referencing "AI" → "IPOFins Score" or "algorithmic"

**Why now:** Regulatory risk + trust issue. Costs 1 day and removes legal exposure.

### S1.2 — Fix Google Consent Mode (1 day)
```javascript
// Add before any gtag('config') call:
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'analytics_storage': 'denied',
  'wait_for_update': 500
});

// On accept:
gtag('consent', 'update', {
  'ad_storage': 'granted',
  'analytics_storage': 'granted'
});
```

### S1.3 — Fix `pages.cursorrules` Route (1 hour)
Move to `.cursor/rules/pages.mdc`. Add redirect from `/pages.cursorrules` to `/404` if needed.

### S1.4 — Input Validation on All Calculators (2 days)
Add min/max constraints and NaN protection to all 16 calculator TSX files.

### S1.5 — Error Boundaries on All React Islands (1 day)
```tsx
// Create: src/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <div class="p-4 text-sm text-surface-500">Data temporarily unavailable. <button onClick={() => window.location.reload()}>Retry</button></div>;
    }
    return this.props.children;
  }
}
```

### S1.6 — Remove Dashboard from Nav (1 hour)
Until Dashboard is functional, replace "Dashboard" nav link with "Watchlist" (coming soon) or remove entirely.

---

## SPRINT 2 (Weeks 3-4): IPO GMP — The Biggest Traffic Opportunity

### S2.1 — Community IPO GMP Page (1 week)

**Why:** 200,000+ monthly searches for "IPO GMP today." The current redirect to subscription status loses all this traffic to Chittorgarh and IPO Watch.

**Implementation Plan:**

1. **Database:** Add `ipo_gmp_community` table (see DB roadmap)
2. **Page:** Create `/ipo/gmp-today` — list all live/recent IPOs with:
   - Latest reported GMP (from community submissions or curated scrape)
   - Last 7-day GMP trend chart
   - Disclaimer: "GMP is from grey market sources. It is unofficial and not regulated by SEBI. Use only as a sentiment indicator."
   - Subscription status alongside GMP (IPOFins' official data)
3. **Schema:** Add `FAQPage` schema with "What is IPO GMP?" content
4. **Data:** Initially seed with manually curated data, then automate with community submissions

**Expected traffic impact:** +30,000-50,000 monthly visits within 90 days.

---

## SPRINT 3 (Weeks 5-6): IPO Alerts — The #1 Retention Feature

### S3.1 — No-Login IPO Alert System

**Feature:** User enters email on any IPO page → gets notified when:
- IPO subscription opens
- Last day reminder (D-1)
- IPO subscription closes
- Allotment announced
- Listing date

**Implementation:**

```typescript
// API: /api/ipo-alert
// POST { email: string, ipoSlug: string, alertTypes: string[] }

// DB table:
CREATE TABLE ipo_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ipo_id INT REFERENCES ipos(id),
  alert_types TEXT[] DEFAULT '{"open","reminder","close","allotment","listing"}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribe_token UUID DEFAULT gen_random_uuid()
);
```

**Email provider:** Resend (free up to 3,000 emails/month). Template-based, no personalization required.

**Cost:** Essentially free at current scale. Resend's free plan covers initial volume.

**Why no login:** Requiring login before setting an alert drops conversion by 70-80%. UUID-keyed unsubscribe link is sufficient.

**CTA placement:** Sticky "Get Alert" button on all IPO detail pages for live/upcoming IPOs.

---

## SPRINT 4 (Weeks 7-8): Content Expansion for SEO

### S4.1 — Calculator Content (1,500 words each)

Target the top 5 calculator pages first:
1. SIP Calculator — add formula, worked examples, SIP vs Lumpsum section, 8 FAQs
2. EMI Calculator — add home loan and car loan worked examples, prepayment analysis
3. CAGR Calculator — add Nifty historical CAGR table, worked examples
4. FD Calculator — add TDS implications, FD vs MF comparison
5. Tax Calculator — update to FY 2026-27 slabs, add surcharge calculator

**Expected:** Each page moves from position 30-50 to position 5-15 for its primary keyword within 60-90 days of content addition + indexing.

### S4.2 — Broker Comparison Programmatic Pages

Build 6 comparison pages:
- `/broker/zerodha-vs-groww`
- `/broker/zerodha-vs-upstox`  
- `/broker/groww-vs-upstox`
- `/broker/zerodha-vs-angel-one`
- `/broker/best-for-beginners`
- `/broker/best-for-options`

Each page: 800 words, side-by-side comparison table, FAQ schema.

---

## SPRINT 5 (Weeks 9-10): Dashboard MVP

### S5.1 — Functional No-Login Dashboard

**Feature set (localStorage-based, no backend needed):**
1. **Watchlist** — up to 10 IPOs. User clicks "Add to Watchlist" on any IPO page → IPO appears on dashboard with status and subscription.
2. **Recent** — Last 10 pages visited (using `sessionStorage` for privacy)
3. **Saved Calculations** — "Save this SIP result" button stores result in `localStorage`
4. **My Funds** — User can pin up to 5 fund slugs to see their latest NAV and returns

**Technical approach:** Pure React + `localStorage`. No server calls. Data is displayed from the existing static JSON files loaded at page level.

**Privacy:** Explicit "All data is stored only in your browser. We never see it." message.

**Why this matters:** Gives users a reason to return. Converts one-time visitors into repeat users.

---

## SPRINT 6 (Weeks 11-12): MF X-Ray — The Flagship Feature

### S6.1 — Mutual Fund Portfolio X-Ray

**Feature:** User adds their MF holdings (fund name + amount) without login. System shows:

1. **Underlying stock exposure** — Top 20 stocks they actually own across all funds
2. **Sector allocation** — Effective sector exposure vs Nifty 50 benchmark
3. **Overlap analysis** — Common stocks across their funds + duplication index
4. **Super investor alignment** — Do their stocks align with top super investors?
5. **Risk distribution** — Large/mid/small cap breakdown

**Why this is the killer feature:**
- Morningstar X-Ray exists but is paid and US-focused
- ValueResearch has overlap but only between 2 funds
- Nothing like this exists for free in India

**Implementation:**
- Uses existing `fund_holdings` data in `public/data/`
- Pure client-side computation (no server call needed)
- Build as a new React component + page at `/tools/mf-xray`
- Add to tools hub, homepage feature cards

---

## QUARTER 2 (Months 4-6): Platform Scale

### Q2.1 — IPO Fundamentals Integration
Extract financial data from DRHP PDFs using LLM (see AI Review). Feed into IPO Score v2.

### Q2.2 — Stock Pages (Basic)
Light stock profile pages at `/stocks/{slug}` with:
- Which super investors hold this stock
- Which mutual funds hold this + change direction
- 1% Club holders
- IPO history (if applicable)

**Why:** Users following smart money signals want stock-level aggregation. Currently they have to jump between super investor pages. A stock page aggregates all investor activity in one place.

### Q2.3 — Sector Intelligence Heatmap
Visual 12-month sector rotation heatmap (sectors × months × net MF flow). Single most powerful visualization for sector rotation research. Bloomberg-terminal-quality insight, free.

### Q2.4 — API v1 (Beta)
Open `/api/v1/` endpoints:
- `GET /api/v1/ipos` — All IPOs with status
- `GET /api/v1/signals?month={month}` — Smart money signals
- `GET /api/v1/holdings/{fund-slug}?month={month}` — Fund holdings

API key required (free tier: 1,000 calls/month). Monetization via paid tiers.

### Q2.5 — IPO Backtester
"If you had applied to every IPO with a score ≥7 since 2022, your average listing gain would have been X%." Uses historical IPO performance data. Showcases the scoring model's predictive value.

---

## QUARTER 3-4 (Months 7-12): Monetization & Scale

### Revenue Build Plan

**Month 7-8: Affiliate Funnel Optimization**
- Add conversion tracking per broker link
- Dynamic CTA: "Based on your IPO activity, [Broker] is recommended for you"
- A/B test CTA positioning on broker pages
- Add "Open Free Demat Account" CTAs to IPO detail pages above-the-fold

**Target:** ₹1,00,000/month affiliate revenue by Month 8.

**Month 9-10: Premium Alerts & Newsletter**
- Weekly "IPO Digest" email (free tier)
- "Smart Money Monthly" PDF report (₹199/month)
- "Super Investor Portfolio Tracker" alerts for specific investors (₹99/month)

**Month 11-12: API Monetization**
- Free: 1,000 API calls/month
- Starter: ₹999/month — 50,000 calls
- Professional: ₹4,999/month — 500,000 calls + webhook support

---

## FEATURE DEVELOPMENT PRIORITY MATRIX

```
HIGH IMPACT, LOW EFFORT (Do First):
├── Fix AI naming (1 day)
├── Fix consent mode (1 day)
├── Calculator input validation (2 days)
├── Error boundaries on React islands (1 day)
├── Remove Dashboard from nav (1 hour)
├── IPO GMP page (1 week)
├── IPO email alerts (1 week)
└── Calculator content expansion (2 weeks)

HIGH IMPACT, MEDIUM EFFORT (Do Next):
├── Broker comparison pages (1 week)
├── Dashboard MVP (2 weeks)
├── MF X-Ray tool (3 weeks)
├── Stock pages (light) (3 weeks)
└── Sector rotation heatmap (2 weeks)

HIGH IMPACT, HIGH EFFORT (Plan Carefully):
├── API v1 (4 weeks)
├── IPO fundamentals + DRHP extraction (4 weeks)
├── IPO backtester (3 weeks)
├── Mobile app / PWA (8 weeks)
└── Optional user accounts (8 weeks)

LOW IMPACT, ANY EFFORT (Defer):
├── Video content integration
├── Social features (comments)
├── Portfolio simulation
└── Crypto tracking
```

---

## SUCCESS METRICS

### Month 3 Targets
- Monthly organic traffic: 50,000+ visits
- IPO GMP page ranking: Top 10 for "IPO GMP today"
- Calculator pages: 5,000+ monthly calculator uses
- Email alert signups: 1,000+
- Revenue: ₹50,000/month (AdSense + affiliates)

### Month 6 Targets
- Monthly organic traffic: 150,000+ visits
- Smart Money Tracker: 20,000+ monthly users
- MF X-Ray: 5,000+ portfolios analyzed
- API beta users: 50+
- Revenue: ₹3,00,000/month

### Month 12 Targets
- Monthly organic traffic: 500,000+ visits
- Monthly Active Researchers: 100,000+
- Revenue: ₹10,00,000/month (₹1 Crore/month)
- Domain Rating: DR 35+
- Ranking keywords (top 10): 500+
