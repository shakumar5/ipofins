#!/usr/bin/env node
/**
 * Post-pipeline data quality checks for Super Investors / 1% Club.
 * Usage: node scripts/node-with-ca.mjs scripts/validate-si-data.mjs
 */

import { sql, isDbConfigured } from './lib/db.mjs';

async function main() {
  if (!isDbConfigured()) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  console.log('══════════════════════════════════════════════════');
  console.log('  SI / 1% Club data quality validation');
  console.log('══════════════════════════════════════════════════\n');

  let failed = 0;

  const [{ latest }] = await sql`
    SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders
  `;
  console.log(`Latest SHP quarter: ${latest ?? 'none'}\n`);

  const misPromoters = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM shareholding_pattern_holders sph
    WHERE sph.quarter = ${latest}::date
      AND sph.is_promoter = false
      AND sph.holder_type = 'individual'
      AND sph.pct_of_company >= 10
  `;
  const mp = misPromoters[0]?.cnt ?? 0;
  console.log(`Individuals ≥10% marked non-promoter: ${mp}`);
  if (mp > 50) {
    console.log('  ⚠ High count — run pipeline:superinvestor after promoter parser fix');
    failed++;
  } else {
    console.log('  ✓ Within expected range');
  }

  const summaryCheck = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ABS(COALESCE(promoter_pct,0)+COALESCE(fii_pct,0)+COALESCE(mf_pct,0)+COALESCE(dii_ex_mf_pct,0)+COALESCE(retail_pct,0) - 100) > 1)::int AS bad_sum
    FROM stock_shp_summary
    WHERE quarter = ${latest}::date
  `;
  const sc = summaryCheck[0];
  console.log(`\nstock_shp_summary rows: ${sc?.total ?? 0}`);
  if ((sc?.total ?? 0) === 0) {
    console.log('  ⚠ No category summaries — run db:migrate-si + pipeline:superinvestor');
    failed++;
  } else {
    console.log(`  Category sum ≠100% (±1): ${sc?.bad_sum ?? 0} stocks`);
    if ((sc?.bad_sum ?? 0) > sc.total * 0.05) failed++;
    else console.log('  ✓ Most summaries balance to ~100%');
  }

  const abakkusOnSunil = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM shareholding_pattern_holders sph
    JOIN tracked_entities te ON te.id = sph.entity_id
    WHERE te.slug = 'sunil-singhania'
      AND sph.quarter = ${latest}::date
      AND sph.holder_name ILIKE '%abakkus%'
  `;
  const ab = abakkusOnSunil[0]?.cnt ?? 0;
  console.log(`\nAbakkus fund rows linked to Sunil Singhania: ${ab}`);
  if (ab > 0) {
    console.log('  ⚠ Run db:seed-superinvestors + backfill-entity-resolution');
    failed++;
  } else {
    console.log('  ✓ Sunil / Abakkus separated');
  }

  console.log(failed ? '\n❌ Validation issues found' : '\n✅ Validation passed');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
