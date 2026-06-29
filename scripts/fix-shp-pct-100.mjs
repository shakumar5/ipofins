#!/usr/bin/env node
/**
 * Backfill pct_of_company rows mis-parsed as 100% when XBRL stored 1.0 (= 1%).
 *
 * Pass 1: copy stake from earliest later quarter (same stock + holder, pct < 20%).
 * Pass 2: orphan historical rows still at 100% → 1.0 (XBRL 1% mis-parse, not in latest quarter).
 *
 * Usage: npm run db:fix-shp-pct-100
 * Then:  npm run db:compute-si:all
 */
import { sql, isDbConfigured } from './lib/db.mjs';

async function main() {
  if (!isDbConfigured()) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  console.log('Fixing mis-parsed 100% SHP rows (1.0 XBRL → 1%)...\n');

  const sph1 = await sql`
    UPDATE shareholding_pattern_holders sph
    SET pct_of_company = sub.fix_pct
    FROM (
      SELECT DISTINCT ON (sph.id)
        sph.id,
        nxt.pct_of_company AS fix_pct
      FROM shareholding_pattern_holders sph
      JOIN shareholding_pattern_holders nxt
        ON nxt.stock_id = sph.stock_id
       AND nxt.holder_name = sph.holder_name
       AND nxt.quarter > sph.quarter
       AND nxt.pct_of_company > 0
       AND nxt.pct_of_company < 20
      WHERE sph.pct_of_company >= 99
      ORDER BY sph.id, nxt.quarter ASC
    ) sub
    WHERE sph.id = sub.id
    RETURNING sph.id
  `;

  const eh1 = await sql`
    UPDATE entity_holdings eh
    SET pct_of_company = sub.fix_pct
    FROM (
      SELECT DISTINCT ON (eh.id)
        eh.id,
        nxt.pct_of_company AS fix_pct
      FROM entity_holdings eh
      JOIN entity_holdings nxt
        ON nxt.entity_id = eh.entity_id
       AND nxt.stock_id = eh.stock_id
       AND nxt.strategy_id IS NOT DISTINCT FROM eh.strategy_id
       AND nxt.quarter > eh.quarter
       AND nxt.pct_of_company > 0
       AND nxt.pct_of_company < 20
      WHERE eh.pct_of_company >= 99
      ORDER BY eh.id, nxt.quarter ASC
    ) sub
    WHERE eh.id = sub.id
    RETURNING eh.id
  `;

  console.log(`  Pass 1 — shareholding_pattern_holders: ${sph1.length} rows`);
  console.log(`  Pass 1 — entity_holdings: ${eh1.length} rows`);

  const sph2 = await sql`
    UPDATE shareholding_pattern_holders sph
    SET pct_of_company = 1.0
    WHERE sph.pct_of_company >= 99
      AND sph.is_promoter = FALSE
      AND sph.quarter < (SELECT MAX(quarter) FROM shareholding_pattern_holders)
    RETURNING sph.id
  `;

  const eh2 = await sql`
    UPDATE entity_holdings eh
    SET pct_of_company = 1.0
    WHERE eh.pct_of_company >= 99
      AND eh.quarter < (SELECT MAX(quarter) FROM entity_holdings)
    RETURNING eh.id
  `;

  console.log(`  Pass 2 (orphan historical) — shareholding_pattern_holders: ${sph2.length} rows`);
  console.log(`  Pass 2 (orphan historical) — entity_holdings: ${eh2.length} rows`);

  const [{ remaining }] = await sql`
    SELECT COUNT(*)::int AS remaining
    FROM shareholding_pattern_holders
    WHERE pct_of_company = 100 AND is_promoter = FALSE
  `;
  console.log(`\nRemaining non-promoter sph rows at exactly 100%: ${remaining}`);
  console.log('\nDone. Re-run: npm run db:compute-si:all');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
