---
name: build-astro-ipo-page
description: Build or extend an Astro IPO detail page with SEO, JSON-LD, and DESIGN.md tokens.
---

# Build Astro IPO page

1. Read `DESIGN.md` and reuse `IPOCard` / existing IPO components.
2. Page under `src/pages/` with `export const prerender = true`.
3. Title ≤60 chars; meta description ≤160; canonical URL.
4. Financial numbers: `font-mono`, `Intl.NumberFormat('en-IN')`, rupee U+20B9.
5. Add `FinancialProduct` JSON-LD when appropriate.
6. Run `npm run check` before finishing.
