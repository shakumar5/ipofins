#!/usr/bin/env node
/**
 * Apply a SQL migration file to Neon using the `pg` driver (no psql needed).
 * Reads the file as a single string and runs it in one transaction with
 * multiple statements enabled, so CREATE TABLE / INDEX / FUNCTION all apply
 * together. Safe to re-run: every statement is CREATE ... IF NOT EXISTS.
 *
 * Usage: node scripts/node-with-ca.mjs scripts/apply-migration.mjs <migration.sql>
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';

const file = resolve(process.cwd(), process.argv[2]);
if (!file) {
  console.error('❌ Pass a migration path: scripts/apply-migration.mjs db/migrations/NNN_xxx.sql');
  process.exit(1);
}

const env = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

// channel_binding=require in the connection string can cause handshake issues
// with some pg builds; strip it (sslmode=require still enforces TLS).
const cleanUrl = dbUrl.replace(/&?channel_binding=require/i, '');

const sql = readFileSync(file, 'utf-8');

const client = new pg.Client({ connectionString: cleanUrl });
await client.connect();

const name = file.split(/[\\/]/).pop();
console.log(`\n▶ Applying ${name} ...`);

try {
  // Single transaction, multiple statements. CREATE ... IF NOT EXISTS makes
  // this idempotent.
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log(`✅ ${name} applied successfully`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error(`\n❌ ${name} FAILED (rolled back):`);
  console.error(err.message);
  if (err.where) console.error('  at:', err.where);
  await client.end();
  process.exit(1);
}

await client.end();
