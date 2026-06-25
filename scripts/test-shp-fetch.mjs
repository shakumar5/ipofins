#!/usr/bin/env node
/** Run via: npm run test:shp-fetch -- TCS  (or node scripts/node-with-ca.mjs scripts/test-shp-fetch.mjs TCS) */
import { parseShareholdingXbrl } from './lib/shp-xbrl-parser.mjs';
import { fetchNSEShareholdingViaXbrl, fetchShareholdingPattern } from './lib/si-sources.mjs';
import { sql } from './lib/db.mjs';

const sym = process.argv[2] || 'TCS';
const quarter = '2026-01-01';
const stock = (await sql`SELECT * FROM stocks WHERE UPPER(nse_symbol)=${sym} LIMIT 1`)[0];
console.log('Testing', sym, 'quarter', quarter);

const rows = await fetchShareholdingPattern(stock, quarter);
const gte1 = rows.filter((r) => r.pctOfCompany >= 1);
console.log('rows:', rows.length, 'gte1:', gte1.length);
console.log('sample:', gte1.slice(0, 5));
