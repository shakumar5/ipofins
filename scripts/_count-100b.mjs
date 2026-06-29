import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);
const stocks = await sql`
  SELECT COUNT(DISTINCT s.slug)::int AS stocks, COUNT(*)::int AS rows
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE sph.pct_of_company = 100 AND sph.is_promoter = FALSE`;
console.log('remaining NP 100: rows=' + stocks[0].rows + ' unique_stocks=' + stocks[0].stocks);
const list = await sql`
  SELECT s.name, s.slug, sph.holder_name, sph.quarter::text q
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE sph.pct_of_company = 100 AND sph.is_promoter = FALSE
  ORDER BY s.name LIMIT 30`;
list.forEach(r => console.log(r.q + '|' + r.name + '|' + r.holder_name));