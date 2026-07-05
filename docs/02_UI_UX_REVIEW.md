# 02 — UI/UX Review: IPOFins

> **Status: ✅ Addressed July 5, 2026** — Critical/high items implemented; deferred items noted below.

> Benchmarked against: Stripe · Apple · Linear · Notion · Vercel · Bloomberg Terminal · TradingView · Tickertape · Screener · Trendlyne · Moneycontrol  
> Reviewed by: Senior UI/UX Designer (Apple) + Principal Frontend Engineer (Vercel)

### Implementation summary

| Area | Status |
|------|--------|
| IPO detail (score rename, sticky CTA, price band, subscription total/freshness) | ✅ |
| Calculators (validation, share, shake on error) | ✅ |
| Dashboard localStorage MVP | ✅ |
| Smart Money (view counts, 10s timeout, sticky col, error retry) | ✅ |
| MF hub (friendly category names, compact highlights, tied ranks) | ✅ |
| IPO hub (empty live state, FAQ show-all) | ✅ |
| Search overlay (aria-modal + focus trap) | ✅ Already in `SearchOverlay.astro` |
| Design system (btn-primary blue, font-mono prices, stale amber) | ✅ |
| **Deferred** | Chart library on calcs; dark-mode OG images; 1% Club server-side search pagination |

---

## DESIGN SYSTEM OVERVIEW

The IPOFins design system is defined in:
- `src/styles/global.css` — Tailwind v4 theme + custom component classes
- `DESIGN.md` — documented design conventions
- Color palette: `primary-*` (blue), `surface-*` (slate), `success-*`, `danger-*`, `warning-*`
- Typography: Inter (UI) + JetBrains Mono (numbers/prices)

The intent is "Apple premium surfaces + Stripe data clarity + Linear simplicity + TradingView finance density." The aspiration is correct. The execution has inconsistencies.

---

## PAGE-BY-PAGE REVIEW

---

### PAGE 1: Homepage (`/`)

**Overall: 7/10**

#### UI Analysis

| Element | Assessment | Issue |
|---|---|---|
| Hero headline | ✅ Clear, direct | — |
| Stat bento grid | ✅ Good visual weight | Number alignment inconsistent (some left, some center) |
| CTA buttons | 🟡 | "Smart Money Tracker" and "Browse IPOs" look identical in hierarchy — one should dominate |
| Feature cards | 🟡 | 8 cards in a 3-column grid creates bottom row of 2 cards, leaving visual gap |
| Quick links | ✅ Pill design is clean | — |
| Trust strip | ✅ Excellent positioning | — |
| Live IPO strip | ✅ Strong signal | Subscription data may be stale — no per-pill freshness indicator |

#### UX Analysis

**Severity: High**  
**Issue:** Hero section has two primary CTAs with equal visual weight ("Smart Money Tracker" and "Browse IPOs"). Users are forced to choose without understanding which is more appropriate for them. This is the classic "two primary buttons" anti-pattern.  
**Fix:** Make "Smart Money Tracker" the dominant blue-filled primary CTA. Downgrade "Browse IPOs" to an outlined secondary. On mobile, stack them vertically with primary on top.

**Severity: Medium**  
**Issue:** The stat bento grid shows "0 Live Now" when no IPOs are live. A "0" value looks broken rather than intentional.  
**Fix:** When `liveIPOs.length === 0`, replace the "Live Now" stat card with "Next IPO: [date]" or hide it entirely and replace with "Upcoming: X IPOs."

**Severity: Medium**  
**Issue:** The "Popular Tools" section shows 6 tools in a 3-column grid with a "View all 16 tools" link. But the tools shown are not the most visited — they're hardcoded (`featuredToolSlugs`). If SIP Calculator is the #1 traffic driver, it should be first.  
**Fix:** Order featured tools by actual usage data. Add a micro-metric "Used by 10K+ investors" on the SIP Calculator card to add social proof.

**Severity: Low**  
**Issue:** The FAQ section at the bottom uses static `<div class="card-compact">` cards. These are not expandable — they show full text. 4 FAQ cards = decent for homepage, but the FAQ markup uses `<h3>` which is fine but the answers are truncated in a way that's not indicated to the user.  
**Fix:** Convert to proper `<details>`/`<summary>` accordion or add a "Read more" expansion. Add `FAQPage` schema (already present in jsonLd but worth verifying renders).

#### Visual Hierarchy
- H1 → Feature cards → Live IPOs → Tools → FAQ: **good top-down flow**
- The "IPO Hub" quick links section (just navigation buttons) breaks the content flow with no context about what it is
- **Fix:** Add a one-line description above "IPO Hub" like "Quick access to all IPO data →" or remove the section heading entirely

#### Responsiveness

**Mobile (375px):**  
- ✅ Stacks well
- 🟡 Stat bento grid (2-col) puts 6 numbers in a compact grid — the large font (`text-[1.75rem]`) clips on older Android devices
- 🟡 Hero headline "Track what funds and super investors buy" wraps to 4 lines at 320px — needs `font-size: clamp()` 

**Tablet (768px):**  
- ✅ Generally good
- 🟡 Feature cards switch from 1-col to 2-col at `sm:` — the 3-col layout only activates at `lg:`. At 768px, 2-column feature cards look awkward with the icon and text wrapping

**Desktop (1440px):**  
- ✅ `max-w-[80rem]` container-wide prevents overstretching
- 🟡 The hero grid `1.1fr 0.9fr` ratio makes the stat bento awkwardly short — stat cards could be taller here

---

### PAGE 2: IPO Hub (`/ipo`)

**Overall: 7.5/10**

#### UI Analysis
- `IPOLayout` wraps with tab navigation (All, Mainboard, SME, Upcoming, Performance) — ✅ clean tab pattern
- `IPOStatusSections` groups IPOs by status (Live, Upcoming, Listed) — ✅ excellent grouping
- AdUnit between sections — 🟡 disrupts content flow when user is scanning a list

#### UX Analysis

**Severity: High**  
**Issue:** When subscription status is shown inline on IPO cards (e.g., "73.2x subscribed"), this number is from the last pipeline run — potentially 12+ hours stale during a live IPO window. There is no per-IPO data freshness indicator. Users make financial decisions based on this number.  
**Fix:** Show "as of [time]" next to every subscription figure. For live IPOs, show a pulsing amber dot if data is >4 hours old.

**Severity: High**  
**Issue:** The FAQ content (13 FAQs) at the bottom of the IPO index page is extremely verbose. At mobile, users must scroll past a wall of text to see it's an FAQ. The first FAQ is "open" by default (using `open` attribute on `ContentGuideFaqItem`) and renders full text immediately.  
**Fix:** All FAQs should be collapsed by default on mobile. Show only the question, expand on tap. Limit to 5 FAQs visible, with "Show all 13" toggle.

**Severity: Medium**  
**Issue:** "Related on IPOFins" section uses the `nav-btn-group` class which reserves `min-height: 12rem` on mobile. This creates 192px of blank-looking space before the buttons load. On slow connections, this looks like a layout bug.  
**Fix:** Set `min-height` only when the buttons are confirmed to wrap (use a ResizeObserver or remove the min-height entirely — the CLS fix it provides is marginal).

#### Empty States
- When no live IPOs exist: the "Live IPOs" tab shows an empty section with no message. **Fix:** Add "No live IPOs right now. Check upcoming →" with a link.
- When all IPOs are listed: "Listed IPOs" tab shows all — no pagination or "Show more." At scale with 500+ IPOs, this becomes a performance issue.

---

### PAGE 3: IPO Detail (`/ipo/{slug}`)

**Overall: 6/10** — This is the most important page for conversion (user applies for IPO) and it has the most issues.

**Severity: Critical**  
**Issue:** The `AIInsightBox.astro` component displays an "AI Score" which is a deterministic weighted formula (5 inputs). The "AI" branding is misleading and creates regulatory risk. In the SEBI/India context, implying AI-driven investment recommendations on a financial platform without registration is a compliance red flag.  
**Fix:** Rename to "IPOFins Score" throughout. Change the component name to `IPOScoreBox`. Update the scoring methodology link. The score itself is good — the name is the problem.

**Severity: High**  
**Issue:** There is no above-the-fold "Apply Now" CTA on the IPO detail page. Users land on this page specifically to apply — they should see an Apply button within the first viewport.  
**Fix:** Add a sticky CTA bar at the top (below the header) for live IPOs: `[IPO Name] is live · ₹X–₹Y · Close date · [Apply Now →]`

**Severity: High**  
**Issue:** The risk score and verdict ("Apply / Avoid / Neutral") appears but the exact threshold logic is not communicated to users. A user sees "Avoid" with no explanation of what score triggered it.  
**Fix:** Show the score breakdown: "Score 4.8/10 — Risk: High (−1), QIB: Low (−0.5), Sector headwind (−0.5)." Make it transparent.

**Severity: Medium**  
**Issue:** Price range is displayed as plain text (e.g., "₹375 – ₹395"). There is no visual price band representation (a slider or range bar) that would be instantly scannable.  
**Fix:** Add a simple horizontal bar showing floor/cap/GMP (if available) as a visual price band component.

**Severity: Medium**  
**Issue:** The subscription bars (`IpoSubscriptionBars.astro`) show Retail/NII/QIB bars but there's no total subscription number prominently displayed. Users have to sum it mentally.  
**Fix:** Add a large "Total: X.Xx subscribed" headline above the three bars.

---

### PAGE 4: Mutual Funds Hub (`/mutual-funds`)

**Overall: 7/10**

**Severity: High**  
**Issue:** The "Browse by Category" grid shows 18–20 category cards in a 6-column grid on desktop. Category names like "Equity Scheme - Large Cap" are long and overflow/truncate. The category names are AMFI-canonical names, not user-friendly names.  
**Fix:** Map AMFI canonical categories to human-friendly names: "Equity Scheme - Large Cap" → "Large Cap Funds." Build a `CATEGORY_DISPLAY_NAMES` map in `fund-category-slug.ts`.

**Severity: High**  
**Issue:** "Top Funds by 3Y Returns" shows 5 funds as a preview, but the rank number (1-5) is hardcoded via `i+1`. It does not account for tied 3Y returns or stale data. Rank numbers on financial data tables create false precision.  
**Fix:** Sort correctly, handle ties with same rank, and add a "Data from AMFI as of [month]" note.

**Severity: Medium**  
**Issue:** The MF index page has three highlight cards stacked vertically (Holdings Changes, Smart Money Tracker, Sector Intelligence) before the category grid. On mobile this requires 3+ scrolls before reaching the actual content.  
**Fix:** Merge these into a horizontal tab strip or a compact 2-column card row. Keep the page above-the-fold focused on what users came for.

---

### PAGE 5: Smart Money Tracker (`/mutual-funds/smart-money`)

**Overall: 8/10** — The strongest page on the platform.

**Severity: Medium**  
**Issue:** The React island (`SmartMoneyPage.tsx`) loads with a skeleton loader (`SmartMoneyAppSkeleton`) but there is no timeout — if the JSON fetch hangs (network issue, Vercel edge cache miss), the skeleton spins indefinitely with no error state.  
**Fix:** Add a 10-second fetch timeout with a fallback message: "Data is temporarily unavailable. Try refreshing." with a retry button.

**Severity: Medium**  
**Issue:** The filter tabs (Most Bought, Most Sold, Fresh Entries, Complete Exits) are very useful but there's no indicator of how many records are in each tab without clicking. Users don't know if "Fresh Entries" has 3 stocks or 300.  
**Fix:** Add a count badge on each tab: "Most Bought (127)" "Fresh Entries (43)."

**Severity: Low**  
**Issue:** On mobile, the Smart Money table has many columns (Fund Count, Value, Change, Score) that overflow. The horizontal scroll works but there's no freeze-left-column behavior — users lose the stock name context when scrolling right.  
**Fix:** Make the first column (Stock Name) `position: sticky; left: 0;` in the table CSS.

---

### PAGE 6: Super Investors (`/super-investors`)

**Overall: 7.5/10**

**Severity: High**  
**Issue:** The entity grid shows 3 columns of investor cards, each with the same level of visual prominence. There is no visual differentiation between a "Legendary" tier investor (Rakesh Jhunjhunwala) and an "Emerging" tier one. The `tier` field exists in the schema but the card doesn't use it visually.  
**Fix:** Add tier indicators: a gold star for "legendary," a purple badge for "active," a teal badge for "emerging." This creates hierarchy and guides users to the highest-conviction investors first.

**Severity: High**  
**Issue:** The `CuratedInvestorSearch` React component loads `client:load` — meaning it blocks the page's initial paint waiting for React hydration. This component is a search box that most users don't interact with on first visit.  
**Fix:** Change to `client:idle` or `client:visible`. The static entity cards below should render immediately without waiting for React.

**Severity: Medium**  
**Issue:** The snapshot strip (`SnapshotStrip`) shows aggregate numbers (X investors, Y stocks tracked) but doesn't show the latest quarter. Users don't know if the data is Q1 2026 or Q4 2025.  
**Fix:** Add "Latest quarter: Q1 2026 (filed by Apr 21, 2026)" to the snapshot strip.

---

### PAGE 7: 1% Club (`/1-percent-club`)

**Overall: 6/10**

**Severity: Critical**  
**Issue:** The "1% Club" name is used without explanation on the hub page. The first visible content doesn't explain what "1% Club" means in this context. A new user seeing "1% Club" immediately thinks of elite earners (the popular definition), not "shareholders holding ≥1% stake."  
**Fix:** Add a 2-sentence explanation at the top: "Every investor holding 1% or more of a listed Indian company must disclose it via the NSE/BSE Shareholding Pattern. IPOFins tracks all such holders — institutional, super investors, and uncurated mystery holders."

**Severity: High**  
**Issue:** The holder search across 1,700+ stocks with potentially thousands of holder names creates a very large search index. The `getOnePercentSearchIndex()` load may cause noticeable TTFB if the index JSON is large.  
**Fix:** Implement paginated/debounced search with server-side filtering rather than loading the full index client-side.

---

### PAGE 8: Tools Hub (`/tools`)

**Overall: 8/10** — Best UX on the platform relative to its purpose.

**Severity: Medium**  
**Issue:** 16 tools are displayed in a grid but there's no categorization. Users who want a tax tool have to scan all 16. The tools include calculators, simulators, and planners — all mixed together.  
**Fix:** Group tools: "Investment Calculators" (SIP, Lumpsum, SWP, CAGR), "Loan & Savings" (EMI, FD, PPF, NPS), "Tax Planning" (Tax, Tax Saving), "Goal Planning" (Retirement, Goal Planner), "IPO" (IPO Profit).

**Severity: Low**  
**Issue:** Tool cards have no "last updated" or "calculation verified as of" date. For tax calculators (e.g., TaxCalculator.tsx), tax slabs change annually. Users need confidence the numbers reflect current law.  
**Fix:** Add a small "FY 2025-26 tax slabs" label on the Tax Calculator card.

---

### PAGE 9: Calculator Pages (`/tools/sip-calculator` etc.)

**Overall: 6.5/10**

**Severity: High**  
**Issue:** No input validation. All 16 calculators accept unbounded numeric inputs. A user entering 99999999 for monthly SIP amount produces a chart with values in the quintillions with no warning. Entering negative values or text inputs produces NaN which renders as "₹NaN" in the result.  
**Fix:** Add Zod schema validation or simple `min`/`max` constraints to all calculator inputs. Show inline error messages: "Maximum SIP amount is ₹50,00,000."

**Severity: High**  
**Issue:** Calculator results have no social sharing feature. The SIP Calculator alone could generate thousands of shares if users could post their "₹5,000/month → ₹1.2 Cr in 15 years" result to WhatsApp/Twitter. This is the #1 virality mechanism for finance tools.  
**Fix:** Add a "Share this result" button that generates a pre-filled shareable URL (`?sip=5000&years=15&rate=12`) and a WhatsApp share link with formatted message.

**Severity: Medium**  
**Issue:** Charts in calculator components (presumably using basic browser rendering or a charting lib) — the code uses React state but no chart library import is visible in the component directory. If charts are ASCII/text-based, they're not as compelling as a real visual.  
**Fix:** Add lightweight charting with Recharts or Chart.js. The SIP growth curve visualization is the "aha moment" that makes a calculator tool memorable.

---

### PAGE 10: Dashboard (`/dashboard`)

**Overall: 2/10** — The biggest product gap.

**Severity: Critical**  
**Issue:** The dashboard explicitly renders "Preview only. Uses sample data." in its component. It's not functional. It's excluded from the sitemap. Yet it's linked in the header navigation for desktop users.  
**Fix (Short term):** Remove "Dashboard" from the main nav until it's functional. Replace with a "Coming Soon" landing page that captures email addresses for launch notification.  
**Fix (Long term):** Build a real no-login dashboard using `localStorage`/`sessionStorage`: watchlist (up to 10 IPOs/funds), recently viewed pages, saved calculator results. Then add optional Google Sign-In for cross-device sync.

---

## DESIGN SYSTEM ISSUES

### Typography Inconsistencies

**Issue 1 — Mixed font usage on prices:**  
`DESIGN.md` mandates `font-mono` for all prices and percentages. Audit shows several places where price values use `font-sans` (or no explicit override):
- `IPOCard.astro` — price range in regular text
- `FundCard.astro` — returns percentage
- `EntityCard.astro` — portfolio value

**Fix:** Run a global audit. Add ESLint rule: any element with content matching `₹`, `%`, or numerical patterns should have `font-mono`.

**Issue 2 — Negative sign character:**  
`DESIGN.md` mandates U+2212 (−) for negative values, not ASCII hyphen (-). Audit shows inconsistent use across components.

**Issue 3 — Section heading hierarchy:**  
Multiple pages use `<h2 class="section-title">` and `<h2 class="text-xl font-bold">` interchangeably for what are visually the same heading level. This creates inconsistent heading sizes.

### Color System Issues

**Issue 1 — Success green used for non-financial contexts:**  
The "No login required" trust badge uses `text-success-600` checkmarks (green). Correct — but elsewhere, "LIVE" status badges pulse green. Both are correct uses, but the same color signals two different things (gain/health vs status).

**Issue 2 — Warning color underused:**  
`warning-*` exists in the theme but is rarely used. Data freshness warnings, stale data indicators, and "data may be delayed" notices all currently use `surface-400` (gray). They should use `warning-500` (amber) to signal actionable caution.

**Issue 3 — `btn-primary` is black, not blue:**
`background-color: var(--color-surface-900)` — this means primary buttons are black, not the `primary-600` blue. This contradicts the `primary-*` color token purpose. The blue should be the primary action color.  
**Fix:** Change `btn-primary` background to `var(--color-primary-600)` and hover to `var(--color-primary-700)`.

### Micro-interactions Audit

| Element | Current State | Recommended |
|---|---|---|
| Card hover | `translateY(-2px)` + border color change | ✅ Good |
| Button press | `translateY(0)` on active | ✅ Good |
| Nav link active | Background fill | ✅ Good |
| Table row hover | Background tint | ✅ Good |
| Filter tab active | Background + weight change | ✅ Good |
| Skeleton loader | Shimmer animation | ✅ Good |
| Search results | Instant (no animation) | 🟡 Add subtle fade-in for results |
| Cookie banner | Slide-up on appear | ✅ Good |
| Dark mode toggle | Icon swap | 🟡 Add smooth color transition (0.2s) |
| Error states | Static red text | ❌ Add shake animation on invalid input |

### Dark Mode Assessment

Overall dark mode implementation is solid (uses `.dark` class, `@custom-variant dark`). Specific issues:

1. **Gradient backgrounds in dark mode:** The `home-hero` gradient (`linear-gradient(180deg, surface-950 0%, surface-900 100%)`) creates a very dark-on-dark background that loses visual depth. Add a subtle texture or slightly lighter gradient endpoints.

2. **Table headers in dark mode:** `background: var(--color-surface-900)` makes sticky table headers nearly invisible from table body (both very dark). Add `border-bottom: 2px solid` to differentiate.

3. **OG images are light-mode only:** When dark mode users share a link, the OG image still shows the light version. Generate dark-mode OG variants.

---

## ACCESSIBILITY AUDIT

| Issue | WCAG Level | Severity |
|---|---|---|
| `role="progressbar"` on subscription bars missing `aria-valuemax` | AA | High |
| AdUnit `<ins>` elements have no visible label | AA | High |
| Search overlay lacks `aria-modal="true"` | AA | High |
| Mobile menu button doesn't announce state ("menu open/closed") | AA | Medium |
| Color alone used to indicate positive/negative returns | AA | Medium |
| No `lang` attribute variant for Hindi content (if added) | A | Low |
| Focus trap not implemented in search overlay | AA | High |
| Cookie banner has no keyboard dismiss (Escape key) | AA | Medium |

---

## LOADING EXPERIENCE

| Page | Current Skeleton | Issue |
|---|---|---|
| Smart Money Tracker | ✅ `SmartMoneyAppSkeleton` | No timeout fallback |
| Fund Overlap Checker | ✅ `FundOverlapLoader` | No error state |
| Holdings Compare | ✅ `FundTableLoader` | No timeout fallback |
| Super Investor search | ❌ No skeleton | Component is `client:load` → layout shift |
| 1% Club search | ❌ No skeleton | Same issue |
| Calculator pages | N/A (static) | ✅ |
| IPO detail | ✅ Static | — |

---

## BENCHMARKING vs WORLD-CLASS PRODUCTS

| Benchmark | What They Do | IPOFins Gap |
|---|---|---|
| **Stripe** | Every data element has clear hierarchy, state (loading/error/success), and action | IPOFins data cells lack loading states; errors often show empty cells |
| **Apple** | Single dominant CTA per screen; negative space lets content breathe | IPOFins homepage has 3 competing CTAs above fold |
| **Linear** | Monochromatic with precise accent use; typography is the design | IPOFins over-uses `surface-*` grays without sufficient contrast hierarchy |
| **TradingView** | Dense data but with visual anchoring through color and size contrast | IPOFins tables use same font size for all columns — no visual hierarchy in data |
| **Screener** | Legendary for terse, scannable financial data with zero decoration | IPOFins adds unnecessary hover effects and animations to data tables |
| **Bloomberg Terminal** | Dark-first, data density, monospace throughout | IPOFins uses JetBrains Mono only partially — many number cells use Inter |

---

## TOP 20 QUICK WIN UI/UX IMPROVEMENTS

1. Fix `btn-primary` color to `primary-600` (blue) — takes 1 line of CSS
2. Add sticky apply CTA on IPO detail pages for live IPOs
3. Add count badges to Smart Money filter tabs
4. Add `aria-valuemax` to all `role="progressbar"` elements
5. Rename `AIInsightBox` to `IPOScoreBox` and remove AI branding
6. Add timeout + error state to all React island skeleton loaders
7. Group tools by category on `/tools` hub page
8. Add WhatsApp share on all calculator result screens
9. Make first column sticky on data tables (mobile)
10. Collapse all FAQs by default on mobile
11. Remove Dashboard from nav until functional
12. Add tier visual badges to super investor entity cards
13. Add "Total: Xx subscribed" above IPO subscription bars
14. Show "No live IPOs. Next: [date]" when live count is 0
15. Add `client:idle` to `CuratedInvestorSearch` instead of `client:load`
16. Add data freshness timestamps to every subscription figure
17. Map AMFI category names to human-friendly display names
18. Implement focus trap in search overlay
19. Add `prefers-color-scheme: dark` OG image variants
20. Add `font-mono` enforcement for ALL price/percentage elements
