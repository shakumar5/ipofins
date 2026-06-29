import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;
const all = await sql`
  SELECT s.name stock_name, s.slug stock_slug, sph.holder_name, sph.is_promoter, sph.quarter::text q
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE sph.pct_of_company = 100
  ORDER BY sph.quarter DESC, s.name`;
const latestOnly = all.filter(r => r.q === latest);
console.log('EXACT_100_LATEST', latestOnly.length);
latestOnly.forEach(r => console.log(`${r.stock_name}|${r.holder_name}|${r.is_promoter?'promoter':'non-promoter'}`));