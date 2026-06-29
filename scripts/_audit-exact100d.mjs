import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

// Still 100% on latest quarter for any stock+holder (should be 0)
const still = await sql`
  SELECT s.name, s.slug, sph.holder_name, sph.pct_of_company, sph.is_promoter
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE sph.quarter=${latest}::date AND sph.pct_of_company = 100
  ORDER BY s.name`;

// Mis-parse pattern: was 100 in older quarter, now 1.0 in latest (same holder+stock+shares)
const fixed = await sql`
  WITH bad AS (
    SELECT sph.stock_id, sph.holder_name, sph.shares, sph.quarter::text q, sph.pct_of_company
    FROM shareholding_pattern_holders sph
    WHERE sph.pct_of_company = 100 AND sph.is_promoter = false
  ), latest_rows AS (
    SELECT sph.stock_id, sph.holder_name, sph.shares, sph.pct_of_company
    FROM shareholding_pattern_holders sph
    WHERE sph.quarter = ${latest}::date AND sph.pct_of_company = 1.0 AND sph.is_promoter = false
  )
  SELECT DISTINCT s.name stock_name, s.slug stock_slug, b.holder_name, b.q bad_quarter, l.pct_of_company latest_pct
  FROM bad b
  JOIN latest_rows l ON l.stock_id=b.stock_id AND l.holder_name=b.holder_name AND l.shares=b.shares
  JOIN stocks s ON s.id=b.stock_id
  ORDER BY s.name, b.holder_name`;

console.log('STILL_100_LATEST_QUARTER', still.length);
still.forEach(r => console.log(`${r.name}|${r.slug}|${r.holder_name}`));

console.log('\nMISPARSE_FIXED_TO_1PCT_LATEST', fixed.length);
fixed.forEach(r => console.log(`${r.stock_name}|${r.stock_slug}|${r.holder_name}|was100in=${r.bad_quarter}|now=${r.latest_pct}`));

// entity_holdings latest = 100
const eh = await sql`
  SELECT s.name, s.slug, COALESCE(te.display_name, te.name) entity_name, eh.pct_of_company
  FROM entity_holdings eh JOIN stocks s ON s.id=eh.stock_id
  LEFT JOIN tracked_entities te ON te.id=eh.entity_id
  WHERE eh.quarter=${latest}::date AND eh.strategy_id IS NULL AND eh.pct_of_company = 100
  ORDER BY s.name`;
console.log('\nENTITY_HOLDINGS_100_LATEST', eh.length);
eh.forEach(r => console.log(`${r.name}|${r.slug}|${r.entity_name}|${r.pct_of_company}`));