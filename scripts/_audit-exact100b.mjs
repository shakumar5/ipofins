import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

// exact 100 in numeric column
const ex = await sql`
  SELECT s.name, s.slug, sph.holder_name, sph.pct_of_company::text pct_txt, sph.is_promoter
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE sph.pct_of_company::numeric = 100 ORDER BY sph.quarter DESC, s.name`;
console.log('EXACT_100_ALL_QUARTERS', ex.length);
ex.forEach(r => console.log(`${r.name}|${r.slug}|${r.holder_name}|${r.pct_txt}`));

// summary fields = 100
const sum = await sql`
  SELECT s.name, s.slug, ss.promoter_pct, ss.individuals_gte1_pct, ss.public_pct, ss.total_pct, ss.quarter::text
  FROM stock_shp_summary ss JOIN stocks s ON s.id=ss.stock_id
  WHERE ss.quarter=${latest}::date AND (
    ss.promoter_pct = 100 OR ss.individuals_gte1_pct = 100 OR ss.public_pct = 100 OR ss.total_pct = 100
    OR ss.fii_pct = 100 OR ss.mf_pct = 100 OR ss.dii_ex_mf_pct = 100 OR ss.retail_pct = 100
  ) ORDER BY s.name`;
console.log('\nSUMMARY_FIELD_EXACTLY_100', sum.length);
sum.forEach(r => console.log(JSON.stringify(r)));

// siyaram summary
const si = await sql`
  SELECT s.slug, ss.*::text FROM stock_shp_summary ss JOIN stocks s ON s.id=ss.stock_id
  WHERE s.slug='siyaram-silk-mills-limited' ORDER BY ss.quarter DESC LIMIT 3`;
console.log('\nSIYARAM_SUMMARY_ROWS', si.length);