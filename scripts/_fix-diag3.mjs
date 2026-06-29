import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);
const rows = await sql`
  SELECT sph.quarter::text q, sph.pct_of_company, sph.shares
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE s.slug='aarti-industries-ltd' AND sph.holder_name ILIKE '%quant mutual%'
  ORDER BY sph.quarter`;
console.log(rows);