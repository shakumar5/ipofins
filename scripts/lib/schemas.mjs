// scripts/lib/schemas.mjs
// Schema definitions for IPO, Mutual Fund, and Upcoming IPO data validation.
// Each schema defines required and optional fields with type checks, range constraints, and enum values.

/**
 * Schema for IPO records (ipos.json).
 * Required: name, slug, type, status, priceRange
 * Optional: lotSize, issueSize, subscription, gmp, date fields, lastUpdated
 *
 * NOTE: date fields (openDate, closeDate, allotmentDate, listingDate) are validated
 * as strings only — format correctness is handled by ipo-status.ts parseIPODate().
 */
export const IPO_SCHEMA = {
  required: {
    name: { type: 'string', nonEmpty: true },
    slug: { type: 'string', nonEmpty: true },
    type: { type: 'string', enum: ['mainboard', 'sme'] },
    status: { type: 'string', enum: ['live', 'upcoming', 'open', 'listed', 'closed', 'allotment', 'drhp-filed', 'failed', 'withdrawn'] },
    priceRange: { type: 'string' },
  },
  optional: {
    lotSize: { type: 'number', min: 0 },
    issueSize: { type: 'string' },
    subscription: { type: 'number', min: 0 },
    gmp: { type: 'number' },
    // Date fields — validated as non-empty strings; format checked by ipo-status.ts
    openDate: { type: 'string' },
    closeDate: { type: 'string' },
    allotmentDate: { type: 'string' },
    listingDate: { type: 'string' },
    refundDate: { type: 'string' },
    creditDate: { type: 'string' },
    lastUpdated: { type: 'string' },
  },
};

/**
 * Schema for Mutual Fund records (mutual-funds.json).
 * Required: name, slug, category, nav (must be > 0)
 * Optional: returns1y/3y/5y (range -100..1000), rating (1..5), lastUpdated
 */
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

/**
 * Schema for Upcoming IPO records (upcoming-ipos.json).
 * Required: name, slug, status (only 'drhp-filed' or 'upcoming')
 * Optional: type, sector, issueSize, drhpDate, lastUpdated
 */
export const UPCOMING_IPO_SCHEMA = {
  required: {
    name: { type: 'string', nonEmpty: true },
    slug: { type: 'string', nonEmpty: true },
    status: { type: 'string', enum: ['drhp-filed', 'sebi-approved', 'upcoming'] },
  },
  optional: {
    type: { type: 'string', enum: ['mainboard', 'sme'] },
    sector: { type: 'string' },
    issueSize: { type: 'string' },
    drhpDate: { type: 'string' },
    lastUpdated: { type: 'string' },
  },
};
