# Implementation Plan: Data Accuracy and Improvements

## Overview

This plan implements data integrity improvements, removes fabricated content, upgrades the IPO data pipeline to use BSE API, adds validation/diff/staleness modules, removes the chatbot, nullifies AI placeholders, and restores the 12-hour cron schedule. Tasks are ordered by dependency: infrastructure modules first, then pipeline integration, then front-end cleanup, then CI/CD changes.

## Tasks

- [x] 1. Create validation infrastructure modules (`scripts/lib/`)
  - [x] 1.1 Create `scripts/lib/schemas.mjs` with IPO, MF, and Upcoming IPO schema definitions
    - Define `IPO_SCHEMA`, `MF_SCHEMA`, and `UPCOMING_IPO_SCHEMA` with required/optional field rules
    - Include type checks, range constraints (prices non-negative, NAV > 0, returns -100..1000), and enum values
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 16.1_

  - [x] 1.2 Create `scripts/lib/validate.mjs` with `validateBatch` and `validateRecord` functions
    - Implement pure-function validation: accepts records array + schema, returns `{ valid, rejected }` partitions
    - Validate required field presence, type checks, range checks, non-empty strings, enum values
    - Include `validateField` helper for individual field rule enforcement
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 16.1, 16.2, 16.4_

  - [ ]* 1.3 Write property tests for validation layer
    - **Property 1: Required Field Validation Partitions Correctly**
    - **Property 2: Range Validation Rejects Out-of-Bounds Values**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 16.2**

  - [x] 1.4 Create `scripts/lib/diff-detector.mjs` with `checkCountThreshold`, `protectFields`, and `preserveTimestamps`
    - `checkCountThreshold`: reject writes when new data < 50% of existing record count
    - `protectFields`: prevent overwriting populated fields with null/empty values
    - `preserveTimestamps`: keep existing `lastUpdated` for records with unchanged fields
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 2.3_

  - [ ]* 1.5 Write property tests for diff detector
    - **Property 7: Diff Count Threshold Rejection**
    - **Property 8: Field Degradation Protection**
    - **Property 4: Timestamp Preservation for Unchanged Records**
    - **Validates: Requirements 6.2, 6.3, 2.3**

  - [x] 1.6 Create `scripts/lib/staleness-monitor.mjs` with `checkStaleness` function
    - Accept records + options (`maxAgeHours`, `dataType`, optional `now` for testing)
    - Return `{ staleCount, dataType, staleRecords }` identifying records exceeding age threshold
    - IPO threshold: 24 hours; MF threshold: 48 hours
    - _Requirements: 3.1, 3.2_

  - [ ]* 1.7 Write property tests for staleness monitor
    - **Property 5: Staleness Detection Threshold**
    - **Validates: Requirements 3.1, 3.2**

  - [x] 1.8 Create `scripts/lib/webhook-notifier.mjs` with `sendAlert` function
    - Read `ALERT_WEBHOOK_URL` from environment variable
    - Format payload for Discord (embeds) or Telegram (markdown) based on URL
    - Return `false` gracefully if env var not set (no-op, log warning)
    - Include severity levels: error, warning, info
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 2. Checkpoint - Ensure all library modules are complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Integrate validation pipeline into `scripts/fetch-all-data.mjs`
  - [x] 3.1 Replace Zerodha scraping with BSE API integration
    - Replace `fetchBSEIPOs` function body: fetch from `https://api.bseindia.com/BseIndiaAPI/api/IPODetail/w`
    - Implement `parseBSEResponse` to map BSE JSON fields to IPO_Record format
    - On API failure: log error, send webhook alert via `sendAlert`, return `null` to retain existing data
    - Remove `parseZerodhaIPOs`, `extractZerodhaEntries`, `extractZerodhaUpcoming` functions
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 3.2 Write property test for BSE API parser
    - **Property 6: BSE API Response Produces Valid Records**
    - **Validates: Requirements 4.2**

  - [x] 3.3 Wire validation layer into the data write path
    - Import `validateBatch` and schemas into `fetch-all-data.mjs`
    - After BSE fetch: validate against `IPO_SCHEMA`, log rejected records, proceed with valid only
    - After AMFI fetch: validate against `MF_SCHEMA`, log rejected records, proceed with valid only
    - Validation runs between fetch and write (requirement 1.6)
    - _Requirements: 1.5, 1.6, 16.1_

  - [x] 3.4 Wire diff detector into the data write path
    - Import `checkCountThreshold`, `protectFields`, `preserveTimestamps` into `fetch-all-data.mjs`
    - Before writing `ipos.json`: run count threshold check against existing data
    - Apply field protection to prevent degradation of populated fields
    - Apply timestamp preservation for unchanged records
    - On diff rejection: log warning, send webhook alert, skip file write
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 3.5 Wire staleness monitor and webhook notifier into the pipeline
    - After all writes complete: run `checkStaleness` on IPO data (24h threshold) and MF data (48h threshold)
    - If stale records detected: call `sendAlert` with count and data type
    - On any fetch failure: call `sendAlert` with source name, error type, timestamp
    - _Requirements: 3.1, 3.2, 3.3, 7.1, 7.2_

  - [x] 3.6 Null out GMP field and sanitize AI placeholders in pipeline output
    - Set `gmp: null` for all IPO records (no reliable GMP scraper)
    - Set `aiScore: null`, `aiSummary: null`, `verdict: null` for all IPO records
    - Remove any artificial subscription multiplier generation logic
    - Set `subscription: null` when real NSE data is unavailable
    - Add `lastUpdated` ISO 8601 timestamp to every written record
    - _Requirements: 14.1, 14.3, 12.1, 9.1, 9.2, 2.1, 2.2_

  - [ ]* 3.7 Write property tests for pipeline output integrity
    - **Property 3: Timestamp Presence on Write**
    - **Property 10: AI Placeholder Nullification**
    - **Property 12: Pipeline Output Schema Compatibility**
    - **Validates: Requirements 2.1, 2.2, 12.1, 15.4**

- [x] 4. Checkpoint - Ensure pipeline integration works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Front-end cleanup: remove chatbot and conditional AI rendering
  - [x] 5.1 Remove chatbot from `BaseLayout.astro`
    - Delete the `<!-- AI Chatbot (Phase 3) -->` section: the `#ai-chatbot-root` div and associated script block
    - Remove the import of `AIChatbot.tsx` and React render code
    - _Requirements: 10.2, 10.3_

  - [x] 5.2 Delete `src/components/ai/AIChatbot.tsx`
    - Remove the file entirely from the codebase
    - _Requirements: 10.1, 10.4_

  - [x] 5.3 Add conditional rendering for AI fields in IPO templates
    - In `src/pages/ipo/[slug].astro`: wrap the AI score display and `AIInsightBox` section in `{ipo.aiScore && ...}` conditional
    - In `src/pages/ipo/index.astro`, `mainboard.astro`, `sme.astro`: already use `{ipo.aiScore && ...}` — verify no changes needed
    - In `src/components/IPOCard.astro`: verify `aiScore !== undefined` guard already present
    - _Requirements: 12.2, 12.3_

  - [x] 5.4 Add conditional rendering for GMP and subscription fields
    - In IPO templates: wrap GMP display in `{ipo.gmp !== null && ipo.gmp !== undefined && ...}` guard
    - For subscription: display "Subscription data not available" when value is `null`
    - _Requirements: 14.3, 5.3, 9.3_

  - [x] 5.5 Ensure homepage stats are fully dynamic
    - Verify `src/pages/index.astro` computes IPO count from `iposData.length` (already dynamic)
    - Import `ipo-performance.json` and `mutual-funds.json` if not already imported for total tracked counts
    - Replace any remaining hardcoded numeric stats with computed values from data imports
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 5.6 Write property test for dynamic homepage stats
    - **Property 9: Dynamic Homepage Counts Match Data**
    - **Validates: Requirements 11.1, 11.2**

- [x] 6. Handle placeholder articles
  - [x] 6.1 Filter content-less articles from build output
    - In `articles.json` processing logic (or Astro page generation): skip articles where `content` is missing, null, or empty
    - Ensure no static pages are generated for empty articles
    - Remove or hide internal links pointing to content-less articles
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ]* 6.2 Write property test for content-less article exclusion
    - **Property 11: Content-less Article Exclusion**
    - **Validates: Requirements 13.1, 13.3**

- [x] 7. CI/CD: Update GitHub Actions workflow
  - [x] 7.1 Activate 12-hour cron schedule in `update-data.yml`
    - Change cron from `30 0 * * *` to `30 0,12 * * *` (twice daily)
    - Uncomment the every-12-hours expression
    - _Requirements: 8.1, 8.2_

  - [x] 7.2 Add data fetch step before build in the workflow
    - Add a `📡 Fetch latest data` step running `node scripts/fetch-all-data.mjs`
    - Pass `ALERT_WEBHOOK_URL: ${{ secrets.ALERT_WEBHOOK_URL }}` as env variable
    - Place the fetch step after `npm ci` and before `npx astro build`
    - _Requirements: 8.3, 7.3_

- [x] 8. Final checkpoint - Verify complete implementation
  - Ensure all tests pass, ask the user if questions arise.
  - Verify `scripts/lib/` modules exist: validate.mjs, schemas.mjs, diff-detector.mjs, staleness-monitor.mjs, webhook-notifier.mjs
  - Verify BSE API replaces Zerodha scraping in fetch-all-data.mjs
  - Verify chatbot removed, AI fields conditionally rendered
  - Verify cron set to 12-hour schedule with data fetch step

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The AMFI feed parser, mfapi.in returns calculator, and SEBI scraper are intentionally NOT modified (Requirement 15)
- The `AIInsightBox.astro` component file is retained but only renders when AI fields are non-null
- GMP field is set to `null` (no scraper implemented) per the design decision

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.6", "1.8"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.3", "1.5", "1.7"] },
    { "id": 3, "tasks": ["3.1", "3.6"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 5, "tasks": ["3.5", "3.7"] },
    { "id": 6, "tasks": ["5.1", "5.2", "5.5", "6.1"] },
    { "id": 7, "tasks": ["5.3", "5.4", "5.6", "6.2"] },
    { "id": 8, "tasks": ["7.1", "7.2"] }
  ]
}
```
