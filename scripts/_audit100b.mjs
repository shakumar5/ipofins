import { sql, isDbConfigured } from './lib/db.mjs';
import { stockListingKeySql } from './lib/stock-listing-key.mjs';
if (!isDbConfigured()) process.exit(1);
const LK = stockListingKeySql('s');
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

// Any row exactly 100 for siyaram
const s100 = await sql`
  SELECT s.slug, s.name, sph.holder_name, sph.pct_of_company, sph.is_promoter, sph.holder_type, te.slug entity_slug
  FROM shareholding_pattern_holders sph
  JOIN stocks s ON s.id = sph.stock_id
  LEFT JOIN tracked_entities te ON te.id = sph.entity_id
  WHERE sph.quarter = ${latest}::date AND (s.name ILIKE '%siyaram%' OR s.slug ILIKE '%siyaram%')
    AND sph.pct_of_company >= 99.5
  ORDER BY sph.pct_of_company DESC`;
console.log('Siyaram rows pct>=99.5:', s100.length);
s100.forEach(r => console.log(JSON.stringify(r)));

// entity_holdings for siyaram
const eh = await sql`
  SELECT s.slug, s.name stock_name, COALESCE(te.display_name, te.name) entity_name, te.slug entity_slug,
         eh.pct_of_company, eh.shares_held, eh.source_holder_name
  FROM entity_holdings eh
  JOIN stocks s ON s.id = eh.stock_id
  LEFT JOIN tracked_entities te ON te.id = eh.entity_id
  WHERE eh.quarter = ${latest}::date AND eh.strategy_id IS NULL
    AND (s.name ILIKE '%siyaram%' OR s.slug ILIKE '%siyaram%')
  ORDER BY eh.pct_of_company DESC`;
console.log('\nentity_holdings Siyaram rows:', eh.length);
eh.forEach(r => console.log(`${r.pct_of_company}% | ${r.entity_name ?? r.source_holder_name} (${r.entity_slug}) | ${r.stock_name} (${r.slug})`));

// Rolled up entity totals for siyaram stocks
const roll = await sql`
  SELECT s.slug, s.name stock_name, COALESCE(te.display_name, te.name) entity_name, te.slug entity_slug,
         ROUND(SUM(eh.pct_of_company)::numeric,3) total_pct, COUNT(*) rows
  FROM entity_holdings eh
  JOIN stocks s ON s.id = eh.stock_id
  LEFT JOIN tracked_entities te ON te.id = eh.entity_id
  WHERE eh.quarter = ${latest}::date AND eh.strategy_id IS NULL
    AND (s.name ILIKE '%siyaram%' OR s.slug ILIKE '%siyaram%')
  GROUP BY s.slug, s.name, te.display_name, te.name, te.slug
  ORDER BY total_pct DESC`;
console.log('\nentity_holdings rollup Siyaram:');
roll.forEach(r => console.log(`${r.total_pct}% (${r.rows} rows) | ${r.entity_name} | ${r.stock_name}`));

// All entity_holdings >=99 anywhere
const allEh = await sql`
  SELECT s.slug, s.name stock_name, COALESCE(te.display_name, te.name) entity_name, te.slug entity_slug,
         ROUND(SUM(eh.pct_of_company)::numeric,3) total_pct, COUNT(*) rows
  FROM entity_holdings eh
  JOIN stocks s ON s.id = eh.stock_id
  LEFT JOIN tracked_entities te ON te.id = eh.entity_id
  WHERE eh.quarter = ${latest}::date AND eh.strategy_id IS NULL
  GROUP BY s.slug, s.name, te.display_name, te.name, te.slug
  HAVING SUM(eh.pct_of_company) >= 99
  ORDER BY total_pct DESC`;
console.log('\nAll entity_holdings rollup >=99%:', allEh.length);
allEh.forEach(r => console.log(`${r.total_pct}% | ${r.stock_name} (${r.slug}) | ${r.entity_name} (${r.entity_slug})`));

// Vijay Kedia on siyaram across quarters
const vk = await sql`
  SELECT s.slug, sph.quarter::text q, sph.holder_name, sph.pct_of_company, sph.shares, sph.is_promoter
  FROM shareholding_pattern_holders sph
  JOIN stocks s ON s.id = sph.stock_id
  WHERE s.slug ILIKE '%siyaram-silk%' AND sph.holder_name ILIKE '%kedia%'
  ORDER BY sph.quarter DESC`;
console.log('\nVijay Kedia on Siyaram Silk across quarters:');
vk.forEach(r => console.log(`${r.q} | ${r.pct_of_company}% | ${r.holder_name} | shares=${r.shares}`));

// pct exactly 100 in entire table latest quarter
const exact100 = await sql`
  SELECT COUNT(*)::int cnt FROM shareholding_pattern_holders
  WHERE quarter=${latest}::date AND pct_of_company = 100`;
console.log('\nRows with exactly 100.0%:', exact100[0].cnt);

const exact100list = await sql`
  SELECT s.name, s.slug, sph.holder_name, sph.pct_of_company, sph.is_promoter
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE sph.quarter=${latest}::date AND sph.pct_of_company = 100
  ORDER BY s.name LIMIT 50`;
console.log('Exactly 100% list:', exact100list.length);
exact100list.forEach(r => console.log(`${r.pct_of_company}% | ${r.stock_name} | ${r.holder_name}`));