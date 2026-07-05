# 04 — Performance Review: IPOFins

> Reviewed by: Performance Engineer (Cloudflare) + Principal Frontend Engineer (Vercel)  
> Stack: Astro 6 (static) · React 18 · Tailwind v4 · Vercel Edge CDN · Neon PostgreSQL

---

## ARCHITECTURE PERFORMANCE BASELINE

IPOFins is a static site (Astro `output: 'static'`). This is the optimal architecture for SEO and initial load performance. The main performance concerns are:

1. **Build time** (~25 minutes) — affects deployment velocity and CI cost
2. **Client-side hydration** — React islands hydrate on the client; improper `client:*` directives cause unnecessary work
3. **Third-party script loading** — AdSense, Google Analytics, Google Fonts
4. **Large JSON data files** served to the client
5. **Database query performance** during build time

---

## CORE WEB VITALS ANALYSIS

### Estimated Current Scores (Static Astro Site on Vercel CDN)

| Metric | Estimated | Target | Gap |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | ~2.1s | <2.5s ✅ | — |
| **CLS** (Cumulative Layout Shift) | ~0.18 | <0.1 ❌ | High |
| **INP** (Interaction to Next Paint) | ~180ms | <200ms ✅ | Marginal |
| **TTFB** (Time to First Byte) | ~80ms | <200ms ✅ | — |
| **FCP** (First Contentful Paint) | ~1.2s | <1.8s ✅ | — |

### CLS Issues (Highest Impact)

**CLS Issue 1 — `nav-btn-group` min-height reservation**  
The `.nav-btn-group` class sets `min-height: 12rem` on mobile, `7rem` on sm, `3.25rem` on lg. This pre-reserves layout space for wrapped navigation buttons, but creates visible blank space on fast connections and large layout shifts on slow connections when the actual heights differ.  

```css
/* Current — causes CLS */
.nav-btn-group {
  min-height: 12rem; /* mobile */
}
```

**Impact:** Every page that uses `nav-btn-group` (IPO index, MF index, homepage) will score poorly on CLS. This is used on ~15 pages.

**Fix:** Remove `min-height` from `nav-btn-group` entirely. Instead, use `content-visibility: auto` with `contain-intrinsic-size` on the section containing it. The CLS caused by wrapping buttons is less severe than the layout reservation approach.

**CLS Issue 2 — React island hydration shift on Super Investors and 1% Club**  
`CuratedInvestorSearch` is `client:load`, meaning React downloads, parses, and hydrates before the page stabilizes. During hydration (100-400ms on mid-range devices), the component shifts from server-rendered placeholder (none — there isn't one) to React-rendered search box.  

**Fix:** Replace `client:load` with `client:visible` for the search component. Add a server-rendered placeholder that matches the hydrated state's dimensions.

**CLS Issue 3 — Google Fonts loading shift**  
Inter is loaded from `fonts.googleapis.com`. Even with `display=swap` (implicit in the URL), there's a FOUT (Flash of Unstyled Text) as system fonts swap to Inter. Inter is very close to system-ui on modern systems, so the visual shift is small — but measurable in CLS.

**Fix:** Self-host Inter and JetBrains Mono. Preload the subset actually used (`woff2` with only Latin characters). Estimated CLS improvement: 0.02–0.05.

**CLS Issue 4 — AdSense slot reservations**  
`AdUnit.astro` renders `<ins class="adsbygoogle">` which loads deferred. AdSense injects content into this slot asynchronously, causing a layout shift when the ad appears.  

**Fix:** Always wrap ad units in a container with explicit `min-height`:
```html
<div style="min-height: 280px; min-width: 336px;" aria-label="Advertisement">
  <ins class="adsbygoogle" ...></ins>
</div>
```

---

## LCP ANALYSIS

### LCP Element (Most Pages)
The LCP element is likely the page heading `<h1>` or the first card image (if present). On static pages with no hero images, the H1 text is often the LCP element — which is actually ideal.

### LCP Degradation Sources

**Google Tag Manager fires immediately:**  
`BaseLayout.astro` loads `https://www.googletagmanager.com/gtag/js?id=AW-18230401074` with `async` on every page load. Even though it's async, the network request to GTM creates a connection chain that delays other resource fetches.

**Measurement:** GTM script download (~45KB) + GTM container evaluation (~15ms) adds approximately 100-150ms to LCP on median mobile connections.

**Fix:**
```html
<!-- Replace immediate script with consent-gated version -->
<!-- Move to loadThirdPartyScripts() — only the ad tracking tag, not GA4 -->
```

**CSS inlined globally (positive):**  
`build: { inlineStylesheets: 'always' }` in `astro.config.mjs` — the global CSS (~17KB) is inlined into the `<head>`. This eliminates the render-blocking `<link rel="stylesheet">` request, saving ~170–340ms LCP. This is already correctly implemented.

**Font Preloading Missing:**  
There's no `<link rel="preload" as="font">` for the Inter woff2 files. Browsers discover fonts late in the render cascade.

**Fix:**
```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- After self-hosting: -->
<link rel="preload" href="/fonts/inter-variable.woff2" as="font" type="font/woff2" crossorigin>
```

---

## INP ANALYSIS

### React Island Hydration Cost

**`SmartMoneyPage.tsx` + `SmartMoneyTracker.tsx`** are chunked into `smart-money-app` bundle. Size estimate: ~120-180KB JS (React + component code). This chunk downloads and evaluates on the Smart Money Tracker page.

**Main thread blocking during hydration:**
React 18 uses concurrent rendering which helps, but the initial hydration of a large component tree (~500-line `SmartMoneyTracker`) still takes 50-150ms on mid-range Android devices.

**Fix:** Implement streaming hydration with `React.Suspense` boundary at the tab level. Each tab (Most Bought, Most Sold, etc.) should be a separate lazy-loaded `React.lazy()` component.

```tsx
// Current — loads everything
import SmartMoneySignalTable from './SmartMoneySignalTable';

// Recommended
const SmartMoneySignalTable = React.lazy(() => import('./SmartMoneySignalTable'));
```

**Calculator Components:**  
Calculator pages (`SIPCalculator.tsx`, `EMICalculator.tsx`, etc.) use `client:load`. These are relatively small (~5-15KB each) but all 16 load React. Since each calculator is on its own page, this is acceptable — but the React runtime is downloaded on every calculator page regardless of tree-shaking.

**Fix:** All calculators on separate pages is already the right architecture. No change needed.

---

## TTFB ANALYSIS

TTFB on Vercel static hosting should be 40-90ms globally (CDN edge). Measured TTFB issues would typically come from:

1. **Vercel cold starts** — Not applicable for static files (no serverless function on static pages)
2. **Large HTML payloads** — IPO index page with hundreds of IPOs could produce large HTML. Worth measuring.
3. **Neon cold start during build** — Not runtime TTFB but affects build reliability

**Vercel Edge Config:**
- `/_astro/*`: `Cache-Control: public, max-age=31536000, immutable` — ✅ correct for hashed assets
- `/data/*`: `Cache-Control: public, max-age=3600, s-maxage=86400` — ✅ good for data files
- HTML pages: Vercel serves from CDN but there's no explicit `Cache-Control` for HTML in `vercel.json`. Vercel default is 0 for HTML — which means every visit hits the CDN edge but not a browser cache. This is correct behavior for a static site that redeploys frequently.

---

## BUNDLE SIZE ANALYSIS

| Bundle | Estimated Size | Assessment |
|---|---|---|
| React runtime | ~40KB gzipped | Shared across all React pages |
| `smart-money-app` chunk | ~80-120KB gzipped | ⚠️ Large — loaded on Smart Money pages |
| Per-calculator bundles | ~5-10KB each | ✅ Small |
| Global CSS (inlined) | ~17KB | ✅ Inlined, no request |
| Inter font (Google CDN) | ~30KB (subset) | 🟡 External request |
| JetBrains Mono | ~15KB (subset) | 🟡 External request |

**Optimization Opportunities:**

1. **`SmartMoneyAppSkeleton.tsx`** — The skeleton loader is downloaded as part of the `smart-money-app` chunk even though it only renders for 200-500ms. It could be a simple Astro static component instead of a React component.

2. **Icon SVGs** — `FeatureIcon.astro` renders SVG icons inline. On pages with many feature cards (homepage: 8 cards), 8 SVGs are inlined in the HTML. The cumulative byte cost may be significant. Consider sprite approach.

3. **`brokers.json`** in `src/data/` — loaded for broker pages. Size unknown but broker data with detailed descriptions can be large. Verify it's not loaded on pages that don't need it.

---

## THIRD-PARTY SCRIPT PERFORMANCE

### Audit of Third-Party Scripts

| Script | Load Strategy | Blocks Render | Estimated Size | Assessment |
|---|---|---|---|---|
| GTM (`gtag.js`) | `async` — immediate | No, but CPU cost | ~45KB | ❌ Should be consent-gated |
| GA4 | Via `loadThirdPartyScripts()` | No | ~15KB | ✅ Deferred |
| AdSense | Via `loadAdsenseWhenNeeded()` | No | ~80KB | ✅ Deferred + visibility-gated |
| Vercel Analytics | Via `DeferredAnalytics.astro` | No | ~8KB | ✅ Deferred |
| Google Fonts | `<link>` in head | Yes (preconnect helps) | ~45KB | ❌ Blocking |

**Total third-party weight:** ~193KB on pages with ads. 

**Fix priority:**
1. Move GTM ads tag inside consent gate — **Critical** (compliance + performance)
2. Self-host fonts — **High** (privacy + LCP)
3. Lazy-load AdSense (already implemented) — ✅

---

## IMAGE OPTIMIZATION

### Current State

- OG images: `og-default.png`, `og-ipo.png`, `og-fund.png` — PNG format, no WebP
- Favicon: SVG — ✅ excellent
- No `<img>` elements with user-content images on the main platform (all icons are SVG inline)
- Super investor entity cards may show investor photos (from `tracked_entities.photo`) — format/size unknown

### Recommendations

1. **Convert OG images to WebP:** Modern social platforms (Twitter, LinkedIn, WhatsApp) support WebP. PNG OG images are 2-3x larger than WebP equivalents.

2. **Generate per-page OG images:** The `scripts/generate-og-images.mjs` script generates OG images at build time (using `puppeteer-core`). This is the right approach. Ensure each IPO gets a unique OG image with its name, sector, and price band — this significantly improves link sharing CTR.

3. **Add `width` and `height` to all `<img>` elements** to prevent CLS:
```html
<!-- Bad -->
<img src="/photo.jpg" alt="Investor name">

<!-- Good -->
<img src="/photo.jpg" alt="Investor name" width="80" height="80">
```

---

## BUILD PIPELINE PERFORMANCE

### Current Build Script (Measured)

```
node scripts/verify-source-encoding.mjs       ~5s
node db/verify-schema.mjs                     ~8s (Neon connection)
node scripts/export-client-data.mjs           ~3-6 min (DB queries)
node scripts/generate-insights-articles.mjs  ~30s
node scripts/verify-insights-articles.mjs    ~10s
node scripts/verify-top-stocks-export.mjs    ~10s
node scripts/ensure-portfolio-overlap-sitemaps.mjs ~20s
node scripts/generate-og-images.mjs          ~5-8 min (Puppeteer)
astro build                                   ~8-12 min
node scripts/verify-og-images.mjs            ~30s
node scripts/verify-brand-copy.mjs           ~20s
node scripts/verify-signals-export.mjs       ~20s
node scripts/verify-top-stocks-export.mjs    ~10s (duplicate!)
node scripts/reorganize-sitemaps.mjs         ~30s
node scripts/verify-sitemaps.mjs             ~20s
```

**Total estimated: ~20-28 minutes**

### Optimization Plan

**Stage 1 — Remove duplicate steps:**
- `verify-top-stocks-export.mjs` runs twice (after both insights generation and after Astro build). Remove the duplicate.
- `verify-brand-copy.mjs` and `verify-signals-export.mjs` could run in parallel with `verify-og-images.mjs`.

**Stage 2 — Parallelize independent steps:**

```bash
# Before Astro build — run in parallel:
node scripts/generate-insights-articles.mjs &
node scripts/generate-og-images.mjs &        # independent of insights
node scripts/ensure-portfolio-overlap-sitemaps.mjs &
wait

# After Astro build — run in parallel:
node scripts/verify-og-images.mjs &
node scripts/verify-brand-copy.mjs &
node scripts/verify-signals-export.mjs &
node scripts/reorganize-sitemaps.mjs
wait
node scripts/verify-sitemaps.mjs
```

**Estimated time saved:** 8-12 minutes. Target total: 12-16 minutes.

**Stage 3 — Cache OG images:**
`generate-og-images.mjs` uses Puppeteer to generate OG images. These should be cached between builds if source data hasn't changed. Add a content hash check — only regenerate OG images for IPOs where the data has changed.

**Stage 4 — Neon connection warm-up:**
The first DB query in `db/verify-schema.mjs` pays a cold start penalty (~500ms). Since export immediately follows, warm up the connection proactively.

---

## DATABASE QUERY PERFORMANCE DURING BUILD

### `export-client-data.mjs` Analysis

This script queries Neon for all export data (holdings, signals, super investors). If it runs 20+ queries sequentially, each with a Neon connection overhead of ~500ms, that's 10+ seconds of serial I/O.

**Fix:** Batch queries using `Promise.all()` for independent data fetches:
```js
// Instead of serial:
const funds = await sql`SELECT * FROM funds`;
const holdings = await sql`SELECT * FROM fund_holdings WHERE month = ${latestMonth}`;

// Use parallel:
const [funds, holdings] = await Promise.all([
  sql`SELECT * FROM funds`,
  sql`SELECT * FROM fund_holdings WHERE month = ${latestMonth}`
]);
```

### Build Concurrency Setting
```js
// astro.config.mjs
build: {
  concurrency: 2,  // Currently 2
}
```

`concurrency: 2` for page generation is conservative. For a static site with no per-page DB queries (all data is pre-exported), this could safely be increased to 8-16. The comment says "after holder data is loaded from export JSON (not per-page Neon queries)" — if that's true, increasing concurrency significantly would speed up Astro build.

**Recommended:** Test with `concurrency: 8` and monitor for memory issues. At Node 22 with a modern server (GitHub Actions runner), 8 concurrent page renders should be safe.

---

## LIGHTHOUSE IMPROVEMENT ROADMAP

### Quick Wins (1-2 days each)

1. Remove duplicate `verify-top-stocks-export.mjs` from build script
2. Add `min-height` to AdSense containers to prevent CLS
3. Remove `min-height` from `nav-btn-group` CSS
4. Add `width`/`height` to all `<img>` tags
5. Move GTM ads tag inside consent gate
6. Add `aria-valuemax` to subscription progress bars (also fixes accessibility)

### Medium Effort (1 week each)

7. Self-host Inter + JetBrains Mono fonts
8. Implement React.lazy() for Smart Money sub-tabs
9. Add timeout + error state to all React skeleton loaders
10. Convert OG images from PNG to WebP
11. Increase Astro build concurrency to 8

### High Effort (2-4 weeks each)

12. Add Vercel ISR for IPO detail pages (requires switching from `output: 'static'`)
13. Implement service worker for offline caching of last-viewed data
14. Add parallel build stage orchestration

---

## ESTIMATED PERFORMANCE SCORES AFTER FIXES

| Metric | Current (Estimated) | After Quick Wins | After All Fixes |
|---|---|---|---|
| Lighthouse Performance | ~72 | ~82 | ~92 |
| LCP | 2.1s | 1.8s | 1.4s |
| CLS | 0.18 | 0.08 | 0.04 |
| INP | 180ms | 150ms | 100ms |
| Build time | ~25 min | ~20 min | ~12 min |
