# Design Document: Data Accuracy and Improvements

## Overview

This design specifies the architecture for improving data integrity, removing fabricated content, and upgrading the IPOfins data pipeline. The system introduces a validation layer, diff-based change detection, staleness monitoring, webhook notifications, BSE API integration, and removal of fake/placeholder content — all within the existing Astro SSG + Node.js ESM pipeline architecture.

## Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Cron (12hr)                     │
│                   ┌─────────────────────────┐                    │
│                   │  update-data.yml         │                    │
│                   │  cron: 30 0,12 * * *     │                    │
│                   └───────────┬─────────────┘                    │
└───────────────────────────────┼──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   scripts/fetch-all-data.mjs                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ BSE API  │  │ NSE (Pup)│  │ AMFI Feed│  │ SEBI Scraper │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │              │               │            │
│       ▼              ▼              ▼               ▼            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            scripts/lib/validate.mjs                      │    │
│  │  • Schema validation (required fields, types)            │    │
│  │  • Range validation (prices, NAV, returns)               │    │
│  │  • Returns { valid: [], rejected: [] }                   │    │
│  └────────────────────────────┬────────────────────────────┘    │
│                               │                                  │
│                               ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            scripts/lib/diff-detector.mjs                 │    │
│  │  • Count threshold check (50% minimum)                   │    │
│  │  • Field degradation protection                          │    │
│  │  • Timestamp preservation for unchanged records          │    │
│  └────────────────────────────┬────────────────────────────┘    │
│                               │                                  │
│                               ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            scripts/lib/staleness-monitor.mjs             │    │
│  │  • IPO: flag if lastUpdated > 24h                        │    │
│  │  • MF: flag if lastUpdated > 48h                         │    │
│  └────────────────────────────┬────────────────────────────┘    │
│                               │                                  │
│                               ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            scripts/lib/webhook-notifier.mjs              │    │
│  │  • Discord/Telegram via ALERT_WEBHOOK_URL env var        │    │
│  │  • Sends on: fetch failure, staleness, diff rejection    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                               │                                  │
│                               ▼                                  │
│                        src/data/*.json                            │
└─────────────────────────────────────────────────────────────────┘
```

### File/Module Structure

```
scripts/
├── fetch-all-data.mjs          (orchestrator — modified)
├── parse-amfi-excel.mjs        (unchanged)
├── parse-holdings.mjs          (unchanged)
└── lib/
    ├── validate.mjs            (NEW — schema + range validation)
    ├── diff-detector.mjs       (NEW — count threshold + field protection)
    ├── staleness-monitor.mjs   (NEW — timestamp age checks)
    ├── webhook-notifier.mjs    (NEW — alert delivery)
    └── schemas.mjs             (NEW — IPO/MF schema definitions)
```

## Components

### 1. Validation Layer (`scripts/lib/validate.mjs`)

The validation layer is a pure function module with no side effects (no network, no file I/O). It accepts data arrays and schema definitions, returning partitioned results.

```javascript
// scripts/lib/validate.mjs

/**
 * @typedef {Object} Schema
 * @property {Object.<string, FieldRule>} required - Required fields and their rules
 * @property {Object.<string, FieldRule>} [optional] - Optional fields and their rules
 */

/**
 * @typedef {Object} FieldRule
 * @property {'string'|'number'|'boolean'|'object'|'array'} type
 * @property {number} [min] - Minimum value (for numbers)
 * @property {number} [max] - Maximum value (for numbers)
 * @property {boolean} [nonEmpty] - Must be non-empty string
 * @property {string[]} [enum] - Allowed values
 */

/**
 * @typedef {Object} ValidationResult
 * @property {Object[]} valid - Records that passed validation
 * @property {Array<{record: Object, reasons: string[]}>} rejected - Records with failure reasons
 */

/**
 * Validate an array of records against a schema definition.
 * @param {Object[]} records - Data records to validate
 * @param {Schema} schema - Schema definition
 * @returns {ValidationResult}
 */
export function validateBatch(records, schema) {
  const valid = [];
  const rejected = [];

  for (const record of records) {
    const reasons = validateRecord(record, schema);
    if (reasons.length === 0) {
      valid.push(record);
    } else {
      rejected.push({ record, reasons });
    }
  }

  return { valid, rejected };
}

/**
 * Validate a single record against a schema.
 * @param {Object} record
 * @param {Schema} schema
 * @returns {string[]} Array of failure reasons (empty = valid)
 */
export function validateRecord(record, schema) {
  const reasons = [];

  if (!record || typeof record !== 'object') {
    return ['Record is not an object'];
  }

  // Check required fields
  for (const [field, rule] of Object.entries(schema.required)) {
    if (record[field] === undefined || record[field] === null) {
      reasons.push(`Missing required field: ${field}`);
      continue;
    }
    const fieldReasons = validateField(record[field], field, rule);
    reasons.push(...fieldReasons);
  }

  // Check optional fields (only if present)
  if (schema.optional) {
    for (const [field, rule] of Object.entries(schema.optional)) {
      if (record[field] !== undefined && record[field] !== null) {
        const fieldReasons = validateField(record[field], field, rule);
        reasons.push(...fieldReasons);
      }
    }
  }

  return reasons;
}

function validateField(value, fieldName, rule) {
  const reasons = [];

  // Type check
  if (rule.type === 'number' && typeof value !== 'number') {
    reasons.push(`${fieldName}: expected number, got ${typeof value}`);
    return reasons;
  }
  if (rule.type === 'string' && typeof value !== 'string') {
    reasons.push(`${fieldName}: expected string, got ${typeof value}`);
    return reasons;
  }

  // Range checks for numbers
  if (rule.type === 'number' && typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      reasons.push(`${fieldName}: value ${value} below minimum ${rule.min}`);
    }
    if (rule.max !== undefined && value > rule.max) {
      reasons.push(`${fieldName}: value ${value} above maximum ${rule.max}`);
    }
    if (isNaN(value)) {
      reasons.push(`${fieldName}: value is NaN`);
    }
  }

  // Non-empty string check
  if (rule.nonEmpty && typeof value === 'string' && value.trim().length === 0) {
    reasons.push(`${fieldName}: string must not be empty`);
  }

  // Enum check
  if (rule.enum && !rule.enum.includes(value)) {
    reasons.push(`${fieldName}: value '${value}' not in allowed values [${rule.enum.join(', ')}]`);
  }

  return reasons;
}
```

### 2. Schema Definitions (`scripts/lib/schemas.mjs`)

```javascript
// scripts/lib/schemas.mjs

export const IPO_SCHEMA = {
  required: {
    name: { type: 'string', nonEmpty: true },
    slug: { type: 'string', nonEmpty: true },
    type: { type: 'string', enum: ['mainboard', 'sme'] },
    status: { type: 'string', enum: ['live', 'upcoming', 'listed', 'closed', 'drhp-filed'] },
    priceRange: { type: 'string' },
  },
  optional: {
    lotSize: { type: 'number', min: 0 },
    issueSize: { type: 'string' },
    subscription: { type: 'number', min: 0 },
    gmp: { type: 'number' },
    lastUpdated: { type: 'string' },
  },
};

export const MF_SCHEMA = {
  required: {
    name: { type: 'string', nonEmpty: true },
    slug: { type: 'string', nonEmpty: true },
    category: { type: 'string', nonEmpty: true },
    nav: { type: 'number', min: 0.01 },
  },
  optional: {
    returns1y: { type: 'number', min: -100, max: 1000 },
    returns3y: { type: 'number', min: -100, max: 1000 },
    returns5y: { type: 'number', min: -100, max: 1000 },
    rating: { type: 'number', min: 1, max: 5 },
    lastUpdated: { type: 'string' },
  },
};

export const UPCOMING_IPO_SCHEMA = {
  required: {
    name: { type: 'string', nonEmpty: true },
    slug: { type: 'string', nonEmpty: true },
    status: { type: 'string', enum: ['drhp-filed', 'upcoming'] },
  },
  optional: {
    type: { type: 'string', enum: ['mainboard', 'sme'] },
    sector: { type: 'string' },
    issueSize: { type: 'string' },
    drhpDate: { type: 'string' },
    lastUpdated: { type: 'string' },
  },
};
```

### 3. Diff Detector (`scripts/lib/diff-detector.mjs`)

```javascript
// scripts/lib/diff-detector.mjs

/**
 * @typedef {Object} DiffResult
 * @property {boolean} allowed - Whether the write should proceed
 * @property {string} [reason] - Reason for rejection
 * @property {Object[]} [mergedRecords] - Records with timestamps preserved
 */

/**
 * Check if new data should replace existing data.
 * Rejects if new data has < 50% of existing record count.
 *
 * @param {Object[]} existingData - Current records on disk
 * @param {Object[]} newData - Incoming records from fetch
 * @param {Object} options
 * @param {number} [options.minRatio=0.5] - Minimum ratio of new/existing count
 * @param {string} [options.keyField='slug'] - Field used to match records
 * @returns {DiffResult}
 */
export function checkCountThreshold(existingData, newData, options = {}) {
  const { minRatio = 0.5, keyField = 'slug' } = options;

  if (existingData.length === 0) {
    return { allowed: true, mergedRecords: newData };
  }

  const ratio = newData.length / existingData.length;

  if (ratio < minRatio) {
    return {
      allowed: false,
      reason: `New data has ${newData.length} records (${(ratio * 100).toFixed(1)}% of existing ${existingData.length}). Threshold: ${minRatio * 100}%`,
    };
  }

  return { allowed: true, mergedRecords: newData };
}

/**
 * Protect fields from degradation. If an existing record has a non-null/non-empty
 * field and the new record has null/empty for the same field, preserve the old value.
 *
 * @param {Object[]} existingData
 * @param {Object[]} newData
 * @param {string} keyField - Field to match records by
 * @returns {Object[]} Merged records with field protection applied
 */
export function protectFields(existingData, newData, keyField = 'slug') {
  const existingMap = new Map(existingData.map(r => [r[keyField], r]));

  return newData.map(newRecord => {
    const existing = existingMap.get(newRecord[keyField]);
    if (!existing) return newRecord;

    const merged = { ...newRecord };
    for (const [key, oldValue] of Object.entries(existing)) {
      if (key === keyField || key === 'lastUpdated') continue;

      const newValue = merged[key];
      const oldIsPopulated = oldValue !== null && oldValue !== undefined && oldValue !== '';
      const newIsEmpty = newValue === null || newValue === undefined || newValue === '';

      if (oldIsPopulated && newIsEmpty) {
        merged[key] = oldValue;
      }
    }

    return merged;
  });
}

/**
 * Preserve lastUpdated timestamps for records that haven't changed.
 *
 * @param {Object[]} existingData
 * @param {Object[]} newData
 * @param {string} keyField
 * @param {string[]} compareFields - Fields to compare for change detection
 * @returns {Object[]} Records with timestamps preserved when unchanged
 */
export function preserveTimestamps(existingData, newData, keyField = 'slug', compareFields = []) {
  const existingMap = new Map(existingData.map(r => [r[keyField], r]));
  const now = new Date().toISOString();

  return newData.map(newRecord => {
    const existing = existingMap.get(newRecord[keyField]);

    if (!existing) {
      return { ...newRecord, lastUpdated: now };
    }

    // Compare relevant fields to detect changes
    const fields = compareFields.length > 0
      ? compareFields
      : Object.keys(newRecord).filter(k => k !== 'lastUpdated' && k !== keyField);

    const hasChanged = fields.some(field =>
      JSON.stringify(newRecord[field]) !== JSON.stringify(existing[field])
    );

    if (hasChanged) {
      return { ...newRecord, lastUpdated: now };
    }

    return { ...newRecord, lastUpdated: existing.lastUpdated || now };
  });
}
```

### 4. Staleness Monitor (`scripts/lib/staleness-monitor.mjs`)

```javascript
// scripts/lib/staleness-monitor.mjs

/**
 * @typedef {Object} StalenessReport
 * @property {number} staleCount - Number of stale records
 * @property {string} dataType - 'IPO' or 'MF'
 * @property {string[]} staleRecords - Slugs of stale records
 */

/**
 * Check records for staleness based on their lastUpdated timestamp.
 *
 * @param {Object[]} records - Records with lastUpdated field
 * @param {Object} options
 * @param {number} options.maxAgeHours - Maximum age in hours before flagging
 * @param {string} options.dataType - 'IPO' or 'MF'
 * @param {Date} [options.now] - Current time (for testing)
 * @returns {StalenessReport}
 */
export function checkStaleness(records, options) {
  const { maxAgeHours, dataType, now = new Date() } = options;
  const threshold = maxAgeHours * 60 * 60 * 1000; // Convert to ms
  const staleRecords = [];

  for (const record of records) {
    if (!record.lastUpdated) {
      staleRecords.push(record.slug || record.name || 'unknown');
      continue;
    }

    const recordTime = new Date(record.lastUpdated).getTime();
    const age = now.getTime() - recordTime;

    if (age > threshold) {
      staleRecords.push(record.slug || record.name || 'unknown');
    }
  }

  return {
    staleCount: staleRecords.length,
    dataType,
    staleRecords,
  };
}
```

### 5. Webhook Notifier (`scripts/lib/webhook-notifier.mjs`)

```javascript
// scripts/lib/webhook-notifier.mjs

/**
 * Send alert notification via webhook (Discord or Telegram).
 * Reads URL from ALERT_WEBHOOK_URL environment variable.
 *
 * @param {Object} payload
 * @param {string} payload.title - Alert title
 * @param {string} payload.message - Alert message body
 * @param {'error'|'warning'|'info'} payload.severity - Alert level
 * @param {string} [payload.source] - Source that triggered the alert
 * @returns {Promise<boolean>} Whether the notification was sent
 */
export async function sendAlert(payload) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log(`  ⚠️ [Webhook] ALERT_WEBHOOK_URL not set. Skipping notification.`);
    return false;
  }

  const timestamp = new Date().toISOString();
  const body = formatWebhookBody(webhookUrl, { ...payload, timestamp });

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.log(`  ⚠️ [Webhook] Failed to send alert: HTTP ${response.status}`);
      return false;
    }

    console.log(`  📨 [Webhook] Alert sent: ${payload.title}`);
    return true;
  } catch (error) {
    console.log(`  ⚠️ [Webhook] Error sending alert: ${error.message}`);
    return false;
  }
}

/**
 * Format webhook body based on URL (Discord vs Telegram).
 */
function formatWebhookBody(url, payload) {
  if (url.includes('discord.com')) {
    return {
      embeds: [{
        title: `${severityEmoji(payload.severity)} ${payload.title}`,
        description: payload.message,
        color: severityColor(payload.severity),
        footer: { text: `IPOfins Pipeline • ${payload.timestamp}` },
        fields: payload.source ? [{ name: 'Source', value: payload.source, inline: true }] : [],
      }],
    };
  }

  // Default: Telegram format
  return {
    text: `${severityEmoji(payload.severity)} *${payload.title}*\n\n${payload.message}\n\n_Source: ${payload.source || 'Pipeline'} • ${payload.timestamp}_`,
    parse_mode: 'Markdown',
  };
}

function severityEmoji(severity) {
  switch (severity) {
    case 'error': return '🚨';
    case 'warning': return '⚠️';
    default: return 'ℹ️';
  }
}

function severityColor(severity) {
  switch (severity) {
    case 'error': return 0xff0000;
    case 'warning': return 0xffaa00;
    default: return 0x0099ff;
  }
}
```

### 6. BSE API Integration

The existing `fetchBSEIPOs` function (which actually fetches from Zerodha) will be replaced with a proper BSE India JSON API integration.

```javascript
// Inside scripts/fetch-all-data.mjs — BSE API fetch function

const BSE_API_URL = 'https://api.bseindia.com/BseIndiaAPI/api/IPODetail/w';

async function fetchBSEIPOs() {
  console.log('\n  📊 [BSE] Fetching IPO data from BSE API...');

  try {
    const response = await fetch(BSE_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.bseindia.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`BSE API returned ${response.status}`);
    }

    const data = await response.json();
    const records = parseBSEResponse(data);

    console.log(`    ✅ Parsed ${records.length} IPOs from BSE API`);
    return records;
  } catch (error) {
    console.log(`    ⚠️ BSE API fetch failed: ${error.message}`);
    await sendAlert({
      title: 'BSE API Fetch Failed',
      message: `Error: ${error.message}`,
      severity: 'error',
      source: 'BSE API',
    });
    return null; // Signal to retain existing data
  }
}

function parseBSEResponse(data) {
  if (!Array.isArray(data)) return [];

  return data
    .filter(item => item.Issue_Name)
    .map(item => ({
      name: item.Issue_Name.trim(),
      slug: slugify(item.Issue_Name.trim()),
      type: (parseInt(item.IssueSize || '0') > 500) ? 'mainboard' : 'sme',
      priceRange: item.BandPrice || '0',
      lotSize: parseInt(item.LotSize || '0') || 0,
      openDate: item.IssueStartDate || '',
      closeDate: item.IssueEndDate || '',
      status: 'live',
      issueSize: item.IssueSize ? `₹${item.IssueSize} Cr` : '',
      sector: 'Others',
      subscription: null,
      gmp: null,
    }));
}
```

### 7. GMP Decision: Null-Out Approach

Given the unreliability of GMP data sources (investorgain.com uses anti-scraping measures) and the risk of displaying fabricated data, the implementation will **null out** GMP fields rather than implement a scraper. This preserves data integrity while keeping the schema extensible for future GMP integration.

```javascript
// In fetch-all-data.mjs — during record processing
function sanitizeGMPField(record) {
  // GMP is unreliable — set to null unless verified source exists
  return { ...record, gmp: null };
}
```

The front-end IPO template will conditionally render the GMP section only when `gmp !== null`.

### 8. Chatbot and AI Placeholder Removal

**Files to delete:**
- `src/components/ai/AIChatbot.tsx`
- `src/components/AIInsightBox.astro` (conditional — only remove rendering when AI fields are null)

**Files to modify:**
- `src/layouts/BaseLayout.astro` — Remove the chatbot script block and `#ai-chatbot-root` div

**AI fields in IPO records:**
- `aiScore`, `aiSummary`, `verdict` → set to `null` in all records
- IPO detail template: wrap AI section in `{ipoData.aiScore && ...}` conditional

### 9. Dynamic Homepage Stats

The homepage (`src/pages/index.astro`) already imports data files and computes counts dynamically:

```javascript
// Already present in index.astro:
const liveIPOs = iposData.filter(ipo => ipo.status === 'live');
```

The stats section already uses `{iposData.length}`, `{liveIPOs.length}`, and `{toolsData.length}`. The only hardcoded stat is "12hr" for auto-refresh — this is acceptable as it describes the schedule, not data.

Additional stat to make dynamic: import `ipo-performance.json` and `mutual-funds.json` to show total tracked counts if needed on other pages.

### 10. Cron Schedule Change

The GitHub Actions workflow (`.github/workflows/update-data.yml`) needs:

```yaml
on:
  schedule:
    - cron: '30 0,12 * * *'   # Every 12 hours: 06:00 IST, 18:00 IST
```

Additionally, the workflow needs a data-fetch step before the build:

```yaml
- name: 📡 Fetch latest data
  run: npm run fetch-data
  env:
    ALERT_WEBHOOK_URL: ${{ secrets.ALERT_WEBHOOK_URL }}
```

## Interfaces

### Validation Layer API

```typescript
// Type definitions for scripts/lib/validate.mjs

interface FieldRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  min?: number;
  max?: number;
  nonEmpty?: boolean;
  enum?: string[];
}

interface Schema {
  required: Record<string, FieldRule>;
  optional?: Record<string, FieldRule>;
}

interface ValidationResult {
  valid: object[];
  rejected: Array<{ record: object; reasons: string[] }>;
}

function validateBatch(records: object[], schema: Schema): ValidationResult;
function validateRecord(record: object, schema: Schema): string[];
```

### Diff Detector API

```typescript
interface DiffResult {
  allowed: boolean;
  reason?: string;
  mergedRecords?: object[];
}

function checkCountThreshold(
  existingData: object[],
  newData: object[],
  options?: { minRatio?: number; keyField?: string }
): DiffResult;

function protectFields(
  existingData: object[],
  newData: object[],
  keyField?: string
): object[];

function preserveTimestamps(
  existingData: object[],
  newData: object[],
  keyField?: string,
  compareFields?: string[]
): object[];
```

### Staleness Monitor API

```typescript
interface StalenessReport {
  staleCount: number;
  dataType: 'IPO' | 'MF';
  staleRecords: string[];
}

function checkStaleness(
  records: object[],
  options: { maxAgeHours: number; dataType: string; now?: Date }
): StalenessReport;
```

### Webhook Notifier API

```typescript
interface AlertPayload {
  title: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  source?: string;
}

function sendAlert(payload: AlertPayload): Promise<boolean>;
```

## Data Models

### IPO Record (post-improvement)

```json
{
  "name": "Company Name",
  "slug": "company-name",
  "type": "mainboard",
  "status": "live",
  "priceRange": "100-120",
  "lotSize": 125,
  "openDate": "10th Jun 2026",
  "closeDate": "12th Jun 2026",
  "listingDate": "",
  "sector": "Technology",
  "issueSize": "₹500 Cr",
  "subscription": null,
  "gmp": null,
  "aiScore": null,
  "aiSummary": null,
  "verdict": null,
  "lastUpdated": "2026-06-10T06:30:00.000Z"
}
```

### MF Record (post-improvement)

```json
{
  "name": "HDFC Flexi Cap Fund",
  "slug": "hdfc-flexi-cap-fund",
  "category": "Flexi Cap",
  "nav": 45.67,
  "returns1y": 18.5,
  "returns3y": 15.2,
  "returns5y": 14.8,
  "aum": "₹42,500 Cr",
  "riskLevel": "moderate",
  "rating": 4,
  "schemeCode": "118834",
  "lastUpdated": "2026-06-10T06:30:00.000Z"
}
```

## Error Handling

### Error Hierarchy

1. **Network failure** (fetch timeout/error) → Log + webhook alert + retain existing data
2. **API error response** (non-200 status) → Log + webhook alert + retain existing data
3. **Validation failure** (schema/range) → Log rejected records + write only valid records
4. **Diff rejection** (count threshold / field degradation) → Log + webhook alert + retain existing file
5. **Staleness detection** → Log stale records + webhook alert (data still served)
6. **Webhook delivery failure** → Log warning + continue pipeline (non-blocking)

### Graceful Degradation

The pipeline is designed to never leave data files in a worse state than before the run:
- If BSE API fails → existing `ipos.json` stays untouched
- If AMFI feed fails → existing `mutual-funds.json` stays untouched
- If new data is suspiciously small → write is blocked entirely
- If individual records fail validation → only valid records are written (partial success)
- If webhook is misconfigured → pipeline continues without notifications

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Required Field Validation Partitions Correctly

*For any* array of records and a schema definition, the validation function shall partition records such that every record in the `valid` array has all required fields present with correct types, and every record in the `rejected` array is missing at least one required field or has a type mismatch, with a non-empty `reasons` array explaining each failure.

**Validates: Requirements 1.1, 1.2, 1.5, 16.2**

### Property 2: Range Validation Rejects Out-of-Bounds Values

*For any* IPO record where a price value is negative or a lotSize is a negative number, and *for any* MF record where NAV is ≤ 0 or return percentages are outside [-100, 1000], the validation function shall reject the record with a reason indicating the range violation.

**Validates: Requirements 1.3, 1.4**

### Property 3: Timestamp Presence on Write

*For any* record written to a JSON data file by the pipeline, the output record shall contain a `lastUpdated` field whose value is a valid ISO 8601 timestamp string.

**Validates: Requirements 2.1, 2.2**

### Property 4: Timestamp Preservation for Unchanged Records

*For any* record that appears in both the existing data and incoming data where all comparable fields are identical, the `lastUpdated` value in the output shall equal the `lastUpdated` value from the existing data (not the current time).

**Validates: Requirements 2.3**

### Property 5: Staleness Detection Threshold

*For any* record with a `lastUpdated` timestamp older than the configured threshold (24 hours for IPO, 48 hours for MF), the staleness monitor shall include that record's identifier in the stale records list. *For any* record with a `lastUpdated` timestamp newer than the threshold, it shall not appear in the stale records list.

**Validates: Requirements 3.1, 3.2**

### Property 6: BSE API Response Produces Valid Records

*For any* well-formed BSE API JSON response array, the parser shall produce IPO records that each contain non-empty `name`, non-empty `slug`, a valid `type` value, and `status` set to `'live'`.

**Validates: Requirements 4.2**

### Property 7: Diff Count Threshold Rejection

*For any* pair of existing and new data arrays where the new array length is less than 50% of the existing array length (and existing is non-empty), the diff detector shall reject the write and return `allowed: false`.

**Validates: Requirements 6.2**

### Property 8: Field Degradation Protection

*For any* existing record with a non-null, non-empty field value and a corresponding new record (matched by slug) where that field is null or empty, the merged output record shall retain the existing field value rather than the degraded value.

**Validates: Requirements 6.3**

### Property 9: Dynamic Homepage Counts Match Data

*For any* set of data files (`ipos.json`, `ipo-performance.json`, `mutual-funds.json`), the homepage stat computation function shall return counts equal to the actual number of records in those files.

**Validates: Requirements 11.1, 11.2**

### Property 10: AI Placeholder Nullification

*For any* IPO record processed by the pipeline where no real AI analysis has been performed, the `aiScore`, `aiSummary`, and `verdict` fields shall all be `null` in the output.

**Validates: Requirements 12.1**

### Property 11: Content-less Article Exclusion

*For any* article record where the `content` field is missing, null, or an empty string, the build process shall not generate a static page for that article.

**Validates: Requirements 13.1, 13.3**

### Property 12: Pipeline Output Schema Compatibility

*For any* pipeline execution, the output JSON files (`ipos.json`, `mutual-funds.json`, `upcoming-ipos.json`) shall contain arrays where every record conforms to the schema expected by the Astro page templates (all fields used in template rendering are present).

**Validates: Requirements 15.4**
