/**
 * Cross-check DB readiness for holdings + smart-money signals (most bought/sold).
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = neon(readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim());

console.log('═══════════════════════════════════════════════════════════');
console.log('  DB Health Audit — Holdings & Signals');
console.log('═══════════════════════════════════════════════════════════\n');

const holdingsByMonth = await sql`
  SELECT month, COUNT(*)::int AS rows, COUNT(DISTINCT fund_id)::int AS funds, COUNT(DISTINCT stock_id)::int AS stocks
  FROM fund_holdings GROUP BY month ORDER BY month
`;
console.log('=== fund_holdings by month ===');
console.table(holdingsByMonth);

const changesByMonth = await sql`
  SELECT month, change_type, COUNT(*)::int AS cnt
  FROM holdings_changes GROUP BY month, change_type ORDER BY month, change_type
`;
console.log('\n=== holdings_changes by month ===');
console.table(changesByMonth);

const signalsByMonth = await sql`
  SELECT month, category, COUNT(*)::int AS cnt
  FROM stock_signals GROUP BY month, category ORDER BY month, category
`;
console.log('\n=== stock_signals by month ===');
console.table(signalsByMonth);

const [latest] = await sql`
  SELECT
    (SELECT MAX(month) FROM fund_holdings) AS holdings,
    (SELECT MAX(month) FROM holdings_changes) AS changes,
    (SELECT MAX(month) FROM stock_signals WHERE category = 'ALL') AS signals
`;
console.log('\n=== Latest month in each table ===');
console.log(latest);

const perMonthSync = await sql`
  SELECT
    fh.month::text AS month,
    COUNT(DISTINCT fh.fund_id)::int AS funds,
    (SELECT COUNT(*)::int FROM holdings_changes hc WHERE hc.month = fh.month) AS changes,
    (SELECT COUNT(*)::int FROM stock_signals ss WHERE ss.month = fh.month AND ss.category = 'ALL') AS signals
  FROM fund_holdings fh
  GROUP BY fh.month
  ORDER BY fh.month
`;
console.log('\n=== Per-month sync (holdings → changes → signals) ===');
console.table(perMonthSync);

const may = '2026-05-01';
const apr = '2026-04-01';

const maySignals = await sql`
  SELECT COUNT(*)::int AS cnt FROM stock_signals WHERE month = ${may}::date AND category = 'ALL'
`;
const aprSignals = await sql`
  SELECT COUNT(*)::int AS cnt FROM stock_signals WHERE month = ${apr}::date AND category = 'ALL'
`;

console.log(`\nMay 2026 stock_signals (ALL): ${maySignals[0].cnt}`);
console.log(`April 2026 stock_signals (ALL): ${aprSignals[0].cnt}`);

if (maySignals[0].cnt === 0) {
  console.log('\n⚠️  May signals MISSING — run: node db/compute/compute-signals.mjs --month=2026-05-01');
} else {
  const topBought = await sql`
    SELECT s.name, sig.fresh_entries, sig.increased_count, sig.complete_exits, sig.decreased_count, sig.conviction_score
    FROM stock_signals sig JOIN stocks s ON s.id = sig.stock_id
    WHERE sig.month = ${may}::date AND sig.category = 'ALL'
    ORDER BY sig.conviction_score DESC NULLS LAST LIMIT 10
  `;
  const topSold = await sql`
    SELECT s.name, sig.fresh_entries, sig.increased_count, sig.complete_exits, sig.decreased_count, sig.conviction_score
    FROM stock_signals sig JOIN stocks s ON s.id = sig.stock_id
    WHERE sig.month = ${may}::date AND sig.category = 'ALL'
    ORDER BY sig.conviction_score ASC NULLS LAST LIMIT 10
  `;
  console.log('\n=== May 2026 — Most Bought (top 10 by conviction_score) ===');
  for (const r of topBought) {
    console.log(`  ${Number(r.conviction_score).toFixed(1).padStart(5)} | ${r.name} | +${r.fresh_entries} fresh, +${r.increased_count} increased`);
  }
  console.log('\n=== May 2026 — Most Sold (top 10 by conviction_score) ===');
  for (const r of topSold) {
    console.log(`  ${Number(r.conviction_score).toFixed(1).padStart(5)} | ${r.name} | -${r.complete_exits} exits, -${r.decreased_count} decreased`);
  }
}

// Duplicate fund-month check
const dupes = await sql`
  SELECT fund_id, month, COUNT(*)::int AS cnt
  FROM fund_holdings
  GROUP BY fund_id, month, stock_id
  HAVING COUNT(*) > 1
  LIMIT 5
`;
const dupeFundMonth = await sql`
  SELECT f.name, fh.month, COUNT(DISTINCT fh.stock_id)::int AS stocks, COUNT(*)::int AS rows
  FROM fund_holdings fh JOIN funds f ON f.id = fh.fund_id
  WHERE fh.month = ${may}::date
  GROUP BY f.id, f.name, fh.month
  HAVING COUNT(*) > COUNT(DISTINCT fh.stock_id)
  LIMIT 5
`;
console.log('\n=== Duplicate stock rows (same fund+month+stock) ===');
console.log(dupes.length ? dupes : 'None found (sample check)');

// JSON vs DB May fund count
import { existsSync } from 'fs';
const jsonPath = join(ROOT, 'src/data/fund-holdings.json');
if (existsSync(jsonPath)) {
  const j = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  let jsonMay = 0;
  for (const f of Object.values(j.holdings || {})) {
    if (Array.isArray(f['May 2026']) && f['May 2026'].length >= 3) jsonMay++;
  }
  const [dbMay] = await sql`
    SELECT COUNT(DISTINCT fund_id)::int AS funds FROM fund_holdings WHERE month = ${may}::date
  `;
  console.log('\n=== JSON vs DB (May 2026 funds) ===');
  console.log({ jsonFunds: jsonMay, dbFunds: dbMay.funds, match: jsonMay === dbMay.funds });
}

// Compare latest two months in DB
const recentMonths = await sql`
  SELECT month::text AS month FROM fund_holdings GROUP BY month ORDER BY month DESC LIMIT 2
`;
if (recentMonths.length === 2) {
  const [newer, older] = recentMonths;
  console.log(`\n=== Month comparison: ${older.month} vs ${newer.month} ===`);
  const [totals] = await sql`
    SELECT
      COUNT(DISTINCT fund_id) FILTER (WHERE month = ${older.month}::date)::int AS older_funds,
      COUNT(DISTINCT fund_id) FILTER (WHERE month = ${newer.month}::date)::int AS newer_funds
    FROM fund_holdings
  `;
  console.log(totals);

  const onlyOlder = await sql`
    SELECT DISTINCT a.name AS amc, f.name AS fund
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id
    JOIN amcs a ON a.id = f.amc_id
    WHERE fh.month = ${older.month}::date
      AND NOT EXISTS (
        SELECT 1 FROM fund_holdings m
        WHERE m.fund_id = fh.fund_id AND m.month = ${newer.month}::date
      )
    ORDER BY 1, 2
  `;
  console.log(`\nIn ${older.month} but NOT ${newer.month} (${onlyOlder.length} funds):`);
  onlyOlder.forEach((r) => console.log(`  ${r.amc} | ${r.fund}`));

  const onlyNewer = await sql`
    SELECT DISTINCT a.name AS amc, f.name AS fund
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id
    JOIN amcs a ON a.id = f.amc_id
    WHERE fh.month = ${newer.month}::date
      AND NOT EXISTS (
        SELECT 1 FROM fund_holdings o
        WHERE o.fund_id = fh.fund_id AND o.month = ${older.month}::date
      )
    ORDER BY 1, 2
    LIMIT 20
  `;
  console.log(`\nIn ${newer.month} but NOT ${older.month} (showing first 20 of many):`);
  onlyNewer.forEach((r) => console.log(`  ${r.amc} | ${r.fund}`));
}

console.log('\n═══════════════════════════════════════════════════════════');
