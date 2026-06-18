#!/usr/bin/env node
/** Verify Neon schema before deploy. Exit 1 if required tables missing. */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL || (() => {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  return readFileSync(envPath, 'utf-8').match(/DATABASE_URL=(.+)/)?.[1]?.trim();
})();

if (!url) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const parsed = new URL(url.replace(/^postgresql:/, 'postgres:'));
const host = parsed.hostname;
const dbName = parsed.pathname.replace(/^\//, '') || '?';

const sql = neon(url);
const required = ['ipos', 'funds', 'fund_navs', 'fund_holdings', 'stocks', 'amcs'];
const rows = await sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename = ANY(${required})
`;
const found = new Set(rows.map((r) => r.tablename));
const missing = required.filter((t) => !found.has(t));

console.log(`Neon host: ${host}`);
console.log(`Database:  ${dbName}`);
console.log(`Tables:    ${[...found].sort().join(', ') || '(none)'}`);

if (missing.length) {
  console.error(`\n❌ Missing tables: ${missing.join(', ')}`);
  console.error('Run migrations on this database:');
  console.error('  psql $DATABASE_URL -f db/migrations/001_initial_schema.sql');
  console.error('  psql $DATABASE_URL -f db/migrations/002_indexes.sql');
  console.error('  psql $DATABASE_URL -f db/migrations/003_materialized_views.sql');
  console.error('\nOr point Vercel/GitHub DATABASE_URL to your populated Neon project.');
  process.exit(1);
}

const [ipoCount] = await sql`SELECT COUNT(*)::int AS c FROM ipos`;
console.log(`\n✅ Schema OK — ${ipoCount?.c ?? 0} IPOs in database\n`);
