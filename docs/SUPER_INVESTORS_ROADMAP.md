# Super Investors & 1% Club — Product Roadmap

**Status:** Planning (discussion locked, implementation not started on `main`)  
**Last updated:** 2026-06-24  
**Branch strategy:** Fresh feature branch from `main` (staging Neon in `.env`, prod in `.env.prod-backup`)

---

## Vision & positioning

> **India's free smart-money map:** official NSE/BSE shareholding data for **mutual funds + super investors + 1% holders** — fast, mobile-first, no login.

**Beat competitors on:**
- Speed & mobile UX (vs Trendlyne dense tables)
- MF + super-investor combined view (unique vs everyone)
- Free, no paywall (vs Screener premium depth)
- Clean SEO URLs + FAQs (vs Tickertape/smallcase thin collections)

**Do not compete on (v1):** 60+ superstar roster, live tick-by-tick portfolio, alerts/follow, copy-trade baskets, news feeds.

---

## Locked product decisions

| Decision | Choice |
|----------|--------|
| Super investor roster | **30 curated** profiles at launch |
| 1% Club coverage | **All stocks** with SHP data in DB |
| 1% Club hub search | **By stock** + **By name** |
| Portfolio value | **₹ Cr** on profiles (price × shares at build) |
| Homepage message | “Track what MFs **and** super investors are buying” |
| Promoters | Excluded from conviction views; show separately on stock pages |
| Data sources | Quarterly **SHP** (primary) + **SAST** weekly (Phase 5) |
| Custom site-wide search | v1.5 (name search lives on 1% Club hub in v1) |
| PMS / AIF / 1% Club separate products | **Out of v1 scope** |

---

## Route map (v1)

```
/super-investors                          Hub
/super-investors/[slug]                    Profile (30 pages)
/super-investors/most-bought               Leaderboard (Phase 4)

/1-percent-club                            Hub + dual search
/1-percent-club/[stock-slug]               Stock holder list
/1-percent-club/holder/[name-slug]           Name search results (uncurated)
```

---

## Progress legend

- `[ ]` Not started  
- `[~]` In progress  
- `[x]` Done  
- `[-]` Cancelled / deferred  

---

# Phase 0 — Foundation & branch setup

**Goal:** Clean slate from `main`, staging DB, spec frozen.

### Engineering
- [ ] Create branch `feature/super-investors-v1` from `main`
- [ ] Confirm `.env` → staging Neon; `.env.prod-backup` → prod (never run SI pipelines on prod until Phase 6)
- [ ] Document env switch procedure in team notes
- [ ] Add this roadmap to project tracking (GitHub Project / issues optional)

### Product / content
- [ ] Finalize list of **30 super investors** (names, slugs, aliases, bios, focus, tier)
- [ ] Expand `super-investors.json` from 15 → 30 (currently 15 in `my-future-feature` only)
- [ ] Define alias rules doc (e.g. Kedia vs Kedia Securities Pvt Ltd)

### Competitive baseline
- [ ] Screenshot / note Trendlyne hub + 2 profile pages (reference UX)
- [ ] Screenshot Moneycontrol investor page (SEO reference)
- [ ] List top 20 Google queries to win (e.g. `dolly khanna portfolio 2026`)

**Exit criteria:** Branch exists, 30-name roster approved, staging DB URL verified.

---

# Phase 1 — Database design & pipelines

**Goal:** Staging DB has migrations, seed, one full SHP quarter, compute layer working.

### DB design (migrations 005/006 — trim to SI + 1% Club only)

**Core tables (required v1):**
- [ ] `tracked_entities` — curated roster (30 rows)
- [ ] `tracked_entity_tags` — optional tags
- [ ] `shareholding_pattern_holders` — raw ≥1% rows (powers 1% Club)
- [ ] `entity_holdings` — matched positions per entity per quarter
- [ ] `entity_changes` — QoQ fresh entry / exit / increase / decrease
- [ ] `entity_quarterly_stats` — portfolio value, # stocks, sector mix
- [ ] `stocks` — reuse existing; ensure NSE symbol + slug coverage
- [ ] `pipeline_runs` — ops log

**Defer to v2 (do not build UI yet):**
- [ ] `entity_conviction`, `entity_overlaps`, `entity_stock_signals` — compute optional in v1
- [ ] Materialized views — only if query perf needs it at build time

### DB tasks
- [ ] Write / adopt `005_super_investors.sql` (minimal v1 subset if trimming from `my-future-feature`)
- [ ] Write / adopt `006_super_investor_views.sql` (only views needed for hub stats)
- [ ] Apply migrations on **staging Neon**
- [ ] `npm run db:seed-superinvestors` — load 30 roster entries
- [ ] Update `db/verify-schema.mjs` — 005 tables warn on prod, pass on staging
- [ ] `scripts/check-tracked-status.mjs` — QA script for row counts

### Pipeline — quarterly SHP (P0)
- [ ] `pipeline:superinvestor` — fetch NSE/BSE SHP for all covered stocks
- [ ] Name resolver — match holder names → `tracked_entities` via aliases
- [ ] Quality gate — abort if row count &lt; 70% of prior quarter
- [ ] `--dry-run` flag tested on staging
- [ ] First successful quarter loaded on staging
- [ ] Document quarterly calendar (Apr/Jul/Oct/Jan + ~25 day lag)

### Pipeline — compute (P0)
- [ ] `db:compute-si` — derive `entity_holdings`, `entity_changes`, `entity_quarterly_stats`
- [ ] Portfolio **₹ value** = shares × price (define price source: latest NAV/close at build)
- [ ] Re-run compute after roster JSON edits (no re-scrape needed)

### Overrides (resilience)
- [ ] Create `src/data/si-overrides/` + README
- [ ] Merge override JSON when exchange fetch fails

### SEO (data layer)
- [ ] Every stock page needs `stock.slug` stable for `/1-percent-club/[slug]`
- [ ] `lastmod` / quarter field exposed for meta `dateModified`
- [ ] No indexable pages generated for stocks with zero ≥1% non-promoter holders

**Exit criteria:** Staging has ≥1 full quarter SHP; 30 entities have holdings; 1% Club stock count known; `check-tracked-status` green.

---

# Phase 2 — UI/UX (core pages)

**Goal:** Shippable pages that beat Trendlyne on mobile clarity.

### Design system (before pages)
- [ ] `EntityCard` — investor card (name, ₹ Cr, # stocks, QoQ badge, focus)
- [ ] `HolderTable` — responsive holdings table (max 6 cols mobile)
- [ ] `MovePills` — New / Exit / ↑ / ↓ chips
- [ ] `QuarterBadge` — “Q1 FY26 · filed data”
- [ ] `DisclaimerBox` — SEBI 1% rule, not advice, quarterly lag
- [ ] `SearchToggle` — By stock | By name segmented control

### Super Investors hub `/super-investors`
- [ ] Hero + snapshot strip (X investors · Y fresh entries · quarter)
- [ ] Card grid grouped by type (Individual / FII / DII)
- [ ] Sort: portfolio value, # fresh entries, name
- [ ] FAQ section + JSON-LD FAQPage
- [ ] Cross-links: 1% Club, MF Smart Money, methodology
- [ ] **No** giant 12-column table (Trendlyne anti-pattern)

### Super Investor profile `/super-investors/[slug]` (×30)
- [ ] Header: name, focus, bio, quarter, **₹ portfolio value** + QoQ % change
- [ ] **Above fold:** Top moves (fresh entries, exits, biggest add/trim)
- [ ] Holdings table: Stock | % co. | % portfolio | QoQ pill | ₹ value | link
- [ ] Aliases block: “Also filed as: …”
- [ ] Sector mix bar (simple — no heavy chart lib)
- [ ] Related investors (same tier / overlapping stocks)
- [ ] Per-stock link → 1% Club stock page
- [ ] JSON-LD: ProfilePage or Person + breadcrumb
- [ ] Empty state if entity in roster but no SHP match yet

### 1% Club hub `/1-percent-club`
- [ ] Stats: stocks tracked, curated holder count, mystery count, quarter
- [ ] **Search by stock** — autocomplete → stock page
- [ ] **Search by name** — fuzzy match → holder results page
- [ ] Browse table: Stock | # holders | top holder % | curated count
- [ ] FAQ + JSON-LD
- [ ] Empty state before first pipeline run

### 1% Club stock page `/1-percent-club/[stock-slug]`
- [ ] Stock name + quarter
- [ ] Promoter % separate (not in conviction table)
- [ ] Holders table: Name | Type | % | Shares | Curated link
- [ ] Curated → correct URL by type (`/super-investors/…` only in v1)
- [ ] Mystery holders — name only, no broken links
- [ ] **Do not** build page if zero non-promoter ≥1% holders (`noindex` or skip path)

### 1% Club name results `/1-percent-club/holder/[slug]`
- [ ] Table of all stocks where name holds ≥1%
- [ ] Banner if matches curated super investor → link to full profile
- [ ] Group legal entity variants under one heading when possible
- [ ] `noindex` on thin result pages (&lt;1 holding)

### UX principles (vs competitors)
- [ ] Mobile-first cards on hubs (beat Trendlyne)
- [ ] Moves before full table on profiles (beat Screener burying changes)
- [ ] One primary CTA per section (no RA basket upsell)
- [ ] Skeleton loaders for any client search autocomplete
- [ ] Color contrast: `surface-600` for small muted text (a11y)

**Exit criteria:** All 30 profiles + all stock pages with data render on staging build; no `_placeholder` indexed.

---

# Phase 3 — SEO & discovery

**Goal:** Rank on name + stock shareholder queries; internal link mesh.

### On-page SEO
- [ ] Title pattern: `{Name} Portfolio & Shareholdings {Quarter} | IPOFins`
- [ ] Title pattern: `{Stock} Major Shareholders (≥1%) {Quarter} | IPOFins`
- [ ] Meta descriptions unique per profile (include ₹ Cr, # stocks, quarter)
- [ ] H1 = investor name or stock name + “Shareholdings”
- [ ] BreadcrumbList JSON-LD on all new pages
- [ ] FAQ schema on hub pages
- [ ] Canonical URLs — no duplicate `?q=` indexed; canonical to slug URLs

### Sitemap
- [ ] Add bucket `sitemap-super-investors.xml` (30 + hub + leaderboard)
- [ ] Add bucket `sitemap-one-percent-club.xml` (stock pages only — not empty)
- [ ] Exclude `/1-percent-club/holder/*` with &lt;2 stocks or use noindex
- [ ] `lastmod` = quarter end date or pipeline run date
- [ ] **Do not** dump 130k overlap URLs with this launch

### Internal linking
- [ ] Homepage hero + feature cards (MFs + super investors)
- [ ] Footer: Super Investors + 1% Club links
- [ ] Header: add “Super Investors” (1% Club in footer or sub-nav)
- [ ] MF stock signal pages → “Super investors also hold this (N)”
- [ ] Super investor stock row → 1% Club + MF signal
- [ ] Methodology page section: SHP/SAST data model + disclaimers
- [ ] Search index (`search-index.json.ts`) — 30 names + 1% Club hub

### Content / E-E-A-T
- [ ] “How to read this page” box on every profile
- [ ] Methodology: promoters excluded, 1% disclosure rule, quarterly lag
- [ ] Disclaimer: not investment advice
- [ ] Data source line: NSE/BSE shareholding pattern

### Launch SEO checklist
- [ ] Rich Results Test on 3 profiles + 3 stock pages
- [ ] GSC: submit new sitemaps
- [ ] Request indexing: top 10 name queries (Dolly Khanna, Vijay Kedia, …)

**Exit criteria:** Sitemaps live; homepage promotes feature; 10 priority URLs indexed.

---

# Phase 4 — Differentiation (beat competitors)

**Goal:** Features Trendlyne/Screener don’t combine well.

### MF + Super investor overlap (unique)
- [ ] On super investor profile: “X of these stocks are in MF top buys this month”
- [ ] On 1% Club stock page: MF Smart Money count + link
- [ ] On MF stock signal page: “N tracked super investors hold ≥1%”
- [ ] Shared stock slug between MF holdings and SHP data

### Leaderboards
- [ ] `/super-investors/most-bought` — stocks with most fresh super-investor entries this quarter
- [ ] Optional column: MF also buying? (yes/no count)
- [ ] Hub teaser linking to leaderboard

### Portfolio value (₹ Cr)
- [ ] Profile header: total portfolio ₹ + QoQ % change
- [ ] Per-row holding value in table
- [ ] Document price source + “as of build date” disclaimer
- [ ] Match Trendlyne parity on value display

### IPO cross-link (optional v1)
- [ ] If stock has recent IPO page on site → link from 1% Club / profile holding row

**Exit criteria:** Overlap blocks visible on ≥3 page types; leaderboard indexable.

---

# Phase 5 — Freshness (SAST between quarters)

**Goal:** Show moves before next SHP — without confusing users.

### Pipeline
- [ ] `pipeline:sast-sweep` — weekly, staging first
- [ ] Write `sast_filings` table
- [ ] Flag preliminary positions vs confirmed SHP

### UI
- [ ] Profile badge: “SAST: increased stake in X (date)” — labeled **preliminary**
- [ ] 1% Club stock page: “Recent SAST activity” section
- [ ] SHP quarter data always labeled **confirmed**

### Ops
- [ ] GitHub Actions: weekly SAST cron (staging → prod after validation)
- [ ] Quarterly SHP workflow (manual or cron post Phase 6)

**Exit criteria:** SAST appears on profiles; users can distinguish preliminary vs quarterly.

---

# Phase 6 — Staging QA & production launch

**Goal:** Safe prod deploy without breaking MF/IPO site.

### Staging QA
- [ ] Full `npm run build` on staging DB — record build time + page count
- [ ] Spot-check 5 profiles: holdings match exchange filing PDF
- [ ] Spot-check 10 stock pages: holder count vs source
- [ ] Name search: 10 queries (curated + mystery names)
- [ ] Stock search: 10 tickers
- [ ] Mobile UX pass (375px width)
- [ ] Lighthouse on hub + 1 profile
- [ ] No `FinancialProduct` / Review schema issues on new pages
- [ ] `npm run check` + CI green

### Production
- [ ] Apply 005/006 migrations on **prod** Neon (additive only)
- [ ] `db:seed-superinvestors` on prod
- [ ] Run `pipeline:superinvestor` + `db:compute-si` on prod (or restore staging dump)
- [ ] Merge `feature/super-investors-v1` → `main`
- [ ] Deploy via existing GitHub Actions
- [ ] Verify live: 3 profiles + 3 stock pages + sitemaps
- [ ] GSC validate + request indexing

**Exit criteria:** Live on ipofins.com; staging and prod row counts documented.

---

# Phase 7 — Post-launch (v1.5+)

**Deferred — track separately after v1 metrics.**

### Product
- [ ] Expand roster 30 → 50 based on 1% Club discovery + search logs
- [ ] Site-wide search: investor names in header overlay
- [ ] 8-quarter % history expand per holding row (Trendlyne parity)
- [ ] Bulk/block deals tab on profiles
- [ ] Conviction score + entity overlap pages
- [ ] Sector filter on 1% Club hub

### SEO
- [ ] Blog/learn articles: “How to track Dolly Khanna portfolio”
- [ ] Monitor GSC: discovered/not indexed for 1% Club URLs
- [ ] Prune or noindex thin holder pages

### Ops
- [ ] `/health` dashboard from `pipeline_runs`
- [ ] Quarterly GitHub Actions fully automated
- [ ] Alert if quality gate fails

### Out of scope (PMS / AIF)
- [ ] Revisit PMS & alternative funds only after SI + 1% Club metrics prove traction

---

# 30 Super investors — roster tracker

Expand from current 15 (in `my-future-feature` JSON) to 30. Mark when bio + aliases approved.

| # | Name | Slug | In JSON | Aliases verified | SEO priority |
|---|------|------|---------|------------------|--------------|
| 1 | Dolly Khanna | dolly-khanna | [ ] | [ ] | High |
| 2 | Vijay Kedia | vijay-kedia | [ ] | [ ] | High |
| 3 | Ashish Kacholia | ashish-kacholia | [ ] | [ ] | High |
| 4 | Radhakishan Damani | radhakishan-damani | [ ] | [ ] | High |
| 5 | Sunil Singhania | sunil-singhania | [ ] | [ ] | High |
| 6 | Mohnish Pabrai | mohnish-pabrai | [ ] | [ ] | High |
| 7 | Mukul Agrawal | mukul-agrawal | [ ] | [ ] | High |
| 8 | Madhusudan Kela | madhusudan-kela | [ ] | [ ] | Medium |
| 9 | Rakesh Jhunjhunwala (estate) | rakesh-jhunjhunwala | [ ] | [ ] | High |
| 10 | Porinju Veliyath | porinju-veliyath | [ ] | [ ] | Medium |
| 11 | Anil Kumar Goel | anil-kumar-goel | [ ] | [ ] | Medium |
| 12 | Ashish Dhawan | ashish-dhawan | [ ] | [ ] | Medium |
| 13 | Shankar Sharma | shankar-sharma | [ ] | [ ] | Medium |
| 14 | Dheeraj Gupta | — | [ ] | [ ] | TBD |
| 15 | Girish Gulati | — | [ ] | [ ] | TBD |
| 16–30 | *To be finalized* | — | [ ] | [ ] | — |

> **Action:** Complete rows 14–30 with team before Phase 0 content sign-off. Reference Trendlyne individual list for search-volume names.

---

# Competitor scorecard (target by end of Phase 4)

| Capability | Trendlyne | Screener | IPOFins target |
|------------|-----------|----------|----------------|
| Curated investor profiles | 60+ | — | 30 (quality) |
| ₹ portfolio value | Yes | Partial | Yes |
| QoQ change pills | Yes | Yes | Yes |
| 8q % history per row | Yes | Yes | v1.5 |
| Reverse name search | Yes | Yes | Yes (1% Club hub) |
| Stock ≥1% page | Via company | Yes | Yes (dedicated URL) |
| MF + SI combined | No | No | **Yes** |
| Mobile card hub | Weak | OK | **Strong** |
| Free, no login | Partial | Partial | **Yes** |
| Bulk/block deals | Yes | Yes | v1.5 |
| Alerts/follow | Yes | Premium | No |

---

# Risk register

| Risk | Mitigation |
|------|------------|
| NSE scrape breaks | Overrides folder + quality gate + last-known-good |
| 1% Club generates 3k+ pages | Only build paths with data; noindex empty |
| Build time explosion | Batch Neon queries; cache per quarter |
| Wrong name merge | Conservative resolver + manual alias list |
| Prod DB accident | Staging-only pipelines until Phase 6 |
| Thin SEO pages | Unique holder table per URL minimum |

---

# Suggested issue labels (GitHub)

`si-phase-0` … `si-phase-7` · `si-db` · `si-pipeline` · `si-ui` · `si-seo` · `si-qa`

---

*Update checkboxes in this file as work completes. Single source of truth for Super Investors v1.*
