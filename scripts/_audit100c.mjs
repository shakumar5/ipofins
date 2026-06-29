import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

const eh = await sql`
  SELECT s.slug, s.name stock_name, COALESCE(te.display_name, te.name) entity_name, te.slug entity_slug,
         eh.pct_of_company, eh.shares_held
  FROM entity_holdings eh
  JOIN stocks s ON s.id = eh.stock_id
  LEFT JOIN tracked_entities te ON te.id = eh.entity_id
  WHERE eh.quarter = ${latest}::date AND eh.strategy_id IS NULL
    AND (s.name ILIKE '%siyaram%' OR s.slug ILIKE '%siyaram%')
  ORDER BY eh.pct_of_company DESC`;
console.log('entity_holdings Siyaram:');
eh.forEach(r => console.log(`${r.pct_of_company}% | ${r.entity_name} (${r.entity_slug}) | ${r.stock_name}`));

const roll = await sql`
  SELECT s.slug, s.name stock_name, COALESCE(te.display_name, te.name) entity_name, te.slug entity_slug,
         ROUND(SUM(eh.pct_of_company)::numeric,3) total_pct, COUNT(*)::int rows
  FROM entity_holdings eh JOIN stocks s ON s.id = eh.stock_id
  LEFT JOIN tracked_entities te ON te.id = eh.entity_id
  WHERE eh.quarter = ${latest}::date AND eh.strategy_id IS NULL
    AND (s.name ILIKE '%siyaram%' OR s.slug ILIKE '%siyaram%')
  GROUP BY s.slug, s.name, te.display_name, te.name, te.slug ORDER BY total_pct DESC`;
console.log('\nrollup:');
roll.forEach(r => console.log(`${r.total_pct}% (${r.rows}) | ${r.entity_name} | ${r.stock_name}`));

const allEh = await sql`
  SELECT s.slug, s.name stock_name, COALESCE(te.display_name, te.name) entity_name, te.slug entity_slug,
         ROUND(SUM(eh.pct_of_company)::numeric,3) total_pct
  FROM entity_holdings eh JOIN stocks s ON s.id = eh.stock_id
  LEFT JOIN tracked_entities te ON te.id = eh.entity_id
  WHERE eh.quarter = ${latest}::date AND eh.strategy_id IS NULL
  GROUP BY s.slug, s.name, te.display_name, te.name, te.slug
  HAVING SUM(eh.pct_of_company) >= 99 ORDER BY total_pct DESC`;
console.log('\nAll entity rollup >=99%:', allEh.length);
allEh.forEach(r => console.log(`${r.total_pct}% | ${r.stock_name} (${r.slug}) | ${r.entity_name}`));

const exact100 = await sql`
  SELECT s.name, s.slug, sph.holder_name, sph.pct_of_company, sph.is_promoter, te.slug entity_slug
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  LEFT JOIN tracked_entities te ON te.id=sph.entity_id
  WHERE sph.quarter=${latest}::date AND sph.pct_of_company = 100 ORDER BY s.name`;
console.log('\nExactly 100% in sph:', exact100.length);
exact100.forEach(r => console.log(`${r.stock_name} | ${r.holder_name} | entity=${r.entity_slug}`));

const near100np = await sql`
  SELECT s.name, s.slug, sph.holder_name, sph.pct_of_company, te.slug entity_slug
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  LEFT JOIN tracked_entities te ON te.id=sph.entity_id
  WHERE sph.quarter=${latest}::date AND sph.is_promoter=false AND sph.pct_of_company >= 50
  ORDER BY sph.pct_of_company DESC`;
console.log('\nNon-promoter >=50%:', near100np.length);
near100np.forEach(r => console.log(`${r.pct_of_company}% | ${r.stock_name} (${r.slug}) | ${r.holder_name}`));

const kediaSi = await sql`
  SELECT te.slug, s.slug stock_slug, s.name stock, eh.pct_of_company, eh.quarter::text q
  FROM entity_holdings eh JOIN tracked_entities te ON te.id=eh.entity_id
  JOIN stocks s ON s.id=eh.stock_id
  WHERE te.slug='vijay-kishanlal-kedia' AND (s.slug ILIKE '%siyaram%' OR s.name ILIKE '%siyaram%')
  ORDER BY eh.quarter DESC`;
console.log('\nKedia entity_holdings siyaram:');
kediaSi.forEach(r => console.log(`${r.q} | ${r.pct_of_company}% | ${r.stock} (${r.stock_slug})`));