# Add a new IPO

1. Sync broker data: `npm run pipeline:ipo` (staging).
2. Verify IPO appears in DB / export JSON paths under `public/data/`.
3. Add or extend Astro route under `src/pages/` (reuse IPO components).
4. SEO + JSON-LD; run `npm run check` and site build if user requests.
