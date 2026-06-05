# IPOfins.com — Final SEO Audit (Post-Build)

**Site:** ipofins.com | **Pages:** 171 | **Date:** June 2026

---

## 1. IDENTIFIED SEO PROBLEMS

### ✅ Issues Already Fixed
- All pages have H1, meta description, canonical URL
- 0 broken internal links (172 verified)
- 0 dead buttons
- JSON-LD schema on 159/171 pages
- FAQ schema on 14 high-value pages
- Mobile-responsive (Tailwind mobile-first)
- Fast (Astro SSG, <50KB JS per page)
- No old brand references

### ⚠️ Remaining Issues to Address

| # | Issue | Impact | Priority |
|---|-------|--------|----------|
| 1 | **16 article pages have placeholder content** | High | P1 |
| 2 | **No OG image file exists** (`/og-default.png` referenced but not created) | Medium | P1 |
| 3 | **Fund detail pages have empty Holdings section** | Medium | P2 (after deploy) |
| 4 | **Homepage stats are hardcoded** ("156 IPOs", "68%") — not dynamic | Low | P2 |
| 5 | **No Google Analytics / Search Console verification tag** | High | P1 (at deploy) |
| 6 | **No social media profiles linked** (sameAs in Organization schema is empty) | Low | P3 |
| 7 | **Tool pages content could be longer** (currently 200-400 words, ideal 800-1500) | Medium | P2 |
| 8 | **No author/expert byline** on blog/learn pages (E-E-A-T signal) | Medium | P2 |
| 9 | **Chatbot loads React (134KB) on every page** | Low | P3 |
| 10 | **No breadcrumb schema on Learn article pages** | Low | P3 |

### Content Gaps (High-Traffic Keywords Without Pages)

| Keyword | Monthly Volume | Status |
|---------|---------------|--------|
| "best demat account" | 50K | No dedicated page |
| "nifty 50 stocks list" | 80K | No page |
| "stock market today" | 200K | No page (real-time needed) |
| "gold price today" | 150K | No page (real-time) |
| "fd calculator" | 40K | No tool page |
| "ppf calculator" | 35K | No tool page |
| "nps calculator" | 30K | No tool page |
| "lumpsum calculator" | 25K | No tool page |

---

## 2. TECHNICAL SEO FIX PLAN

### 2.1 Site Architecture (Current State — Good)

```
ipofins.com/
├── /ipo (Hub) ─── /mainboard, /sme, /upcoming, /gmp-today, /subscription-status,
│                   /allotment-status, /performance/{year}, /sector/{sector}, /{slug}
├── /mutual-funds (Hub) ─── /best, /all, /holdings-changes, /fund/{slug}
├── /broker (Hub) ─── /compare, /{slug}
├── /tools (Hub) ─── /sip-calculator, /cagr-calculator, /emi-calculator,
│                     /ipo-profit-calculator, /return-simulator
├── /blogs (Hub) ─── /ipo, /mutual-funds, /tools
├── /learn (Hub) ─── /{slug} (26 articles)
└── /about, /contact, /privacy, /terms, /disclaimer
```

**✅ Hub-and-spoke model correctly implemented.**

### 2.2 URL Structure — ✅ Clean
- All lowercase, hyphenated
- Logical hierarchy
- No query parameters
- No duplicate paths

### 2.3 Internal Linking — Current Status

| From | Links To | Status |
|------|----------|--------|
| Homepage | IPO, MF, Tools, Brokers | ✅ |
| IPO pages | GMP, Subscription, Allotment, Performance | ✅ |
| IPO detail | Related IPOs, Tools, Brokers | ✅ |
| MF pages | Best, All, Holdings, Fund details | ✅ |
| Fund detail | Same category funds, SIP Calculator | ✅ |
| Tool pages | Related tools, Blog FAQs | ✅ |
| Blog pages | Tools, IPO, MF cross-links | ✅ |
| Learn pages | Tools, Blog FAQs, Back to Learn | ✅ |
| Footer | IPO, Tools, Brokers, Company | ✅ |

**Improvement needed:** Add contextual links within article content to other articles (e.g., "SIP vs Lumpsum" should link to "What is CAGR" and "Best Mutual Funds for Beginners").

### 2.4 Sitemap & Robots.txt — ✅ Correct
- Sitemap: 170 URLs indexed
- robots.txt: Allows all content pages, blocks /dashboard and /admin
- Sitemap reference in robots.txt ✅
- Sitemap link in HTML head ✅

### 2.5 Schema Markup — Current Coverage

| Schema Type | Pages | Status |
|-------------|-------|--------|
| Organization | 1 (homepage) | ✅ |
| WebSite + SearchAction | 1 (homepage) | ✅ |
| CollectionPage | 8 | ✅ |
| FinancialProduct | 36 (IPO details) | ✅ |
| WebApplication | 5 (tools) | ✅ |
| FAQPage | 14 | ✅ |
| Article | 26 (learn) | ✅ |
| BreadcrumbList | 50+ | ✅ |
| Dataset | 3 (performance) | ✅ |
| Review | 5 (broker) | ✅ |

**Add:** HowTo schema on "How to Apply for IPO" and "How to Open Demat" articles.

### 2.6 Performance — ✅ Excellent

| Metric | Current | Target |
|--------|---------|--------|
| JS (initial, non-tool pages) | 0 KB | < 50KB ✅ |
| JS (tool pages) | ~48KB gzipped | < 50KB ✅ |
| CSS | 52KB | < 100KB ✅ |
| HTML (average page) | ~15KB | < 50KB ✅ |
| Expected LCP | < 1.5s | < 2.5s ✅ |

### 2.7 Crawl Budget — ✅ Optimized
- 170 indexable pages (appropriate for new site)
- Dashboard blocked in robots.txt
- No infinite pagination loops
- No parameter-based duplicate pages

---

## 3. CONTENT STRATEGY FOR RANKING

### 3.1 Immediate Content Priorities

| Priority | Action | Pages Affected |
|----------|--------|---------------|
| P1 | Write content for 16 placeholder articles | 16 learn pages |
| P1 | Add FD Calculator, PPF Calculator, Lumpsum Calculator | 3 new tool pages |
| P2 | Expand tool page text to 800+ words | 5 tool pages |
| P2 | Add "IPO Calendar 2026" page | 1 new page |
| P3 | Add "Best Demat Account" comparison page | 1 new page |

### 3.2 High-Ranking Blog Topics to Add

| Topic | Search Volume | Difficulty | Recommended Page |
|-------|-------------|-----------|-----------------|
| FD calculator online | 40K | Low | /tools/fd-calculator |
| PPF calculator 2026 | 35K | Low | /tools/ppf-calculator |
| Lumpsum calculator | 25K | Low | /tools/lumpsum-calculator |
| NPS calculator | 30K | Low | /tools/nps-calculator |
| Upcoming IPO this week | 20K | Medium | Already at /ipo/upcoming ✅ |
| SME IPO GMP today | 15K | Medium | Covered in /ipo/gmp-today ✅ |
| Best SIP for 5 years | 12K | Low | /learn/best-sip-5-years |
| Zerodha vs Groww 2026 | 40K | Low | Already at /learn/zerodha-vs-groww-vs-upstox ✅ |
| How to check CIBIL score | 80K | Medium | New article opportunity |
| Stock market holidays 2026 | 30K | Low | New page opportunity |

### 3.3 Topic Cluster Strategy

**Cluster 1: IPO (built ✅)**
- Hub: /ipo
- Spokes: mainboard, sme, upcoming, gmp, subscription, allotment, performance, sector, /blogs/ipo

**Cluster 2: Mutual Funds (built ✅)**
- Hub: /mutual-funds
- Spokes: best, all, holdings-changes, fund details, /blogs/mutual-funds

**Cluster 3: Finance Tools (built ✅)**
- Hub: /tools
- Spokes: each calculator, /blogs/tools

**Cluster 4: Learning (built ✅)**
- Hub: /learn
- Spokes: 26 articles across categories

**Cluster 5: Brokers (partially built)**
- Hub: /broker
- Spokes: individual reviews, comparison
- **Add:** /broker/best-for-beginners, /broker/best-for-options

---

## 4. KEYWORD STRATEGY

### 4.1 Primary Keywords (Already Targeting)

| Keyword | Target Page | Volume |
|---------|-------------|--------|
| ipo gmp today | /ipo/gmp-today | 200K |
| sip calculator | /tools/sip-calculator | 150K |
| emi calculator | /tools/emi-calculator | 120K |
| upcoming ipo 2026 | /ipo/upcoming | 100K |
| cagr calculator | /tools/cagr-calculator | 50K |
| best mutual funds 2026 | /mutual-funds/best | 70K |
| ipo allotment status | /ipo/allotment-status | 60K |

### 4.2 Long-Tail Keywords (Low Competition, Fast Ranking)

| Keyword | Page | Volume |
|---------|------|--------|
| sip calculator with step up | /tools/sip-calculator | 5K |
| ipo profit calculator with gmp | /tools/ipo-profit-calculator | 3K |
| zerodha vs groww vs upstox 2026 | /learn/zerodha-vs-groww-vs-upstox | 8K |
| how to check ipo allotment online | /learn/check-ipo-allotment-status | 15K |
| best sip for 1000 per month | /learn/start-investing-500-per-month | 6K |
| direct vs regular mutual fund difference | /learn/direct-vs-regular-mutual-fund | 10K |
| what is nav in mutual fund | /learn/what-is-nav-mutual-fund | 8K |
| elss vs ppf which is better | /learn/elss-vs-ppf-vs-fd | 6K |
| tata capital ipo date | /ipo/upcoming/tata-capital | 5K |
| ather energy ipo gmp | /ipo/upcoming/ather-energy | 4K |

### 4.3 Keyword Clustering

- **Calculator cluster:** sip calculator, cagr calculator, emi calculator, fd calculator, ppf calculator → all on /tools/*
- **IPO research cluster:** ipo gmp, ipo subscription, ipo allotment, upcoming ipo → all on /ipo/*
- **Fund selection cluster:** best mutual funds, top sip funds, elss funds, small cap funds → all on /mutual-funds/*
- **Beginner cluster:** how to invest, demat account, what is sip, start investing → all on /learn/*

---

## 5. BACKLINK STRATEGY

### 5.1 Quick Wins (First 50 Backlinks)

| Source | Type | How | Effort |
|--------|------|-----|--------|
| ProductHunt | Directory | Submit as "free finance tool" | Low |
| AlternativeTo | Directory | List as alternative to Chittorgarh | Low |
| Reddit r/IndiaInvestments | Forum | Answer questions, link to calculators | Low |
| Reddit r/IndianStreetBets | Forum | Share IPO analysis | Low |
| Quora IPO questions | Q&A | Detailed answers with tool links | Low |
| GitHub README | Open source | Open-source calculator code | Medium |
| BetaList | Startup directory | Submit for exposure | Low |
| StartupIndia | Directory | Register as fintech startup | Low |
| Indie Hackers | Community | Share building journey | Low |
| Twitter/X finance community | Social | Share daily GMP updates | Low |

### 5.2 Guest Posting Targets

| Site | DA | Topic Fit | Approach |
|------|-----|-----------|----------|
| FreeFinCal.com | 45 | MF, SIP, Tax | Guest post on CAGR/SIP |
| Capitalmind.in | 50 | IPO, Markets | IPO performance data analysis |
| PersonalFinancePlan.in | 35 | Planning | Tax saving guide |
| MoneyExcel.com | 30 | Tools | Calculator comparison |

### 5.3 Linkable Assets (Create)

1. **"IPO Performance Report 2026"** — Annual data PDF (journalists love data)
2. **"SIP Return Comparison Infographic"** — Visual showing ₹5K/month over 5/10/15/20 years
3. **"Mutual Fund Holdings Tracker"** — Once populated, unique data source

---

## 6. CTR & RANKING IMPROVEMENTS

### 6.1 Title Tags — Current vs Optimized

| Page | Current Title | Optimized |
|------|---------------|-----------|
| SIP Calculator | SIP Calculator 2026 - Free Online SIP Return Calculator | **SIP Calculator** - Free Online Mutual Fund SIP Calculator (₹500 Start) |
| GMP Today | IPO GMP Today ({date}) - Live Grey Market Premium | **IPO GMP Today** Live - {date} Grey Market Premium for All IPOs |
| Upcoming | Upcoming IPO 2026 - New IPO List India | **Upcoming IPO 2026** ({count} IPOs) - Ather, OYO, Tata Capital |

**Pattern:** Primary keyword first → Hook/Number → Brand last (or omit)

### 6.2 Meta Descriptions — Add CTAs

Current: descriptive but passive.
Improved: Add action verbs + numbers + urgency.

Example:
- Before: "Track all upcoming IPOs in India with AI analysis."
- After: "**10 upcoming IPOs** including Tata Capital & OYO. Check DRHP status, expected dates & AI scores. Updated every 12 hrs. →"

### 6.3 FAQ Schema — Maximize Rich Results

Currently on 14 pages. Should be on ALL tool pages, IPO sub-pages, and blog pages.
**Target: 25+ pages with FAQPage schema** to dominate "People Also Ask" boxes.

---

## 7. GROWTH ROADMAP

### Days 1-30: Deploy & Index

| Week | Actions | Expected Result |
|------|---------|-----------------|
| **Week 1** | Deploy to Vercel. Add custom domain ipofins.com. Submit sitemap to Google Search Console + Bing. Request indexing for top 20 pages. Create Google Business Profile. | 50+ pages indexed in 7 days |
| **Week 2** | Create OG image. Add Google Analytics (GA4). Fix placeholder article content (top 10 pages). Submit to 10 directories (ProductHunt, AlternativeTo, BetaList). | Traffic tracking live. 10 backlinks. |
| **Week 3** | Answer 15 Quora questions (link to tools). Post on 5 Reddit threads. Create Twitter account, share daily GMP. | 30+ backlinks. Social presence. |
| **Week 4** | Add 3 new calculator pages (FD, PPF, Lumpsum). Write remaining article content. Optimize titles based on Search Console impressions data. | 175+ pages. Content complete. |

**Target Day 30:** 100+ pages indexed, 500 organic visits, 40+ backlinks.

### Days 31-60: Content & Authority

| Week | Actions | Expected Result |
|------|---------|-----------------|
| **Week 5-6** | Publish 5 new learn articles (high-volume keywords). Guest post on 3 finance blogs. Create IPO Performance infographic. Share on social. | 50+ backlinks. Authority growing. |
| **Week 7-8** | Add "vs" comparison pages (/broker/zerodha-vs-groww). Create IPO Calendar page. Optimize top 10 pages based on CTR data from Search Console. Add HowTo schema to guide articles. | Content clusters complete. Improved CTR. |

**Target Day 60:** 3,000 organic visits/month. DA 10+. 5 keywords in top 20.

### Days 61-90: Scale & Monetize

| Week | Actions | Expected Result |
|------|---------|-----------------|
| **Week 9-10** | Apply for Google AdSense (need 30+ quality pages ✅). Add broker affiliate links (Zerodha, Groww referral programs). Expand to 200+ pages with new IPO/MF data. | AdSense approved. First revenue. |
| **Week 11-12** | Build email list (IPO alerts). Create YouTube channel (IPO reviews). Reach out to finance newsletters for cross-promotion. Optimize for featured snippets based on ranking data. | 10K visits/month. Revenue ₹5-15K/month. |

**Target Day 90:** 10,000 organic visits/month. AdSense live. ₹10K+ monthly revenue. 10 keywords on page 1.

---

## KEY METRICS TO TRACK

| Metric | Tool | 30-Day Target | 90-Day Target |
|--------|------|---------------|---------------|
| Indexed pages | Google Search Console | 100+ | 170+ |
| Organic clicks | Search Console | 500/month | 10K/month |
| Average position | Search Console | Top 30 (5 keywords) | Top 10 (10 keywords) |
| Backlinks | Ahrefs/Ubersuggest | 40+ | 100+ |
| Domain Authority | Moz | DA 5 | DA 15 |
| Core Web Vitals | PageSpeed Insights | All green | All green |
| Bounce rate | GA4 | < 65% | < 55% |
| Pages/session | GA4 | > 1.5 | > 2.5 |
| AdSense RPM | AdSense | — | ₹50-100 |

---

## IMMEDIATE ACTION ITEMS (Do This Week)

1. ☐ Deploy to Vercel + connect ipofins.com domain
2. ☐ Submit sitemap to Google Search Console
3. ☐ Create OG image (1200×630px) for social sharing
4. ☐ Add GA4 tracking code
5. ☐ Submit to ProductHunt and AlternativeTo
6. ☐ Answer 5 Quora questions with calculator links
7. ☐ Create Twitter/X account, post first GMP update
8. ☐ Write content for remaining 16 placeholder articles
