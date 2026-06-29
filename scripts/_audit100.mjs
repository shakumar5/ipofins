import { sql, isDbConfigured } from './lib/db.mjs';
import { stockListingKeySql, holderFilingKeySql } from './lib/stock-listing-key.mjs';

if (!isDbConfigured()) { console.error('no db'); process.exit(1); }

const STOCK_LISTING_KEY = stockListingKeySql('s');
const FILING_KEY = holderFilingKeySql('sph.holder_name');
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;
console.log('Latest SHP quarter:', latest, '\n');

const raw = await sql`
  SELECT s.slug, s.name AS stock_name, sph.holder_name, sph.holder_type, sph.is_promoter, sph.pct_of_company
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id = sph.stock_id
  WHERE sph.quarter = ${latest}::date AND sph.pct_of_company >= 99
  ORDER BY sph.pct_of_company DESC, s.name`;
console.log('=== Raw DB (pct >= 99%):', raw.length, '===');
raw.forEach(r => console.log(`${r.pct_of_company}% | ${r.is_promoter?'PROMOTER':r.holder_type} | ${r.stock_name} (${r.slug}) | ${r.holder_name}`));

const ui = await sql`
  WITH base AS (
    SELECT sph.id, s.slug stock_slug, s.name stock_name, sph.holder_name, sph.pct_of_company, sph.is_promoter,
      ${sql.unsafe(STOCK_LISTING_KEY)} listing_key, ${sql.unsafe(FILING_KEY)} filing_key
    FROM shareholding_pattern_holders sph JOIN stocks s ON s.id = sph.stock_id
    WHERE sph.quarter = ${latest}::date AND sph.pct_of_company >= 1.0
  ), ranked AS (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY listing_key, filing_key ORDER BY pct_of_company DESC NULLS LAST, id DESC) rn FROM base b
  )
  SELECT stock_slug, stock_name, holder_name, is_promoter, pct_of_company FROM ranked WHERE rn=1 AND pct_of_company >= 99 ORDER BY stock_name`;
console.log('\n=== UI stock pages (deduped, pct >= 99%):', ui.length, '===');
ui.forEach(r => console.log(`${r.pct_of_company}% | ${r.is_promoter?'PROMOTER':'non-promoter'} | ${r.stock_name} (${r.stock_slug}) | ${r.holder_name}`));

const uiNp = ui.filter(r => !r.is_promoter);
console.log('\n=== UI 1% Club only (non-promoter):', uiNp.length, '===');
uiNp.forEach(r => console.log(`${r.pct_of_company}% | ${r.stock_name} (${r.stock_slug}) | ${r.holder_name}`));

const siyaram = await sql`
  SELECT sph.holder_name, sph.pct_of_company, sph.is_promoter, sph.holder_type, s.slug
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id = sph.stock_id
  WHERE sph.quarter = ${latest}::date AND (s.name ILIKE '%siyaram%' OR s.slug ILIKE '%siyaram%')
  ORDER BY sph.pct_of_company DESC`;
console.log('\n=== Siyaram rows ===');
siyaram.forEach(r => console.log(`${r.pct_of_company}% | ${r.is_promoter?'PROMOTER':r.holder_type} | ${r.holder_name} | ${r.slug}`));

await sql.end();