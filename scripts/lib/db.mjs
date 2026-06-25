/**
 * Finverse — Database Client for Scripts
 * 
 * Used by fetch-all-data.mjs, parse-holdings.mjs, and other data scripts.
 * Reads DATABASE_URL from .env file or environment variables.
 * 
 * Usage:
 *   import { sql, upsertMany } from './lib/db.mjs';
 *   await sql`INSERT INTO funds (name) VALUES (${'My Fund'})`;
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');

// Load .env file if present
function loadEnv() {
  const envPath = join(ROOT_DIR, '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL not set. DB writes will be skipped (JSON-only mode).');
}

/** True for transient Neon/network errors worth retrying. */
export function isRetryableDbError(err) {
  const parts = [err?.message, err?.cause?.message, err?.cause?.code, String(err?.cause || '')];
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  return (
    text.includes('fetch failed')
    || text.includes('connect timeout')
    || text.includes('connection terminated')
    || text.includes('econnreset')
    || text.includes('etimedout')
    || text.includes('enotfound')
    || text.includes('socket hang up')
    || text.includes('und_err')
    || text.includes('network')
  );
}

export function formatDbError(err, { step = 'database', windowsTlsHint = '' } = {}) {
  const cause = err?.cause?.message || err?.cause?.code;
  const detail = cause && !String(err.message).includes(cause) ? ` (${cause})` : '';
  return `${step}: ${err.message}${detail}${windowsTlsHint}`;
}

/**
 * Retry a DB operation on transient fetch / connect failures (common on Windows + Neon).
 */
export async function withDbRetry(fn, { label = 'DB query', retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableDbError(err) || attempt === retries) break;
      const delayMs = attempt * 3000;
      console.warn(`    ↻ ${label} failed (${attempt}/${retries}): ${err.message} — retrying in ${delayMs / 1000}s…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/**
 * SQL tagged template — null-safe (returns null if no DB configured)
 */
export const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

/** Run a tagged-template query with retries. */
export async function sqlRetry(queryFn, opts) {
  if (!sql) return null;
  return withDbRetry(() => queryFn(sql), opts);
}

/**
 * Check if database is configured
 */
export function isDbConfigured() {
  return !!DATABASE_URL;
}

/**
 * Batch upsert helper — inserts rows, updates on conflict.
 * 
 * @param {string} table - Table name
 * @param {Object[]} rows - Array of row objects
 * @param {string} conflictKey - Column(s) for ON CONFLICT (comma-separated)
 * @param {string[]} updateCols - Columns to update on conflict
 * @param {{ touchUpdatedAt?: boolean }} [options]
 * @returns {Promise<number>} Number of rows affected
 */
function dedupeRowsByConflictKey(rows, conflictKey) {
  const keys = conflictKey.split(',').map((k) => k.trim());
  const seen = new Map();
  for (const row of rows) {
    const key = keys.map((k) => String(row[k] ?? '')).join('\0');
    seen.set(key, row);
  }
  return [...seen.values()];
}

export async function upsertMany(table, rows, conflictKey, updateCols, { touchUpdatedAt = false } = {}) {
  if (!sql || rows.length === 0) return 0;

  rows = dedupeRowsByConflictKey(rows, conflictKey);

  // Build column list from first row
  const cols = Object.keys(rows[0]);
  
  // Process in batches of 50 (Neon has query size limits)
  const BATCH_SIZE = 50;
  let totalAffected = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    // Build VALUES clause with parameterized placeholders
    const valueSets = [];
    const params = [];
    let paramIdx = 1;

    for (const row of batch) {
      const placeholders = cols.map(() => `$${paramIdx++}`);
      valueSets.push(`(${placeholders.join(', ')})`);
      for (const col of cols) {
        params.push(row[col] ?? null);
      }
    }

    const updateClause = updateCols.length > 0
      ? `ON CONFLICT (${conflictKey}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}${touchUpdatedAt ? ', updated_at = NOW()' : ''}`
      : `ON CONFLICT (${conflictKey}) DO NOTHING`;

    const query = `
      INSERT INTO ${table} (${cols.join(', ')})
      VALUES ${valueSets.join(', ')}
      ${updateClause}
    `;

    try {
      await sql.query(query, params);
      totalAffected += batch.length;
    } catch (err) {
      console.error(`    ❌ DB upsert error (${table}, batch ${Math.floor(i/BATCH_SIZE)+1}):`, err.message);
    }
  }

  return totalAffected;
}

/**
 * Simple query helper for scripts (non-tagged template usage)
 */
export async function dbQuery(queryStr, params = []) {
  if (!sql) return [];
  try {
    return await sql.query(queryStr, params);
  } catch (err) {
    console.error('    ❌ DB query error:', err.message);
    return [];
  }
}
