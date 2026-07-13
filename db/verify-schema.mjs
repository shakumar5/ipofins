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
// Core 001 tables — required for build to proceed.
const required = ['ipos', 'funds', 'fund_navs', 'fund_holdings', 'stocks', 'amcs'];
// 005 super-investor tables — required for the super-investor / 1%-club / PMS /
// alternative-funds features. Build still works without them (the routes 404
// gracefully), so these are flagged as warnings, not hard failures.
const superInvestorTables = [
  'tracked_entities',
  'tracked_entity_tags',
  'entity_strategies',
  'shareholding_pattern_holders',
  'sast_filings',
  'entity_holdings',
  'stock_quarter_prices',
  'entity_changes',
  'entity_stock_signals',
  'entity_quarterly_stats',
  'entity_overlaps',
  'entity_conviction',
  'corporate_actions',
  'pipeline_runs',
];
const rows = await sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename = ANY(${[...required, ...superInvestorTables]})
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

const missingSuperInvestor = superInvestorTables.filter((t) => !found.has(t));
if (missingSuperInvestor.length) {
  console.warn(`\n⚠️  Super-investor tables not found: ${missingSuperInvestor.join(', ')}`);
  console.warn('Optional. To enable /super-investors, /1-percent-club, /pms, /alternative-funds:');
  console.warn('  psql $DATABASE_URL -f db/migrations/005_super_investors.sql');
  console.warn('  psql $DATABASE_URL -f db/migrations/006_super_investor_views.sql');
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

const [isinUnique] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'stocks' AND indexname = 'stocks_isin_unique'
  ) AS present
`;
const [nseUnique] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'stocks' AND indexname = 'stocks_nse_unique_no_isin'
  ) AS present
`;
const [bseUnique] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'stocks' AND indexname = 'stocks_bse_unique_no_isin_nse'
  ) AS present
`;
const missingListingUnique = [
  !isinUnique?.present && 'stocks_isin_unique',
  !nseUnique?.present && 'stocks_nse_unique_no_isin',
  !bseUnique?.present && 'stocks_bse_unique_no_isin_nse',
].filter(Boolean);
if (missingListingUnique.length) {
  console.error(`\n❌ Missing UNIQUE listing indexes: ${missingListingUnique.join(', ')}`);
  console.error('  node --use-system-ca db/fix-isin.mjs');
  console.error('  # or: psql $DATABASE_URL -f db/migrations/014_stocks_isin_unique.sql');
  process.exit(1);
}
console.log('  Listing unique: ISIN → NSE(no ISIN) → BSE(no ISIN/NSE) ✓');

// Super-investor counts — only queried if the tables exist (graceful skip).
if (!missingSuperInvestor.length) {
  const [siCounts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM tracked_entities)               AS entities,
      (SELECT COUNT(*)::int FROM entity_holdings)                AS holdings,
      (SELECT COUNT(*)::int FROM shareholding_pattern_holders)   AS sph,
      (SELECT COUNT(*)::int FROM sast_filings)                   AS sast,
      (SELECT COUNT(*)::int FROM entity_changes)                 AS changes,
      (SELECT COUNT(*)::int FROM entity_stock_signals)           AS signals,
      (SELECT COUNT(*)::int FROM pipeline_runs)                  AS pipeline_runs
  `;
  console.log('\nSuper-investor / 1%-club / PMS / alt-funds:');
  console.log(`  Tracked entities:      ${siCounts.entities}`);
  console.log(`  Entity holdings:       ${siCounts.holdings}`);
  console.log(`  ≥1% pattern holders:   ${siCounts.sph}`);
  console.log(`  SAST filings:          ${siCounts.sast}`);
  console.log(`  Entity changes:        ${siCounts.changes}`);
  console.log(`  Stock signals:         ${siCounts.signals}`);
  console.log(`  Pipeline run log:      ${siCounts.pipeline_runs}`);
}

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
