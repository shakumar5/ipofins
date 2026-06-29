import { sql, isDbConfigured } from './lib/db.mjs';
import { stockListingKeySql, holderFilingKeySql } from './lib/stock-listing-key.mjs';
if (!isDbConfigured()) process.exit(1);
const LK = stockListingKeySql('s');
const FK = holderFilingKeySql('sph.holder_name');
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

const latest100 = await sql`
  SELECT s.name stock_name, s.slug stock_slug, sph.holder_name, sph.pct_of_company, sph.is_promoter, te.slug entity_slug
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  LEFT JOIN tracked_entities te ON te.id=sph.entity_id
  WHERE sph.quarter=${latest}::date AND sph.pct_of_company = 100
  ORDER BY s.name, sph.holder_name`;
console.log('LATEST_QUARTER', latest);
console.log('HOLDER_PCT_EXACTLY_100', latest100.length);
latest100.forEach(r => console.log(`${r.stock_name}|${r.stock_slug}|${r.holder_name}|${r.is_promoter?'promoter':'non-promoter'}|${r.entity_slug||''}`));

// UI deduped latest only
const ui = await sql`
  WITH base AS (
    SELECT sph.id, s.slug stock_slug, s.name stock_name, sph.holder_name, sph.is_promoter, sph.pct_of_company, te.slug entity_slug,
      ${sql.unsafe(LK)} listing_key, ${sql.unsafe(FK)} filing_key
    FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
    LEFT JOIN tracked_entities te ON te.id=sph.entity_id
    WHERE sph.quarter=${latest}::date AND sph.pct_of_company >= 1.0
  ), ranked AS (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY listing_key, filing_key ORDER BY pct_of_company DESC NULLS LAST, id DESC) rn FROM base b
  )
  SELECT stock_name, stock_slug, holder_name, is_promoter, pct_of_company, entity_slug FROM ranked WHERE rn=1 AND pct_of_company=100 ORDER BY stock_name`;
console.log('\nUI_SHOWN_EXACTLY_100', ui.length);
ui.forEach(r => console.log(`${r.stock_name}|${r.stock_slug}|${r.holder_name}|${r.is_promoter?'promoter':'non-promoter'}|${r.entity_slug||''}`));

// Kedia siyaram all quarters
const vk = await sql`
  SELECT sph.quarter::text q, sph.pct_of_company, sph.shares, sph.is_promoter
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  WHERE s.slug='siyaram-silk-mills-limited' AND sph.holder_name ILIKE '%kedia%'
  ORDER BY sph.quarter DESC`;
console.log('\nKEDIA_SIYARAM_HISTORY');
vk.forEach(r => console.log(`${r.q}|${r.pct_of_company}%|shares=${r.shares}`));