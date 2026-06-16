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

/**
 * SQL tagged template — null-safe (returns null if no DB configured)
 */
export const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

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
 * @returns {Promise<number>} Number of rows affected
 */
export async function upsertMany(table, rows, conflictKey, updateCols) {
  if (!sql || rows.length === 0) return 0;

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
      ? `ON CONFLICT (${conflictKey}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = NOW()`
      : `ON CONFLICT (${conflictKey}) DO NOTHING`;

    const query = `
      INSERT INTO ${table} (${cols.join(', ')})
      VALUES ${valueSets.join(', ')}
      ${updateClause}
    `;

    try {
      const result = await sql(query, params);
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
