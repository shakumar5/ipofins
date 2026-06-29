import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);
const rows = await sql`
  SELECT s.name, s.slug, sph.holder_name, sph.quarter::text q, sph.pct_of_company, sph.shares, sph.is_promoter
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE sph.pct_of_company = 100
  ORDER BY sph.quarter DESC, s.name LIMIT 20`;
console.log('exactly 100 count sample:', rows.length);
rows.forEach(r => console.log(`${r.q}|${r.is_promoter?'P':'NP'}|${r.name}|${r.holder_name}|shares=${r.shares}`));