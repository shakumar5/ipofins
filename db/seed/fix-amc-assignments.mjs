/**
 * Fix AMC assignments in DB and add missing smaller/new AMCs.
 * Also inserts equity funds from fund-holdings.json not yet in master.
 *
 * Usage: node --use-system-ca db/seed/fix-amc-assignments.mjs
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import {
  slugify,
  CANONICAL_AMCS,
  extractAmcFromFundName,
  canonicalParserAmc,
  inferCategoryFromFundName,
} from '../../scripts/lib/amc-resolve.mjs';
import { buildFundMatcher, normalizeFundName } from '../../scripts/lib/fund-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const sql = neon(env.match(/DATABASE_URL=(.+)/)[1].trim());

async function ensureAmcs() {
  console.log('\n  📦 Ensuring AMC records...');
  for (const name of CANONICAL_AMCS) {
    await sql`
      INSERT INTO amcs (name, slug, short_name)
      VALUES (${name}, ${slugify(name)}, ${name.substring(0, 30)})
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    `;
  }
  const rows = await sql`SELECT id, name, slug FROM amcs`;
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.id]));
  const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
  console.log(`    ${rows.length} AMCs in DB`);
  return { byName, bySlug, rows };
}

async function reassignFundAmcs(amcByName) {
  console.log('\n  🔄 Reassigning fund AMCs from fund names...');
  const funds = await sql`SELECT id, name, slug, amc_id FROM funds`;
  const updates = [];

  for (const fund of funds) {
    const amcName = extractAmcFromFundName(fund.name);
    const amcId = amcByName[amcName];
    if (!amcId || amcId === fund.amc_id) continue;
    updates.push({ fundId: fund.id, amcId, amcName });
  }

  if (updates.length === 0) {
    console.log('    No AMC changes needed');
    return;
  }

  process.env.DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
  const { batchUpdateFundAmcs, closePgPool } = await import('../../scripts/lib/pg-bulk.mjs');
  const updated = await batchUpdateFundAmcs(updates);
  await closePgPool();

  const counts = {};
  for (const u of updates) counts[u.amcName] = (counts[u.amcName] || 0) + 1;
  console.log(`    Updated ${updated} funds`);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (top.length) console.log('    Top moves:', Object.fromEntries(top));
}

async function syncHoldingsFunds(amcByName, amcRows) {
  const holdingsPath = join(ROOT, 'src/data/fund-holdings.json');
  if (!existsSync(holdingsPath)) {
    console.log('\n  ⚠️  No fund-holdings.json — skip sync');
    return;
  }

  console.log('\n  ➕ Syncing missing funds from holdings JSON...');
  const data = JSON.parse(readFileSync(holdingsPath, 'utf-8'));
  const existing = await sql`SELECT slug FROM funds`;
  const existingSlugs = new Set(existing.map((r) => r.slug));
  const resolveFundId = buildFundMatcher(
    await sql`SELECT id, slug, name, amc_id FROM funds`,
    amcRows
  );

  const mfPath = join(ROOT, 'src/data/mutual-funds.json');
  const mutualFunds = existsSync(mfPath) ? JSON.parse(readFileSync(mfPath, 'utf-8')) : [];
  const mfSlugs = new Set(mutualFunds.map((f) => f.slug));

  let inserted = 0;
  let skipped = 0;

  for (const [slug, fd] of Object.entries(data.holdings || {})) {
    if (existingSlugs.has(slug) || resolveFundId(slug, fd)) continue;

    const parserAmc = canonicalParserAmc(fd.amc);
    let amcName = parserAmc;
    if (parserAmc === 'Unknown' || !amcByName[parserAmc]) {
      amcName = extractAmcFromFundName(fd.name);
    }
    const amcId = amcByName[amcName];
    if (!amcId || amcName === 'Other') {
      skipped++;
      continue;
    }

    const category = inferCategoryFromFundName(fd.name);
    try {
      await sql`
        INSERT INTO funds (name, slug, amc_id, category, risk_level, rating, is_active)
        VALUES (${fd.name}, ${slug}, ${amcId}, ${category}, 'moderate', null, true)
        ON CONFLICT (slug) DO UPDATE SET amc_id = EXCLUDED.amc_id, category = EXCLUDED.category
      `;
      inserted++;
      existingSlugs.add(slug);

      if (!mfSlugs.has(slug)) {
        mutualFunds.push({
          name: fd.name,
          slug,
          category,
          nav: 0,
          returns1y: null,
          returns3y: null,
          returns5y: null,
          aum: null,
          riskLevel: 'moderate',
          rating: null,
          schemeCode: '',
          lastUpdated: new Date().toISOString(),
        });
        mfSlugs.add(slug);
      }
    } catch {
      skipped++;
    }
  }

  if (inserted > 0) {
    writeFileSync(mfPath, JSON.stringify(mutualFunds, null, 2));
    console.log(`    Inserted ${inserted} funds (also appended to mutual-funds.json)`);
  } else {
    console.log('    No new funds to insert');
  }
  if (skipped > 0) console.log(`    Skipped ${skipped} (unknown AMC or insert error)`);
}

async function reportOther(amcByName) {
  const otherId = amcByName['Other'];
  if (!otherId) return;
  const [latest] = await sql`SELECT MAX(month) AS month FROM fund_holdings`;
  const remaining = await sql`
    SELECT COUNT(DISTINCT f.id)::int AS cnt
    FROM funds f
    JOIN fund_holdings fh ON fh.fund_id = f.id AND fh.month = ${latest.month}
    WHERE f.amc_id = ${otherId}
  `;
  console.log(`\n  📊 Funds still in "Other" with latest holdings: ${remaining[0]?.cnt ?? 0}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Fix AMC assignments + sync holdings funds');
  console.log('═══════════════════════════════════════════════════════════');

  const { byName, rows } = await ensureAmcs();
  await reassignFundAmcs(byName);
  await syncHoldingsFunds(byName, rows);
  await reportOther(byName);

  console.log('\n  ✅ Done — run npm run pipeline:monthly to refresh holdings\n');
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
