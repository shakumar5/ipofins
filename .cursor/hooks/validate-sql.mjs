#!/usr/bin/env node
/**
 * afterFileEdit hook: flag risky SQL in db/migrations/*.sql
 * - TIMESTAMP without TIMESTAMPTZ
 * - SELECT *
 */
import { readFileSync } from 'fs';

let input = '';
try {
  for await (const chunk of process.stdin) input += chunk;
} catch {
  input = '';
}

let payload = {};
try {
  payload = input ? JSON.parse(input) : {};
} catch {
  payload = {};
}

const filePath = payload.filePath || payload.path || payload.file || '';
const normalized = String(filePath).replace(/\\/g, '/');
if (!normalized.includes('db/migrations/') || !normalized.endsWith('.sql')) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

let sql = '';
try {
  sql = readFileSync(filePath, 'utf8');
} catch {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

const issues = [];
if (/\bSELECT\s+\*/i.test(sql)) {
  issues.push('Avoid SELECT * — name columns explicitly.');
}
if (/\bTIMESTAMP\b(?!TZ)/i.test(sql) && /\bTIMESTAMPTZ\b/i.test(sql) === false) {
  if (/\bTIMESTAMP\s+WITHOUT\s+TIME\s+ZONE\b/i.test(sql) || /\bTIMESTAMP\b(?!TZ)/i.test(sql)) {
    issues.push('Use TIMESTAMPTZ instead of TIMESTAMP without time zone.');
  }
}
// simpler TIMESTAMP check
if (/\bTIMESTAMP(?!TZ)\b/i.test(sql)) {
  issues.push('Use TIMESTAMPTZ instead of bare TIMESTAMP.');
}

if (!issues.length) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  userMessage: issues.join(' '),
}));
