# 09 — Implementation Plan: IPOFins

> Execution guide for transforming IPOFins into the world's best Indian finance platform  
> Organized by: Week · Effort estimate · Owner role · Dependencies · Success criteria

---

## IMPLEMENTATION PHILOSOPHY

**Rule 1:** Ship legal/compliance fixes immediately — they have zero upside risk and high downside.  
**Rule 2:** SEO improvements compound over time — start them in Week 1, not Week 6.  
**Rule 3:** Build for the user you have before building for the user you want.  
**Rule 4:** Every new feature needs a success metric before it's built.  
**Rule 5:** Never break what's working — critical data pipeline integrity first.

---

## PHASE 0: CRITICAL FIXES (Days 1-3) — ✅ COMPLETED July 5, 2026

All Phase 0 tasks have been executed. Summary of what was fixed:

| Task | Status | Files Changed |
|---|---|---|
| 0.1 Google Consent Mode v2 | ✅ Done | `BaseLayout.astro` |
| 0.2 Rename AI branding (`aiScore` → `ipoScore`) | ✅ Done | `types/ipo.ts`, `lib/ipo-score.ts`, `lib/ipo-apply-faq.ts`, `lib/ipo-list-sections.ts`, `IPOCard.astro`, `IPOListRow.astro`, `pages/ipo/[slug].astro` |
| 0.3 Remove `pages.cursorrules` route | ✅ Done | Moved to `.cursor/rules/pages.mdc` |
| 0.4 Gitignore backup/log files | ✅ Done | `.gitignore`, deleted 7 log files from repo root |
| 0.5 Robots.txt updates | ✅ Done | `public/robots.txt` |
| 0.6 Error Boundaries on React islands | ✅ Done | `src/components/ErrorBoundary.tsx` created |
| 0.7 Remove Dashboard from nav | ✅ N/A — was never in nav |
| 0.8 Calculator validation utility | ✅ Done | `src/utils/calculator-validation.ts` created |
| 0.9 New `IPOScoreBox` component | ✅ Done | `src/components/IPOScoreBox.astro` created |
| 0.10 `og:image:secure_url` | ✅ Done | `BaseLayout.astro` |
| 0.11 Cookie banner ESC key + no global onclick | ✅ Done | `BaseLayout.astro` |
| 0.12 `aria-valuemax` on all progress bars | ✅ Done | `IpoSubscriptionBars.astro`, `IPOCard.astro` |
| 0.13 `btn-primary` → `primary-600` blue | ✅ Done | `global.css` |
| 0.14 `nav-btn-group` CLS min-height removed | ✅ Done | `global.css` |
| 0.15 AdSense containers min-height (CLS fix) | ✅ Done | `AdUnit.astro` |
| 0.16 Duplicate `verify-top-stocks-export` build step removed | ✅ Done | `package.json` |
| 0.17 Sitemap `lastmod` + priority + filter | ✅ Done | `astro.config.mjs` |
| 0.18 Astro build concurrency 2→8 | ✅ Done | `astro.config.mjs` |
| 0.19 IpoVerdict / IPOVerdict type merge | ✅ Done | `types/ipo.ts`, `lib/ipo-score.ts` |
| 0.20 DB constraints + indexes migration | ✅ Done | `db/migrations/011_constraints_and_indexes.sql` |
| 0.21 `mv_refresh_log`, `ipo_alerts`, `ipo_fundamentals` tables | ✅ Done | `011_constraints_and_indexes.sql` |
| 0.22 `client:visible` for non-above-fold search components | ✅ Done | `1-percent-club/index.astro`, `super-investors/index.astro` |
| 0.23 Tools hub category grouping | ✅ Done | `tools/index.astro` |
| 0.24 Sticky IPO apply CTA (live/open IPOs) | ✅ Done | `ipo/[slug].astro` |
| 0.25 Subscription data freshness timestamp | ✅ Done | `ipo/[slug].astro` |
| 0.26 "Total Xx× subscribed" headline | ✅ Done | `ipo/[slug].astro` |
| 0.27 "0 Live IPOs → Next IPO [date]" stat card | ✅ Done | `index.astro` |
| 0.28 FAQ mobile collapse (JS) | ✅ Done | `BaseLayout.astro`, `ContentGuideFaqList.astro` |
| 0.29 First column sticky CSS utility | ✅ Done | `global.css` |
| 0.30 Affiliate links with UTM tracking | ✅ Done | `lib/affiliate-links.ts` (full rewrite) |
| 0.31 Broker detail page uses tracked affiliate URLs | ✅ Done | `broker/[slug].astro` |
| 0.32 HowTo schema on FD, PPF, Lumpsum calculators | ✅ Done | All 3 calculator pages |
| 0.33 SIP, EMI, CAGR already had HowTo/WebApp schema | ✅ Already existed |

### Day 1: Compliance and Safety

**Task 0.1 — Google Consent Mode Fix** (2 hours)

File: `src/layouts/BaseLayout.astro`

```javascript
// Add immediately after the dataLayer initialization, BEFORE any gtag('config')
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}

// CONSENT DEFAULT — must fire before any config
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'analytics_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'wait_for_update': 500
});

gtag('js', new Date());
gtag('config', 'AW-18230401074'); // Now compliant — storage denied by default
```

In the `acceptCookies()` function, add:
```javascript
gtag('consent', 'update', {
  'ad_storage': 'granted',
  'analytics_storage': 'granted',
  'ad_user_data': 'granted',
  'ad_personalization': 'granted'
});
```

**Task 0.2 — Rename AI Branding** (3 hours)

```bash
# Files to change:
src/components/AIInsightBox.astro → rename to IPOScoreBox.astro
src/types/ipo.ts → aiScore → ipoScore
src/lib/ipo-score.ts → update references
All pages that import AIInsightBox → update import + component name
All pages/meta with "AI-powered" → "Data-driven" or "Quantitative"
```

**Task 0.3 — Remove `pages.cursorrules` Route** (15 minutes)

```bash
# Move the file out of pages directory
mv src/pages/pages.cursorrules .cursor/rules/pages.mdc
# Add to robots.txt:
echo "Disallow: /pages.cursorrules" >> public/robots.txt
```

**Task 0.4 — Check .gitignore for Backup Files** (30 minutes)

```bash
# Verify these are gitignored:
echo ".env.prod-backup" >> .gitignore
echo ".env.staging-backup" >> .gitignore  
echo "*.log" >> .gitignore
echo "*.bak" >> .gitignore
echo "src/data/*.generated.json" >> .gitignore
echo "public/sitemap-overlap-staging-*.xml" >> .gitignore

# Delete already-committed log files:
git rm --cached build-log.txt compute-si-prod.log pipeline-si-prod.log si-repair.log
```

**Task 0.5 — Robots.txt Updates** (15 minutes)

File: `public/robots.txt` (create or update)
```
User-agent: *
Allow: /

Disallow: /dashboard
Disallow: /dashboard/
Disallow: /search
Disallow: /1-percent-club/holder/
Disallow: /pages.cursorrules
Disallow: /sitemap-overlap-staging-*

Sitemap: https://ipofins.com/sitemap-index.xml
```

### Day 2: Engineering Quality

**Task 0.6 — Error Boundaries on React Islands** (4 hours)

Create `src/components/ErrorBoundary.tsx`:
```tsx
import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to monitoring when Sentry is added
    console.error('[IPOFins] Component error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div class="p-4 rounded-lg border border-surface-200 dark:border-surface-700 text-sm text-surface-500">
          <p>Data temporarily unavailable.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            class="mt-2 text-primary-600 hover:underline text-xs"
          >
            Try again →
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap all React islands in their `.astro` host:
```astro
<ErrorBoundary client:load>
  <SmartMoneyPage client:load ... />
</ErrorBoundary>
```

**Task 0.7 — Remove Dashboard from Nav** (15 minutes)

`src/components/Header.astro` — remove or comment out the Dashboard `navLinks` entry until the feature is functional.

### Day 3: Input Validation

**Task 0.8 — Calculator Validation Helper** (3 hours)

Create `src/utils/calculator-validation.ts`:
```typescript
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validatePositiveNumber(
  value: number | string,
  fieldName: string,
  min = 1,
  max = 10_000_000
): ValidationResult {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return { isValid: false, error: `${fieldName} must be a number` };
  if (n < min) return { isValid: false, error: `${fieldName} must be at least ${min.toLocaleString('en-IN')}` };
  if (n > max) return { isValid: false, error: `${fieldName} cannot exceed ₹${max.toLocaleString('en-IN')}` };
  return { isValid: true };
}

export function validatePercentage(value: number | string, fieldName: string): ValidationResult {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return { isValid: false, error: `${fieldName} must be a number` };
  if (n < 0 || n > 50) return { isValid: false, error: `${fieldName} must be between 0% and 50%` };
  return { isValid: true };
}

export function validateYears(value: number | string): ValidationResult {
  const n = typeof value === 'string' ? parseInt(value) : value;
  if (isNaN(n) || n < 1 || n > 50) return { isValid: false, error: 'Investment period must be between 1 and 50 years' };
  return { isValid: true };
}
```

Apply to all 16 calculator TSX files.

---

## PHASE 1: SEO FOUNDATION (Week 1-2)

### Week 1: Technical SEO

**Task 1.1 — Fix Sitemap with lastmod** (2 hours)

`astro.config.mjs`:
```javascript
sitemap({
  changefreq: 'weekly',
  filter: (page) =>
    !page.includes('/dashboard')
    && !page.includes('/search')
    && !page.includes('/1-percent-club/holder/'),
  serialize(item) {
    // Assign lastmod and priority by page type
    const priority =
      item.url === 'https://ipofins.com/' ? 1.0 :
      item.url.includes('/ipo/') ? 0.9 :
      item.url.includes('/mutual-funds/') ? 0.9 :
      item.url.includes('/tools/') ? 0.8 :
      item.url.includes('/super-investors/') ? 0.8 :
      item.url.includes('/learn/') ? 0.7 : 0.6;
    return { ...item, lastmod: new Date().toISOString(), priority };
  }
}),
```

**Task 1.2 — Add HowTo Schema to Calculator Pages** (1 day)

Create `src/lib/howto-schema.ts`:
```typescript
export function sipCalculatorHowTo() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to Calculate SIP Returns",
    "description": "Calculate how much your monthly SIP investment will grow using compound interest",
    "totalTime": "PT2M",
    "step": [
      {
        "@type": "HowToStep",
        "position": 1,
        "name": "Enter your monthly SIP amount",
        "text": "Enter how much you plan to invest every month (e.g., ₹5,000)"
      },
      {
        "@type": "HowToStep",
        "position": 2,
        "name": "Set expected annual return rate",
        "text": "Enter the expected annual return percentage. Historical Nifty 50 CAGR is around 12-14%."
      },
      {
        "@type": "HowToStep",
        "position": 3,
        "name": "Choose investment duration",
        "text": "Enter the number of years you plan to invest."
      },
      {
        "@type": "HowToStep",
        "position": 4,
        "name": "View your projected corpus",
        "text": "The calculator shows your total investment, estimated returns, and final corpus."
      }
    ]
  };
}
```

**Task 1.3 — Add og:image:secure_url** (30 minutes)

`src/layouts/BaseLayout.astro` — add after existing `og:image`:
```html
<meta property="og:image:secure_url" content={`${siteUrl}${socialImage}`} />
```

**Task 1.4 — Add WebApplication Schema to Tool Pages** (1 day)

Create a shared utility and apply to all 16 tool pages.

### Week 2: Content SEO

**Task 1.5 — Calculator Content Template** (1 week)

Expand each calculator page to 1,500 words. Use this structure:
1. Hero paragraph (100 words, primary keyword 2x)
2. The interactive tool
3. H2: How to use (200 words + numbered steps)
4. H2: Formula explained (200 words + formula block)
5. H2: Worked examples (300 words + 2 example tables)
6. H2: [Tool] tips for Indian investors (200 words)
7. H2: Frequently Asked Questions (5 FAQs, 500 words total)
8. H2: Related tools (internal links)

**Priority order:** SIP Calculator → EMI Calculator → CAGR Calculator → FD Calculator → Tax Calculator

---

## PHASE 2: IPO GMP + ALERTS (Week 3-4)

### Week 3: IPO GMP Page

**Task 2.1 — Create IPO GMP Page** (`/ipo/gmp-today`)

New file: `src/pages/ipo/gmp-today.astro`

Data approach (Phase 1 — manual/curated):
1. Add `gmp` field to `src/data/ipos.json` (initially manually updated)
2. Show GMP alongside subscription data
3. Add disclaimer: "GMP data is sourced from grey market communities. It is unofficial and NOT regulated by SEBI."
4. Add `FAQPage` schema: "What is IPO GMP?", "Is GMP reliable?", "How is GMP calculated?"

**Task 2.2 — GMP Database Schema** (1 day)

Apply the `ipo_gmp_community` table from V4 architecture in `03_DATABASE_REVIEW.md`.

### Week 4: IPO Alert System

**Task 2.3 — Vercel API Route for IPO Alerts**

Since the site is `output: 'static'`, add a serverless function:

`src/pages/api/ipo-alert.ts`:
```typescript
import type { APIRoute } from 'astro';
import { requireDb } from '../../lib/db';

export const prerender = false; // This API is serverless

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { email, ipoSlug, alertTypes } = body;

  // Validate
  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400 });
  }

  const sql = requireDb();
  const [ipo] = await sql`SELECT id FROM ipos WHERE slug = ${ipoSlug} LIMIT 1`;
  if (!ipo) {
    return new Response(JSON.stringify({ error: 'IPO not found' }), { status: 404 });
  }

  await sql`
    INSERT INTO ipo_alerts (email, ipo_id, alert_types)
    VALUES (${email}, ${ipo.id}, ${alertTypes ?? ['open','close','allotment','listing']})
    ON CONFLICT (email, ipo_id) DO UPDATE SET alert_types = EXCLUDED.alert_types, is_active = TRUE
  `;

  return new Response(JSON.stringify({ success: true }), { status: 200 });
};
```

**Note:** This requires switching `output: 'static'` → `output: 'hybrid'` in `astro.config.mjs`. Alternatively, use a Vercel serverless function directly.

**Task 2.4 — Alert Email Templates with Resend**

```typescript
// src/lib/ipo-alert-email.ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendIPOOpenAlert(email: string, ipo: any) {
  await resend.emails.send({
    from: 'IPOFins <noreply@ipofins.com>',
    to: email,
    subject: `${ipo.name} IPO is now open for subscription`,
    html: `
      <h2>${ipo.name} IPO — Now Open</h2>
      <p>Price Band: ₹${ipo.priceMin} – ₹${ipo.priceMax}</p>
      <p>Open: ${ipo.openDate} · Close: ${ipo.closeDate}</p>
      <a href="https://ipofins.com/ipo/${ipo.slug}">View IPO Details →</a>
      <p style="font-size:11px;color:#666">Not investment advice. <a href="...">Unsubscribe</a></p>
    `
  });
}
```

---

## PHASE 3: PERFORMANCE FIXES (Week 5-6)

### Week 5: Font Self-Hosting + CLS Fixes

**Task 3.1 — Self-Host Fonts** (1 day)

```bash
# Download Inter variable font subset
npx fontsource inter

# Or manually download and subset:
# Place in public/fonts/
# inter-variable.woff2 (latin subset)
# jetbrains-mono-variable.woff2 (latin subset)
```

`src/layouts/BaseLayout.astro` — replace Google Fonts link with:
```html
<!-- Remove: <link href="https://fonts.googleapis.com/css2?..."> -->

<!-- Add to head: -->
<link rel="preload" href="/fonts/inter-variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono-variable.woff2" as="font" type="font/woff2" crossorigin>

<style>
  @font-face {
    font-family: 'Inter';
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url('/fonts/inter-variable.woff2') format('woff2');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }
  @font-face {
    font-family: 'JetBrains Mono';
    font-style: normal;
    font-weight: 100 800;
    font-display: swap;
    src: url('/fonts/jetbrains-mono-variable.woff2') format('woff2');
    unicode-range: U+0000-00FF;
  }
</style>
```

**Task 3.2 — Fix nav-btn-group CLS** (1 hour)

`src/styles/global.css`:
```css
/* Remove all min-height declarations from nav-btn-group */
.nav-btn-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  /* REMOVED: min-height values */
}
```

**Task 3.3 — Fix AdSense CLS** (1 hour)

`src/components/AdUnit.astro` — wrap `<ins>` in fixed-size container:
```astro
<div class="ad-container" style="min-height: 280px; min-width: 250px;" aria-label="Advertisement">
  <ins class="adsbygoogle" ...></ins>
</div>
```

### Week 6: Build Pipeline Optimization

**Task 3.4 — Parallelize Build Steps** (4 hours)

`package.json` — update build script:
```json
"build": "node scripts/verify-source-encoding.mjs && node db/verify-schema.mjs && node scripts/run-export-if-needed.mjs && node scripts/parallel-prebuild.mjs && node scripts/run-astro.mjs build && node scripts/parallel-postbuild.mjs && node scripts/reorganize-sitemaps.mjs && node scripts/verify-sitemaps.mjs"
```

Create `scripts/parallel-prebuild.mjs`:
```javascript
import { execSync } from 'child_process';
await Promise.all([
  import('./generate-insights-articles.mjs'),
  import('./generate-og-images.mjs'),
  import('./ensure-portfolio-overlap-sitemaps.mjs'),
]);
```

---

## PHASE 4: PRODUCT FEATURES (Week 7-10)

### Week 7-8: Dashboard MVP

**Task 4.1 — localStorage Dashboard**

New file: `src/pages/dashboard.astro` — replace stub content

New component: `src/components/dashboard/LocalDashboard.tsx`
- Watchlist: `localStorage.getItem('ipofins-watchlist')` → array of IPO slugs
- Recent: `sessionStorage.getItem('ipofins-recent')` → last 10 pages
- Saved calcs: `localStorage.getItem('ipofins-calculations')` → saved results

Add "Add to Watchlist" button to `IPOCard.astro` and `IPOListRow.astro`.

### Week 9-10: MF Portfolio X-Ray

**Task 4.2 — MF X-Ray Tool** (2 weeks)

New file: `src/pages/tools/mf-xray.astro`
New component: `src/components/tools/MFXRay.tsx`

```tsx
// Core logic (pure client-side)
interface UserHolding { fundSlug: string; amount: number; }

function computeXRay(holdings: UserHolding[], fundHoldings: Record<string, FundHolding[]>) {
  // 1. For each fund, weight its holdings by user's allocation percentage
  // 2. Aggregate weighted stock exposures across all funds
  // 3. Sort by total weighted exposure
  // 4. Group by sector
  // 5. Compute overlap score between funds
  return { topStocks, sectorBreakdown, overlapMatrix, riskMetrics };
}
```

---

## PHASE 5: DATABASE UPGRADES (Week 11-12)

### Week 11: Schema Constraints + Indexes

Apply in order (all zero-downtime operations):

```sql
-- 1. Add CHECK constraints
ALTER TABLE ipos ADD CONSTRAINT ipos_status_check 
CHECK (status IN ('upcoming','live','allotment','listing','listed','withdrawn'));

ALTER TABLE ipos ADD CONSTRAINT ipos_type_check
CHECK (type IN ('mainboard','sme'));

ALTER TABLE tracked_entities ADD CONSTRAINT te_type_check
CHECK (type IN ('individual','family_office','fii','dii','pms','aif','sif'));

-- 2. Add GIN indexes for search (CREATE CONCURRENTLY — no lock)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stocks_name_trgm 
ON stocks USING GIN(name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_funds_name_trgm 
ON funds USING GIN(name gin_trgm_ops);

-- 3. Add missing indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ipos_open_close 
ON ipos(open_date, close_date) WHERE status IN ('upcoming','live');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_navs_fund_latest 
ON fund_navs(fund_id, date DESC) INCLUDE (nav);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_te_aliases 
ON tracked_entities USING GIN(aliases);
```

### Week 12: V4 Additive Tables

```sql
-- Add IPO fundamentals table
-- Add ipo_alerts table  
-- Add mv_refresh_log
-- See 03_DATABASE_REVIEW.md for full DDL
```

---

## MONITORING SETUP (Ongoing)

### Sentry Integration (1 day)

```bash
npm install @sentry/astro
```

`astro.config.mjs`:
```javascript
import sentry from '@sentry/astro';

export default defineConfig({
  integrations: [
    sentry({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      sourceMapsUploadOptions: {
        project: 'ipofins',
        authToken: process.env.SENTRY_AUTH_TOKEN,
      },
    }),
  ],
});
```

### Pipeline Health Monitoring

Add to each pipeline script's completion:
```javascript
// At end of successful pipeline run:
await sql`
  INSERT INTO pipeline_runs (pipeline, status, started_at, finished_at, rows_upserted)
  VALUES (${pipelineName}, 'success', ${startTime}, NOW(), ${rowCount})
`;

// Send Discord webhook
await fetch(process.env.ALERT_WEBHOOK_URL, {
  method: 'POST',
  body: JSON.stringify({ content: `✅ ${pipelineName} completed: ${rowCount} rows` })
});
```

---

## DEPLOYMENT CHECKLIST (Before Each Release)

### Pre-Deploy
- [ ] `npm run db:verify` passes
- [ ] `npm run check` passes (TypeScript)
- [ ] `npm run verify:encoding` passes
- [ ] All new `.astro` pages have valid `title` and `description` props
- [ ] No `console.error` in browser dev tools on key pages
- [ ] Dark mode tested on homepage, IPO detail, Smart Money Tracker

### Post-Deploy
- [ ] Verify Google Search Console — no new crawl errors
- [ ] Verify Sentry — no new errors in first 30 minutes
- [ ] Verify `https://ipofins.com/sitemap-index.xml` is accessible
- [ ] Verify IPO detail page for latest IPO loads correctly
- [ ] Verify Smart Money Tracker tab switching works
- [ ] Verify SIP Calculator produces correct outputs

---

## EFFORT ESTIMATES SUMMARY

| Phase | Duration | Key Deliverables |
|---|---|---|
| Phase 0: Critical Fixes | 3 days | Consent, AI naming, robots.txt, error boundaries, validation |
| Phase 1: SEO Foundation | 2 weeks | Sitemap, schemas, calculator content |
| Phase 2: IPO GMP + Alerts | 2 weeks | GMP page, email alert system |
| Phase 3: Performance | 2 weeks | Self-hosted fonts, CLS fixes, build optimization |
| Phase 4: Product Features | 4 weeks | Dashboard MVP, MF X-Ray |
| Phase 5: Database Upgrades | 2 weeks | Constraints, indexes, V4 tables |
| Monitoring | 1 week | Sentry, pipeline health dashboard |
| **Total** | **~13 weeks** | **Full platform transformation** |
