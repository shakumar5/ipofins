#!/usr/bin/env node
/**
 * Pre-flight checks for pipeline:superinvestor before a full NSE scan.
 * Usage: node scripts/node-with-ca.mjs scripts/validate-si-pipeline.mjs
 */

import { sql, isDbConfigured } from './lib/db.mjs';
import { fetchShareholdingPattern } from './lib/si-sources.mjs';
import { upsertMany } from './lib/db.mjs';

const TEST_SYMBOLS = ['TCS', 'RELIANCE', 'HDFCBANK', 'INFY', 'ITC'];

function inferLatestQuarter(now = new Date()) {
  const year = now.getFullYear();
  const quarters = [
    { q: `${year}-01-01`, endDate: new Date(year, 2, 31), windowDays: 25 },
    { q: `${year}-04-01`, endDate: new Date(year, 5, 30), windowDays: 25 },
    { q: `${year}-07-01`, endDate: new Date(year, 8, 30), windowDays: 25 },
    { q: `${year}-10-01`, endDate: new Date(year, 11, 31), windowDays: 25 },
  ];
  for (let i = quarters.length - 1; i >= 0; i--) {
    const q = quarters[i];
    const windowEnd = new Date(q.endDate);
    windowEnd.setDate(windowEnd.getDate() + q.windowDays);
    if (now >= windowEnd) return q.q;
  }
  return quarters[Math.max(0, quarters.length - 2)].q;
}

async function main() {
  if (!isDbConfigured()) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const quarter = inferLatestQuarter();
  console.log('══════════════════════════════════════════════════');
  console.log('  SI Pipeline pre-flight validation');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Quarter: ${quarter}\n`);

  const [{ total, with_nse, with_bse_only }] = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(NULLIF(TRIM(nse_symbol), ''))::int AS with_nse,
           COUNT(*) FILTER (
             WHERE NULLIF(TRIM(bse_code), '') IS NOT NULL
               AND NULLIF(TRIM(nse_symbol), '') IS NULL
           )::int AS with_bse_only
    FROM stocks
  `;
  console.log(`✓ Stock universe: ${with_nse} NSE-listed + ${with_bse_only} BSE-only (${total} total rows)`);
  if (with_nse < 2000) {
    console.warn(`  ⚠ Expected ~2300+ NSE equities — run npm run db:seed-listed-equities`);
  }
  if (with_bse_only < 500) {
    console.warn(`  ⚠ Expected ~2000+ BSE-only equities — run npm run db:seed-bse-listed-equities`);
  }

  const [{ entities }] = await sql`SELECT COUNT(*)::int AS entities FROM tracked_entities WHERE is_active = true`;
  console.log(`✓ Tracked entities: ${entities} active`);

  // Spot-check SHP fetch on liquid large-caps
  console.log('\nSHP fetch spot-check (5 large-caps):');
  let fetchOk = 0;
  let holdersGte1 = 0;

  for (const sym of TEST_SYMBOLS) {
    const rows = await sql`
      SELECT id, name, slug, nse_symbol, isin FROM stocks
      WHERE UPPER(nse_symbol) = ${sym} LIMIT 1
    `;
    const stock = rows[0];
    if (!stock) {
      console.log(`  ✗ ${sym}: not in stocks table`);
      continue;
    }

    const holders = await fetchShareholdingPattern(stock, quarter);
    const withPct = holders.filter((h) => h.pctOfCompany != null && Number.isFinite(h.pctOfCompany));
    const gte1 = withPct.filter((h) => h.pctOfCompany >= 1.0);
    const source = holders[0]?.sourceUrl?.includes('bseindia') ? 'BSE' : holders[0]?.sourceUrl?.includes('nseindia') ? 'NSE' : 'none';

    if (gte1.length > 0) {
      fetchOk++;
      holdersGte1 += gte1.length;
      console.log(`  ✓ ${sym}: ${gte1.length} ≥1% holders (${withPct.length} parsed, via ${source})`);
    } else if (withPct.length > 0) {
      console.log(`  ~ ${sym}: ${withPct.length} holders but none ≥1% (parser partial, ${source})`);
    } else if (holders.length > 0) {
      console.log(`  ✗ ${sym}: ${holders.length} rows but pct_of_company missing — NSE/BSE parser issue`);
    } else {
      console.log(`  ✗ ${sym}: no data returned`);
    }
  }

  // Spot-check BSE-only SHP fetch
  console.log('\nSHP fetch spot-check (BSE-only):');
  const [bseOnlyStock] = await sql`
    SELECT id, name, slug, nse_symbol, bse_code, isin FROM stocks
    WHERE NULLIF(TRIM(bse_code), '') IS NOT NULL
      AND NULLIF(TRIM(nse_symbol), '') IS NULL
    ORDER BY bse_code
    LIMIT 1
  `;
  if (bseOnlyStock) {
    const holders = await fetchShareholdingPattern(bseOnlyStock, quarter);
    const gte1 = holders.filter((h) => h.pctOfCompany >= 1.0);
    const source = holders[0]?.sourceUrl?.includes('bseindia') ? 'BSE' : 'none';
    if (gte1.length > 0) {
      fetchOk++;
      holdersGte1 += gte1.length;
      console.log(`  ✓ BSE-only ${bseOnlyStock.bse_code}: ${gte1.length} ≥1% holders (${holders.length} parsed, via ${source})`);
    } else {
      console.log(`  ✗ BSE-only ${bseOnlyStock.bse_code}: no ≥1% holders returned`);
    }
  } else {
    console.log('  ~ No BSE-only stocks seeded — run npm run db:seed-bse-listed-equities');
  }

  // DB upsert smoke test
  console.log('\nDB upsert smoke test:');
  const tcs = await sql`SELECT id FROM stocks WHERE UPPER(nse_symbol) = 'TCS' LIMIT 1`;
  if (tcs[0]) {
    const testRow = {
      stock_id: tcs[0].id,
      quarter,
      holder_name: '__PIPELINE_VALIDATION__',
      holder_type: 'individual',
      shares: 1000,
      pct_of_company: 1.01,
      source: 'validation',
      source_url: null,
      is_promoter: false,
      entity_id: null,
      match_confidence: null,
    };
    const before = await sql`SELECT COUNT(*)::int AS c FROM shareholding_pattern_holders WHERE holder_name = '__PIPELINE_VALIDATION__'`;
    await upsertMany(
      'shareholding_pattern_holders',
      [testRow],
      'stock_id, holder_name, quarter',
      ['holder_type', 'shares', 'pct_of_company', 'source', 'source_url', 'is_promoter', 'entity_id', 'match_confidence'],
    );
    const after = await sql`SELECT COUNT(*)::int AS c FROM shareholding_pattern_holders WHERE holder_name = '__PIPELINE_VALIDATION__'`;
    await sql`DELETE FROM shareholding_pattern_holders WHERE holder_name = '__PIPELINE_VALIDATION__'`;
    if (after[0].c > before[0].c) {
      console.log('  ✓ shareholding_pattern_holders upsert works');
    } else {
      console.log('  ✗ upsert failed — check db.mjs upsertMany');
    }
  }

  console.log('\n──────────────────────────────────────────────────');
  const universe = with_nse + with_bse_only;
  const pass = with_nse >= 2000 && fetchOk >= 3;
  if (pass) {
    console.log('✅ Pre-flight PASSED — safe to run full pipeline:superinvestor');
    const parallelMin = Math.max(1, Math.round((universe * 1.5) / 60 / 40));
    console.log(`   Sequential: ~${Math.round((universe * 1.5) / 60)} min | Parallel (--concurrency=40): ~${parallelMin} min`);
  } else {
    console.log('❌ Pre-flight FAILED — fix issues above before full run');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
