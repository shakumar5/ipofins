# Requirements Document

## Introduction

This document specifies the data accuracy and improvement requirements for the IPOfins platform (ipofins.com). The platform is an Astro v6.4.4 static site generator (SSG) Indian finance platform using React 18, Tailwind CSS v4, deployed on Vercel with GitHub Actions CI/CD.

The scope covers three areas: (1) improving data integrity through schema validation, staleness detection, and diff-based change protection; (2) removing fabricated or placeholder content that damages user trust; and (3) upgrading the data pipeline to use reliable JSON APIs, restore the 12-hour cron schedule, and add monitoring via webhook notifications.

## Glossary

- **Data_Pipeline**: The automated system (`scripts/fetch-all-data.mjs`) that fetches, validates, and writes financial data to JSON files in `src/data/`
- **Validation_Layer**: A module that performs schema checks and range checks on fetched data before writing to JSON files
- **IPO_Record**: A JSON object representing a single IPO entry in `ipos.json` or `upcoming-ipos.json`
- **MF_Record**: A JSON object representing a single mutual fund entry in `mutual-funds.json`
- **BSE_API**: The BSE India JSON API endpoint providing live IPO data (replacing Zerodha HTML scraping)
- **AMFI_Feed**: The AMFI India daily NAV text feed at `amfiindia.com/spages/NAVAll.txt`
- **MFApi_Service**: The mfapi.in API providing historical NAV data for returns calculation
- **SEBI_Scraper**: The HTML scraper that extracts DRHP filings from SEBI website
- **GMP_Scraper**: A scraper targeting investorgain.com for Grey Market Premium data
- **Staleness_Monitor**: A component that checks the age of data records and triggers alerts when thresholds are exceeded
- **Webhook_Notifier**: A module that sends alert messages to Discord or Telegram channels on failures or staleness events
- **Diff_Detector**: A module that compares incoming data against existing data to prevent overwriting good data with empty or degraded data
- **Cron_Scheduler**: The GitHub Actions scheduled workflow that triggers the Data_Pipeline at defined intervals
- **Chatbot_Component**: The AIChatbot.tsx React component (134KB) that provides keyword-matching responses
- **Homepage_Stats**: The hardcoded statistics displayed on the homepage (IPO count, performance percentages)
- **AI_Placeholder**: Empty or stub AI score, verdict, and summary fields in IPO records
- **Article_Record**: A JSON object representing a single article entry in `articles.json`

## Requirements

### Requirement 1: Schema Validation for Financial Data

**User Story:** As a developer, I want all financial data validated against a defined schema before being written to disk, so that malformed or out-of-range values never corrupt the data files.

#### Acceptance Criteria

1. WHEN the Data_Pipeline receives fetched IPO data, THE Validation_Layer SHALL verify each IPO_Record contains required fields (name, slug, type, status, priceRange) and reject records missing any required field.
2. WHEN the Data_Pipeline receives fetched mutual fund data, THE Validation_Layer SHALL verify each MF_Record contains required fields (name, slug, category, nav) and reject records missing any required field.
3. WHEN the Validation_Layer processes an IPO_Record, THE Validation_Layer SHALL verify that price values are non-negative numbers and lot size values are positive integers or zero.
4. WHEN the Validation_Layer processes an MF_Record, THE Validation_Layer SHALL verify that NAV is a positive number greater than zero and return percentages are between -100 and 1000.
5. IF a record fails schema validation, THEN THE Validation_Layer SHALL log the record identifier and failure reason, and exclude the record from the write batch.
6. THE Validation_Layer SHALL execute between the fetch step and the file-write step in the Data_Pipeline.

### Requirement 2: Per-Record Timestamps

**User Story:** As a developer, I want every data record to carry a `lastUpdated` timestamp, so that I can identify stale records and debug data freshness issues.

#### Acceptance Criteria

1. WHEN the Data_Pipeline writes an IPO_Record to a JSON file, THE Data_Pipeline SHALL include a `lastUpdated` field containing the ISO 8601 timestamp of the write operation.
2. WHEN the Data_Pipeline writes an MF_Record to a JSON file, THE Data_Pipeline SHALL include a `lastUpdated` field containing the ISO 8601 timestamp of the write operation.
3. WHEN a record is unchanged from the previous fetch, THE Data_Pipeline SHALL preserve the existing `lastUpdated` value without modification.

### Requirement 3: Staleness Detection and Alerting

**User Story:** As a developer, I want the system to detect when data becomes stale and alert me, so that I can investigate and fix data source issues before users see outdated information.

#### Acceptance Criteria

1. WHEN the Data_Pipeline completes a fetch cycle, THE Staleness_Monitor SHALL check the `lastUpdated` timestamp of each IPO_Record and flag records older than 24 hours as stale.
2. WHEN the Data_Pipeline completes a fetch cycle, THE Staleness_Monitor SHALL check the `lastUpdated` timestamp of each MF_Record and flag records older than 48 hours as stale.
3. WHEN the Staleness_Monitor detects one or more stale records, THE Webhook_Notifier SHALL send an alert message containing the count of stale records and their data type (IPO or MF).

### Requirement 4: BSE India JSON API Migration

**User Story:** As a developer, I want to fetch IPO data from the BSE India JSON API instead of scraping Zerodha HTML, so that data extraction is reliable and less prone to breaking on layout changes.

#### Acceptance Criteria

1. THE Data_Pipeline SHALL fetch live IPO data from the BSE India JSON API endpoint instead of scraping the Zerodha HTML page.
2. WHEN the BSE_API returns a successful response, THE Data_Pipeline SHALL parse the JSON response and produce IPO_Records with fields: name, slug, type, priceRange, lotSize, openDate, closeDate, status, and issueSize.
3. IF the BSE_API returns an error or non-200 status code, THEN THE Data_Pipeline SHALL log the error, send a webhook alert, and retain the existing `ipos.json` data without modification.
4. THE Data_Pipeline SHALL remove the Zerodha HTML scraping function (`fetchBSEIPOs` and `parseZerodhaIPOs`) after the BSE_API integration is verified working.

### Requirement 5: NSE Subscription Data Integrity

**User Story:** As a user, I want subscription data to be accurate or clearly marked as unavailable, so that I can make informed IPO application decisions.

#### Acceptance Criteria

1. THE Data_Pipeline SHALL fetch real category-wise subscription data from NSE when available, using the existing Puppeteer-based approach.
2. IF the NSE subscription fetch fails or returns no data for an IPO, THEN THE Data_Pipeline SHALL set the subscription field to `null` (not a fabricated multiplier value).
3. WHEN an IPO_Record has a null subscription field, THE rendering layer SHALL display "Data not available" instead of a numeric subscription value.
4. THE Data_Pipeline SHALL remove any logic that generates or multiplies subscription values artificially.

### Requirement 6: Diff-Based Change Detection

**User Story:** As a developer, I want the pipeline to detect when incoming data is worse than existing data, so that a failed or partial scrape does not overwrite good data with empty values.

#### Acceptance Criteria

1. WHEN the Data_Pipeline prepares to write new data to a JSON file, THE Diff_Detector SHALL compare the record count of new data against existing data.
2. IF the new data contains fewer records than 50% of the existing record count for the same file, THEN THE Diff_Detector SHALL reject the write, log a warning, and send a webhook alert.
3. WHEN comparing individual records, THE Diff_Detector SHALL reject updates where previously populated fields (non-null, non-empty) would be overwritten with null or empty values.
4. WHEN the Diff_Detector rejects a write operation, THE Data_Pipeline SHALL retain the existing JSON file contents unchanged.

### Requirement 7: Error Logging and Webhook Notifications

**User Story:** As a developer, I want automated alerts when the data pipeline encounters failures, so that I can respond to issues without manually checking logs.

#### Acceptance Criteria

1. WHEN a fetch operation fails (network error, non-200 status, timeout), THE Data_Pipeline SHALL log the error with timestamp, source name, and error message to the console output.
2. WHEN any fetch source fails, THE Webhook_Notifier SHALL send a notification containing the source name, error type, and timestamp to a configured Discord or Telegram webhook URL.
3. THE Webhook_Notifier SHALL read the webhook URL from an environment variable named `ALERT_WEBHOOK_URL`.
4. IF the `ALERT_WEBHOOK_URL` environment variable is not set, THEN THE Webhook_Notifier SHALL log a warning and skip notification delivery without halting the pipeline.

### Requirement 8: 12-Hour Cron Schedule

**User Story:** As a developer, I want the data pipeline to run every 12 hours automatically, so that the site displays reasonably fresh financial data.

#### Acceptance Criteria

1. THE Cron_Scheduler SHALL trigger the Data_Pipeline at 00:30 UTC and 12:30 UTC (06:00 IST and 18:00 IST) daily.
2. THE Cron_Scheduler SHALL uncomment and activate the existing 12-hour cron expression (`30 0,12 * * *`) in the GitHub Actions workflow file.
3. WHEN the cron triggers, THE Cron_Scheduler SHALL execute the full data pipeline including IPO fetch, mutual fund fetch, and returns calculation.

### Requirement 9: Remove Fabricated Subscription Multipliers

**User Story:** As a user, I want to trust that all displayed subscription data is sourced from real exchange data, so that I can rely on the platform for financial decisions.

#### Acceptance Criteria

1. THE Data_Pipeline SHALL remove any code that generates artificial subscription multiplier values for IPO_Records.
2. WHEN real subscription data is unavailable from NSE, THE Data_Pipeline SHALL store `null` in the subscription field of the IPO_Record.
3. WHEN the subscription field is `null`, THE front-end template SHALL render "Subscription data not available" text in place of a numeric value.

### Requirement 10: Remove Fake Chatbot

**User Story:** As a user, I want pages to load quickly without unnecessary JavaScript, so that my browsing experience is smooth on mobile devices.

#### Acceptance Criteria

1. THE platform SHALL remove the Chatbot_Component (`src/components/ai/AIChatbot.tsx`) from the codebase.
2. THE platform SHALL remove all references to the Chatbot_Component from layout files and page templates.
3. WHEN the Chatbot_Component is removed, THE platform SHALL not load the associated 134KB React bundle on non-interactive pages.
4. THE platform SHALL not replace the Chatbot_Component with any alternative component (removal only).

### Requirement 11: Dynamic Homepage Stats

**User Story:** As a user, I want homepage statistics to reflect real data counts, so that the numbers I see are accurate and up to date.

#### Acceptance Criteria

1. THE Homepage SHALL compute IPO count by reading the total number of records in `ipos.json` and `ipo-performance.json` at build time.
2. THE Homepage SHALL compute mutual fund count by reading the total number of records in `mutual-funds.json` at build time.
3. THE Homepage SHALL display the computed counts instead of hardcoded numeric values.
4. WHEN data files are updated and the site is rebuilt, THE Homepage SHALL reflect the current record counts without manual code changes.

### Requirement 12: Remove AI Score/Verdict/Summary Placeholders

**User Story:** As a user, I want to only see AI-generated insights when real analysis has been performed, so that I am not misled by empty or placeholder content.

#### Acceptance Criteria

1. THE Data_Pipeline SHALL set `aiScore`, `aiSummary`, and `verdict` fields to `null` for all IPO_Records where real AI analysis has not been performed.
2. WHEN an IPO_Record has null `aiScore`, `aiSummary`, or `verdict` fields, THE IPO detail template SHALL not render the AI insight section.
3. THE platform SHALL remove the `AIInsightBox.astro` component rendering when all AI fields are null for the given IPO.

### Requirement 13: Remove or Fill Placeholder Articles

**User Story:** As a user, I want every article page to have real content, so that I receive value when clicking through from search results or navigation.

#### Acceptance Criteria

1. THE platform SHALL identify all Article_Records in `articles.json` that lack a `content` field or have an empty `content` field.
2. WHEN an Article_Record has no content, THE platform SHALL either populate it with substantive content (minimum 300 words) or remove the record from `articles.json`.
3. THE platform SHALL not generate static pages for Article_Records that lack content.
4. WHEN an Article_Record is removed, THE platform SHALL remove its corresponding internal links from navigation and related-article sections.

### Requirement 14: GMP Data — Real Scraper or Removal

**User Story:** As a user, I want GMP data to come from a real source or not be shown at all, so that I am not misled by empty or fabricated Grey Market Premium values.

#### Acceptance Criteria

1. THE Data_Pipeline SHALL either implement a GMP_Scraper that fetches real GMP data from investorgain.com, or remove the GMP field from all IPO_Records.
2. IF the GMP_Scraper is implemented, WHEN a successful scrape returns GMP values, THE Data_Pipeline SHALL store the GMP value as a number (in rupees) in the IPO_Record.
3. IF the GMP_Scraper is not implemented, THEN THE Data_Pipeline SHALL set the GMP field to `null` and THE front-end template SHALL not render a GMP section for that IPO.
4. IF the GMP_Scraper fails during a fetch cycle, THEN THE Data_Pipeline SHALL retain the existing GMP value unchanged and log the failure.

### Requirement 15: Retain Working Data Sources

**User Story:** As a developer, I want to keep data sources that work reliably, so that proven integrations are not accidentally disrupted during the improvement work.

#### Acceptance Criteria

1. THE Data_Pipeline SHALL retain the AMFI_Feed integration for daily mutual fund NAV data without modification to its core parsing logic.
2. THE Data_Pipeline SHALL retain the MFApi_Service integration for historical returns calculation without modification to its core calculation logic.
3. THE Data_Pipeline SHALL retain the SEBI_Scraper integration for DRHP filings without modification to its core parsing logic.
4. WHEN changes are made to the Data_Pipeline, THE modified pipeline SHALL produce output compatible with the existing JSON schema consumed by Astro page templates.

### Requirement 16: Validation Layer Architecture

**User Story:** As a developer, I want the validation layer to be a distinct module, so that validation rules can be maintained and tested independently from fetch logic.

#### Acceptance Criteria

1. THE Validation_Layer SHALL be implemented as a separate module file (not inline within `fetch-all-data.mjs`).
2. THE Validation_Layer SHALL export functions that accept a data array and a schema definition, and return an object containing valid records and rejected records with reasons.
3. WHEN the Validation_Layer rejects records, THE rejected records and reasons SHALL be included in the console log output for debugging.
4. THE Validation_Layer SHALL be importable and testable in isolation without requiring network access or file system writes.
