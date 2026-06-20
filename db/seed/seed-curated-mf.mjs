#!/usr/bin/env node
/**
 * Seed curated mutual funds: Direct Growth, selected categories, holdings-gated.
 *
 * Prerequisites: fund-holdings.json + mutual-funds.json
 * Run after: db/purge-mf-data.mjs --confirm
 *
 * Usage: node scripts/node-with-ca.mjs db/seed/seed-curated-mf.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import {
  slugify,
  CANONICAL_AMCS,
  extractAmcFromFundName,
  canonicalParserAmc,
} from '../../scripts/lib/amc-resolve.mjs';
import {
  buildCuratedFundList,
  CURATED_FUND_CATEGORIES,
} from '../../scripts/lib/canonical-fund-filter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, 'src', 'data');

const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(dbUrl);

function readJSON(file) {
  const p = join(DATA_DIR, file);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
}

function parseAum(aum) {
  if (!aum) return null;
  const n = parseFloat(String(aum).replace(/[₹,Cr\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Seed Curated MF Universe');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Categories: ${CURATED_FUND_CATEGORIES.join(', ')}`);

  const holdingsData = readJSON('fund-holdings.json');
  const mutualFunds = readJSON('mutual-funds.json');
  if (!holdingsData?.holdings) {
    console.error('❌ fund-holdings.json missing — run parse-holdings first');
    process.exit(1);
  }
  if (!mutualFunds?.length) {
    console.error('❌ mutual-funds.json missing');
    process.exit(1);
  }

  const curated = buildCuratedFundList(holdingsData, mutualFunds);
  console.log(`\n  Curated funds: ${curated.length} (union months, holdings-gated)`);

  if (!curated.length) {
    console.error('❌ No curated funds matched — check Holdings folder and categories');
    process.exit(1);
  }

  // AMCs — only those needed by curated funds
  const amcNames = new Set();
  for (const fund of curated) {
    const parserAmc = canonicalParserAmc(fund.amc);
    amcNames.add(parserAmc !== 'Unknown' ? parserAmc : extractAmcFromFundName(fund.name));
  }

  console.log(`  AMCs to seed: ${amcNames.size}`);
  for (const name of [...CANONICAL_AMCS, ...amcNames]) {
    await sql`
      INSERT INTO amcs (name, slug, short_name)
      VALUES (${name}, ${slugify(name)}, ${name.substring(0, 30)})
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    `;
  }

  const amcRows = await sql`SELECT id, name FROM amcs`;
  const amcIdByName = Object.fromEntries(amcRows.map((r) => [r.name, r.id]));

  let inserted = 0;
  for (const fund of curated) {
    const parserAmc = canonicalParserAmc(fund.amc);
    let amcName = parserAmc !== 'Unknown' ? parserAmc : extractAmcFromFundName(fund.name);
    const amcId = amcIdByName[amcName];
    if (!amcId) continue;

    await sql`
      INSERT INTO funds (
        scheme_code, name, slug, amc_id, category, risk_level, rating, aum, is_active
      ) VALUES (
        ${fund.schemeCode || null},
        ${fund.name},
        ${fund.dbSlug},
        ${amcId},
        ${fund.category},
        ${fund.riskLevel || 'moderate'},
        ${fund.rating},
        ${parseAum(fund.aum)},
        true
      )
      ON CONFLICT (slug) DO UPDATE SET
        scheme_code = EXCLUDED.scheme_code,
        name = EXCLUDED.name,
        amc_id = EXCLUDED.amc_id,
        category = EXCLUDED.category,
        risk_level = EXCLUDED.risk_level,
        rating = EXCLUDED.rating,
        aum = EXCLUDED.aum,
        is_active = true,
        updated_at = NOW()
    `;
    inserted++;
  }

  const fundRows = await sql`SELECT id, slug FROM funds`;
  const fundIdBySlug = Object.fromEntries(fundRows.map((r) => [r.slug, r.id]));

  let returnsCount = 0;
  let navCount = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const fund of curated) {
    const fundId = fundIdBySlug[fund.dbSlug];
    if (!fundId) continue;

    if (fund.returns1y != null || fund.returns3y != null || fund.returns5y != null) {
      await sql`
        INSERT INTO fund_returns (fund_id, returns_1y, returns_3y, returns_5y, last_computed)
        VALUES (${fundId}, ${fund.returns1y}, ${fund.returns3y}, ${fund.returns5y}, NOW())
        ON CONFLICT (fund_id) DO UPDATE SET
          returns_1y = EXCLUDED.returns_1y,
          returns_3y = EXCLUDED.returns_3y,
          returns_5y = EXCLUDED.returns_5y,
          last_computed = NOW()
      `;
      returnsCount++;
    }

    if (fund.nav != null && Number(fund.nav) > 0) {
      await sql`
        INSERT INTO fund_navs (fund_id, date, nav)
        VALUES (${fundId}, ${today}::DATE, ${fund.nav})
        ON CONFLICT (fund_id, date) DO UPDATE SET nav = EXCLUDED.nav
      `;
      navCount++;
    }
  }

  console.log(`\n  ✅ Funds inserted/updated: ${inserted}`);
  console.log(`  ✅ Fund returns:          ${returnsCount}`);
  console.log(`  ✅ Fund NAVs:             ${navCount}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('❌ seed-curated-mf failed:', err.message);
  process.exit(1);
});
