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

const [counts] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM ipos) AS ipos,
    (SELECT COUNT(*)::int FROM funds) AS funds,
    (SELECT COUNT(*)::int FROM fund_navs) AS fund_navs,
    (SELECT COUNT(*)::int FROM fund_holdings) AS fund_holdings,
    (SELECT COUNT(*)::int FROM amcs) AS amcs,
    (SELECT COUNT(*)::int FROM stocks) AS stocks
`;

console.log('\nRow counts:');
console.log(`  IPOs:           ${counts.ipos}`);
console.log(`  AMCs:           ${counts.amcs}`);
console.log(`  Funds:          ${counts.funds}`);
console.log(`  Fund NAVs:      ${counts.fund_navs}`);
console.log(`  Fund holdings:  ${counts.fund_holdings}`);
console.log(`  Stocks:         ${counts.stocks}`);

const warnings = [];
if (counts.funds > 0 && counts.funds < 50) warnings.push('funds table looks sparse (curated rebuild may be needed)');
if (counts.funds > 800) warnings.push('funds table still has full AMFI universe — consider db:rebuild-curated-mf');
if (counts.fund_navs > 0 && counts.fund_navs < 50) warnings.push('fund_navs sparse (run seed-curated-mf or pipeline:nav)');
if (counts.fund_holdings < 500) warnings.push('fund_holdings looks empty (run db:rebuild-curated-mf or pipeline:monthly)');

if (warnings.length) {
  console.warn('\n⚠️  Data warnings:');
  for (const w of warnings) console.warn(`  - ${w}`);
  console.warn('\nIf this is CI/Vercel, check DATABASE_URL matches your populated local Neon URL.');
  console.warn('GitHub: Settings → Secrets → DATABASE_URL\n');
}

console.log(`\n✅ Schema OK\n`);
