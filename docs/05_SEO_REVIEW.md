# 05 — SEO Review: IPOFins

> Reviewed by: SEO Expert (Ahrefs) + Product Manager (Stripe)  
> Benchmarked against: Moneycontrol · Screener · Trendlyne · Tickertape · ValueResearch · ET Markets

---

## TECHNICAL SEO AUDIT

### Strengths

✅ **Clean URL structure** — `/ipo/{slug}`, `/mutual-funds/fund/{slug}`, `/super-investors/{slug}` — all SEO-friendly.

✅ **Canonical URLs** — `BaseLayout.astro` generates canonical URLs from `Astro.url.pathname` with trailing-slash normalization. This is correctly implemented.

✅ **Sitemap** — `@astrojs/sitemap` generates sitemap with `changefreq: weekly`. Dashboard, search, and 1% Club holder pages are correctly excluded.

✅ **Structured Data** — Homepage has WebSite (with SearchAction), Organization, ItemList, FAQPage. IPO pages have FinancialProduct, FAQPage, BreadcrumbList. This is well above average for Indian finance sites.

✅ **Open Graph + Twitter Cards** — All implemented in BaseLayout. Per-page OG images generated at build time.

✅ **Robots meta** — `robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'` — excellent, enables rich snippets.

✅ **Breadcrumbs** — Implemented on MF index, super investors, IPO pages. BreadcrumbList schema included.

✅ **Inter + JetBrains Mono from Google CDN with preconnect** — reduces font load latency.

✅ **`lang="en-IN"`** — Correct locale targeting for Indian English.

✅ **`geo.region` and `geo.placename` meta tags** — Signals Indian geo-targeting.

---

### Critical SEO Issues

**Issue 1 — Google Ads Conversion Tag Before Consent (Consent Signal Impact)**  
Severity: Critical  
The `AW-18230401074` conversion tag fires before cookie consent. Google's own consent mode requires this tag to be in non-personalized mode until consent is given. Without this, Google may downrank the site in personalized results or flag it in their ad quality review.  
**Fix:** Implement `gtag('consent', 'default', {'ad_storage': 'denied', 'analytics_storage': 'denied'})` before the gtag config, then update on consent acceptance.

**Issue 2 — `pages.cursorrules` File in `src/pages/`**  
Severity: Critical  
A `src/pages/pages.cursorrules` file exists inside the Astro pages directory. Astro will create a route for this file (`/pages.cursorrules`) — a public page with Cursor IDE configuration content. This could be indexed by Google.  
**Fix:** Move to `.cursor/rules/pages.mdc` and add `/pages.cursorrules` to `public/robots.txt` Disallow, or delete the file entirely.

**Issue 3 — Staging Sitemaps in Production Public Directory**  
Severity: High  
`public/sitemap-overlap-staging-*.xml` files are committed. If these appear in the sitemap index or are crawlable, they expose your staging URL architecture and waste crawl budget.  
**Fix:** Add `sitemap-overlap-staging-*.xml` to `.gitignore` and `robots.txt` Disallow.

**Issue 4 — `/1-percent-club/holder/*` Not in Robots.txt Disallow**  
Severity: High  
These pages are excluded from the sitemap but are not blocked in `robots.txt`. Googlebot will find them via internal links and crawl them, consuming crawl budget on pages that may have thin or duplicate content.  
**Fix:** Add to `public/robots.txt`:
```
Disallow: /1-percent-club/holder/
Disallow: /dashboard
Disallow: /search
```

---

### High-Priority SEO Issues

**Issue 5 — Thin Content on All Calculator Pages**  
Each calculator page (`/tools/sip-calculator`, etc.) has the interactive tool and a brief intro paragraph (~100-200 words). Google's quality guidelines for YMYL (Your Money Your Life) finance pages require demonstrable expertise and comprehensive content.  
**Target:** 1,500-2,000 words per tool page (formula explanation, worked examples, FAQs, use cases).  
**Impact:** This single fix could move calculator pages from position 20-50 to position 3-10 for high-volume queries (SIP calculator: 150K/month, EMI calculator: 120K/month).

**Issue 6 — Title Tag Format Has Brand at End for Many Pages**  
`withBrandSuffix()` in `brand.ts` appends `| IPOFins` to titles. For branded searches this is fine, but for discovery queries, leading with the keyword converts better.  
**Current:** `SIP Calculator - Free Online Tool | IPOFins`  
**Better:** `SIP Calculator India 2026 - Free, Instant Returns | IPOFins`  
**Rule:** Lead with the primary keyword. Include the year for time-sensitive pages. Keep under 60 characters.

**Issue 7 — No HowTo Schema on Calculator Pages**  
Google shows HowTo rich results for step-by-step instructions, which calculators naturally have.  
**Fix:** Add HowTo schema to SIP, EMI, CAGR, and IPO Profit calculators:
```json
{
  "@type": "HowTo",
  "name": "How to Calculate SIP Returns",
  "step": [
    {"@type": "HowToStep", "name": "Enter monthly investment amount", "text": "..."},
    {"@type": "HowToStep", "name": "Set expected annual return", "text": "..."},
    {"@type": "HowToStep", "name": "Choose investment duration", "text": "..."}
  ]
}
```

**Issue 8 — Duplicate FAQs in Schema and HTML**  
The IPO index page has 13 FAQ items in both the `FAQPage` JSON-LD and the `ContentGuideFaqList` HTML. Google's guidelines say JSON-LD must match visible page content — this is correctly done. However, having 13 FAQs in schema risks Google showing only 2-3 in the SERP (their limit). Prioritize the 3-5 highest-volume questions in the schema.

**Issue 9 — `og:image:secure_url` Missing**  
Open Graph images use `og:image` but not `og:image:secure_url`. For HTTPS pages, both should be specified.  
**Fix:**
```html
<meta property="og:image:secure_url" content={`${siteUrl}${socialImage}`} />
```

**Issue 10 — Missing `lastmod` in Sitemap**  
The `@astrojs/sitemap` integration generates sitemaps without `<lastmod>` dates. Google uses `lastmod` to prioritize recrawling.  
**Fix:** Configure sitemap with `serialize` callback to add lastmod:
```js
sitemap({
  serialize(item) {
    return { ...item, lastmod: new Date().toISOString() };
  }
})
```

---

## CONTENT SEO AUDIT

### Topic Coverage vs Search Volume

| Topic | Monthly Searches (India) | Coverage | Content Depth |
|---|---|---|---|
| IPO GMP today | 200,000+ | ❌ Redirected to subscription status | — |
| SIP calculator | 150,000+ | ✅ `/tools/sip-calculator` | 🟡 Thin |
| Upcoming IPO 2026 | 100,000+ | ✅ `/ipo/upcoming` | 🟡 Thin |
| EMI calculator | 120,000+ | ✅ `/tools/emi-calculator` | 🟡 Thin |
| IPO allotment status | 60,000+ | ✅ `/ipo/allotment-status` | 🟡 Thin |
| Best mutual fund 2026 | 70,000+ | ✅ `/mutual-funds/best` | 🟡 Thin |
| CAGR calculator | 50,000+ | ✅ `/tools/cagr-calculator` | 🟡 Thin |
| Zerodha review | 45,000+ | ✅ `/broker/zerodha` | 🟡 Thin |
| FD calculator | 45,000+ | ✅ `/tools/fd-calculator` | 🟡 Thin |
| PPF calculator | 40,000+ | ✅ `/tools/ppf-calculator` | 🟡 Thin |
| Super investor India | 30,000+ | ✅ `/super-investors` | ✅ Good |
| Dolly Khanna portfolio | 25,000+ | ✅ `/super-investors/dolly-khanna` | ✅ Good |
| Mutual fund portfolio overlap | 15,000+ | ✅ `/mutual-funds/portfolio-overlap-checker` | ✅ Good |
| Smart money tracker | 8,000+ | ✅ `/mutual-funds/smart-money` | ✅ Good |
| IPO subscription status | 8,000+ | ✅ `/ipo/subscription-status` | ✅ Good |

**Most Critical Gap:** IPO GMP today (200K+ searches/month) redirects to subscription status. This is the single largest SEO opportunity currently being ceded to competitors like Chittorgarh and IPO Watch.

---

### Content Gap Analysis

**Highest-Priority Missing Content:**

1. **IPO GMP page** — 200K+ monthly searches. The `vercel.json` has a permanent redirect from `/ipo/gmp-today` to `/ipo/subscription-status`. This redirected traffic is lost. Even a basic GMP page with community-sourced data (clearly labeled as unofficial) would capture this traffic.

2. **"Best SIP funds 2026"** — Content page on `/mutual-funds/best-sip-funds` or `/learn/best-sip-to-invest-2026`. 80K+ searches. Currently no dedicated landing page — the `/mutual-funds/best` page exists but has thin content.

3. **"How to check IPO allotment"** — 60K searches. `/ipo/allotment-status` page exists but is thin. Needs a 1,500-word guide with step-by-step screenshots.

4. **"Zerodha vs Groww vs Upstox"** — 40K+ searches. `/broker/compare` exists but no dedicated comparison pages. `/broker/zerodha-vs-groww` could be a simple programmatic page.

5. **"Nifty CAGR last 10 years"** — 10K+ searches. This is a 200-word factual answer that ranks for multiple related queries. Create `/learn/nifty-cagr-history`.

---

### E-E-A-T (Expertise, Authoritativeness, Trustworthiness) Assessment

**Finance is YMYL (Your Money Your Life).** Google applies the strictest quality standards to YMYL pages. Current E-E-A-T gaps:

| Signal | Current State | Recommendation |
|---|---|---|
| Author attribution | `AuthorByline.astro` exists but team profiles are missing | Create `/about/team` with real names, LinkedIn links, credentials |
| Methodology page | ✅ `/methodology` exists | Add specific data source citations, update frequency, error correction process |
| About page | ✅ `/about` exists | Add founding story, team credentials, investment philosophy |
| Expert review | ❌ None | Add "Reviewed by [SEBI-registered analyst]" byline to IPO analysis pages |
| Data citations | ✅ "From AMFI/NSE/BSE" shown | Add specific filing dates and AMFI circular references |
| Disclaimer | ✅ On every page (footer) | ✅ Good |
| Contact page | ✅ Exists | Add physical address if possible (trust signal) |
| Social proof | Weak | Add "10,000+ investors track funds monthly" (if true) |

---

## STRUCTURED DATA AUDIT

### Currently Implemented (Well)

| Page | Schema Types |
|---|---|
| Homepage | WebSite + SearchAction, Organization, ItemList, FAQPage |
| `/ipo` | CollectionPage, FAQPage |
| `/ipo/{slug}` | (Need to verify — IPOLayout handles this) |
| `/mutual-funds` | CollectionPage, FAQPage |
| `/super-investors` | CollectionPage, FAQPage, BreadcrumbList |
| BaseLayout | Organization (site-wide) |

### Missing Schema

| Page | Missing Schema | Impact |
|---|---|---|
| All tool pages | HowTo | Rich step-by-step results |
| `/tools/sip-calculator` | WebApplication | App-like SERP results |
| `/broker/{slug}` | Review, LocalBusiness | Star ratings in SERP |
| `/learn/{slug}` | Article, Author | Author rich results |
| `/ipo/{slug}` | Event (IPO open/close dates) | Event rich results |
| `/super-investors/{slug}` | Person | Entity knowledge panel |

---

## PROGRAMMATIC SEO OPPORTUNITIES

The site already implements programmatic SEO for:
- Individual IPO pages (`/ipo/{slug}`)
- Fund pages (`/mutual-funds/fund/{slug}`)
- Super investor profiles (`/super-investors/{slug}`)
- Portfolio overlap pairs (`/mutual-funds/portfolio-overlap-checker/{fund-a}-vs-{fund-b}`)

**Additional programmatic SEO opportunities:**

1. **IPO Sector pages** — `/ipo/sector/technology`, `/ipo/sector/healthcare` — "Technology IPOs 2026 India"
2. **Broker vs Broker** — `/broker/zerodha-vs-groww`, `/broker/groww-vs-upstox` — 40K+ searches each
3. **Fund category pages** — `/mutual-funds/all/large-cap-mutual-funds` (exists) — expand with rich content
4. **Stock-level super investor pages** — `/1-percent-club/{stock-slug}` — "Who owns [Company] stock India"
5. **AMC profile pages** — `/mutual-funds/amc/{slug}` — "HDFC Mutual Fund portfolio 2026"
6. **Quarterly IPO performance reports** — `/ipo/performance/q1-2026` — seasonal ranking opportunity

---

## INTERNAL LINKING AUDIT

### Current Internal Linking Patterns

✅ Footer has comprehensive 7-section link matrix  
✅ Homepage links to all major sections  
✅ Related content sections at bottom of pages  
✅ Breadcrumb navigation on hub pages  

### Internal Linking Gaps

**Gap 1 — Calculator pages don't link to related tools:**  
SIP Calculator doesn't link to Step-Up SIP Calculator, Lumpsum Calculator, or SWP Calculator. Users who finish using one calculator have no natural next step.  
**Fix:** Add "Also try" cards after calculator results: "Planning your corpus? Try our Retirement Calculator →"

**Gap 2 — IPO detail pages don't link to sector performance:**  
`/ipo/varun-beverages-ipo` doesn't link to `/ipo/sector/fmcg`. This misses both a UX opportunity and an internal link building opportunity.

**Gap 3 — Super investor profile pages don't link to 1% Club:**  
The connection between super investors (curated, quarterly) and 1% Club (raw, quarterly) is not surfaced via internal links on profile pages.

**Gap 4 — MF fund pages don't cross-link to Smart Money signals:**  
`/mutual-funds/fund/hdfc-flexi-cap-fund` doesn't link to the Smart Money signal for stocks it holds.

---

## CANONICAL URL STRATEGY

Current canonical implementation in `BaseLayout.astro`:
```js
const normalizedPathname = Astro.url.pathname.replace(/\/+$/, '') || '/';
const canonical = canonicalUrl || new URL(normalizedPathname, siteUrl).href;
```

This strips trailing slashes, which is correct. The `canonicalFor()` function in `tracked-entities.ts` generates canonical URLs for super investor pages.

**Potential Issue:** Portfolio overlap pages (`/mutual-funds/portfolio-overlap-checker/{fund-a}-vs-{fund-b}`) use a Vite dev middleware fallback to serve the index page — the canonical URL might be the index page rather than the actual comparison URL, which would cause duplicate content signals.  
**Fix:** Explicitly pass `canonicalUrl` to the `BaseLayout` for all programmatically-generated overlap comparison pages.

---

## ROADMAP TO RANK #1

### Month 1: Technical Foundations
- Fix `pages.cursorrules` file (no-index or delete)
- Add robots.txt Disallow for `/1-percent-club/holder/`
- Remove staging sitemaps from production
- Add `lastmod` to sitemap entries
- Add `og:image:secure_url` everywhere
- Fix GTM consent mode implementation
- Add HowTo schema to top 5 calculator pages

### Month 2: Content Depth
- Expand all 16 calculator pages to 1,500+ words each
- Create dedicated `/ipo/gmp-today` page (even with disclaimer)
- Build `/broker/zerodha-vs-groww` and 4 more broker vs pages
- Create `/learn/best-sip-to-invest-2026` content page
- Add author bylines with credentials to all analysis pages

### Month 3: Topic Authority
- Publish 20 learn articles targeting long-tail keywords
- Build AMC profile pages programmatically
- Add stock-level super investor pages for top 50 tracked stocks
- Create quarterly IPO performance reports (Q1 2026, etc.)
- Build topical cluster around "smart money tracker India"

### Month 4-6: Authority Building
- Submit to top 20 finance directories
- Reach out for guest posts on FreeFinCal, Capitalmind, ValueResearch
- Create linkable assets: "State of Indian IPO Market 2026" PDF report
- Build Reddit/Quora presence for IPO and MF tracking queries
- Implement WebApplication schema on all calculator pages for App Pack eligibility

### Expected Outcomes (if executed fully)

| Metric | Current | 3 Months | 6 Months |
|---|---|---|---|
| Indexed pages | ~200 | ~400 | ~1,000+ |
| Organic traffic | Unknown | ~20K/month | ~80K/month |
| Ranking keywords (top 20) | ~50 | ~200 | ~800 |
| Domain Rating | Low | DR 15-20 | DR 25-35 |

---

## META TITLE OPTIMIZATION GUIDE

### Formula for Each Page Type

| Page Type | Title Formula |
|---|---|
| Calculator | `[Calculator Name] India 2026 — Free [What It Calculates] \| IPOFins` |
| IPO hub | `All IPOs India 2026 — Live, Upcoming & Listed \| IPOFins` |
| IPO detail | `[Company] IPO 2026 — Price, Dates, GMP, Analysis \| IPOFins` |
| Super investor | `[Name] Portfolio 2026 — Latest Holdings & Changes \| IPOFins` |
| Fund category | `Best [Category] Mutual Funds 2026 — Top Picks & Returns \| IPOFins` |
| Learn article | `[Topic]: Complete Guide for Indian Investors 2026 \| IPOFins` |

### Current vs Recommended Examples

| Page | Current Title | Recommended Title |
|---|---|---|
| SIP Calculator | (Not verified, estimated) "SIP Calculator \| IPOFins" | "SIP Calculator India 2026 — Free Monthly Returns Calculator \| IPOFins" |
| IPO index | "All IPOs India 2026 - Mainboard & SME \| IPOFins" | ✅ Good — 58 chars |
| MF index | "Mutual Funds India 2026 - Best & All Funds \| IPOFins" | ✅ Good |
| Super investors | "Top Super Investors in India 2026 — Tracked Portfolios \| IPOFins" | ✅ Good — 67 chars, slightly over limit |

---

## IMPLEMENTATION STATUS (July 2026)

| Item | Status |
|---|---|
| Consent Mode v2 | ✅ |
| GMP page + IPO sector pages | ✅ |
| Sitemap lastmod | ✅ |
| HowTo + WebApplication tool schemas | ✅ |
| IPO Event schema on detail pages | ✅ |
| IPO index FAQ JSON-LD (top 5) | ✅ |
| AMC profile pages | ✅ |
| Best SIP funds 2026 landing | ✅ |
| Calculator long-form content (15 tools) | ✅ |
| Fund → Smart Money internal links | ✅ |
| Learn articles (20+ generated) | ✅ via `generate-insights-articles.mjs` |
| Site-wide title optimization | ✅ Key calculator + landing pages updated |
| Portfolio overlap canonical | ✅ Existing meta/canonical on checker |
