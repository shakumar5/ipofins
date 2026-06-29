#!/usr/bin/env node
/**
 * CLI SQL migration checks (no DB connection).
 * Usage: node scripts/validate-migration.mjs db/migrations/NNN_name.sql
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const file = resolve(process.cwd(), process.argv[2] || '');
if (!file || !file.endsWith('.sql')) {
  console.error('Usage: node scripts/validate-migration.mjs db/migrations/NNN_name.sql');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');
let failed = false;

if (/\bSELECT\s+\*/i.test(sql)) {
  console.error('FAIL: SELECT * found — list columns explicitly.');
  failed = true;
}
if (/\bTIMESTAMP(?!TZ)\b/i.test(sql)) {
  console.error('FAIL: use TIMESTAMPTZ instead of TIMESTAMP.');
  failed = true;
}
if (/\bsecurity_id\b/i.test(sql)) {
  console.warn('WARN: prefer stock_id (stocks.id) over security_id.');
}

if (failed) process.exit(1);
console.log('OK:', process.argv[2]);
