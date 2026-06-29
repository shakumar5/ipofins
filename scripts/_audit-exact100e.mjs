import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

const ehKedia = await sql`
  SELECT s.name, s.slug, eh.pct_of_company, eh.quarter::text q, ec.change_type, ec.pct_change
  FROM entity_holdings eh
  JOIN tracked_entities te ON te.id=eh.entity_id
  JOIN stocks s ON s.id=eh.stock_id
  LEFT JOIN entity_changes ec ON ec.entity_id=eh.entity_id AND ec.stock_id=eh.stock_id AND ec.quarter=eh.quarter AND ec.strategy_id IS NULL
  WHERE te.slug='vijay-kedia' AND s.slug LIKE '%siyaram%'
  ORDER BY eh.quarter DESC`;
console.log('KEDIA_EH_SIYARAM');
ehKedia.forEach(r => console.log(JSON.stringify(r)));

// All exact 100 in shareholding_pattern_holders for quarter 2025-04-01 only (the bad quarter)
const q1 = await sql`
  SELECT s.name stock_name, s.slug stock_slug, sph.holder_name, sph.is_promoter
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE sph.quarter='2025-04-01'::date AND sph.pct_of_company = 100 AND sph.is_promoter = false
  ORDER BY s.name`;
console.log('\nEXACT_100_IN_2025-04-01_NON_PROMOTER', q1.length);
q1.forEach(r => console.log(`${r.stock_name}|${r.stock_slug}|${r.holder_name}`));