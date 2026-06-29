import { sql, isDbConfigured } from './lib/db.mjs';
import { stockListingKeySql, holderFilingKeySql } from './lib/stock-listing-key.mjs';
if (!isDbConfigured()) process.exit(1);
const LK = stockListingKeySql('s');
const FK = holderFilingKeySql('sph.holder_name');
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

// Unique stocks with any non-promoter holder >= 99% after UI dedupe
const uiNp = await sql`
  WITH base AS (
    SELECT sph.id, s.slug stock_slug, s.name stock_name, sph.holder_name, sph.pct_of_company,
      ${sql.unsafe(LK)} listing_key, ${sql.unsafe(FK)} filing_key
    FROM shareholding_pattern_holders sph JOIN stocks s ON s.id = sph.stock_id
    WHERE sph.quarter = ${latest}::date AND sph.is_promoter = FALSE AND sph.pct_of_company >= 1.0
  ), ranked AS (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY listing_key, filing_key ORDER BY pct_of_company DESC NULLS LAST, id DESC) rn FROM base b
  )
  SELECT DISTINCT stock_slug, stock_name, holder_name, pct_of_company
  FROM ranked WHERE rn = 1 AND pct_of_company >= 99 ORDER BY stock_name`;

console.log('STOCKS_WITH_99_PLUS_NON_PROMOTER');
uiNp.forEach(r => console.log(`${r.stock_name}|${r.stock_slug}|${r.holder_name}|${r.pct_of_company}`));

// Unique stocks any holder >=99 deduped
const uiAll = await sql`
  WITH base AS (
    SELECT sph.id, s.slug stock_slug, s.name stock_name, sph.holder_name, sph.is_promoter, sph.pct_of_company,
      ${sql.unsafe(LK)} listing_key, ${sql.unsafe(FK)} filing_key
    FROM shareholding_pattern_holders sph JOIN stocks s ON s.id = sph.stock_id
    WHERE sph.quarter = ${latest}::date AND sph.pct_of_company >= 1.0
  ), ranked AS (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY listing_key, filing_key ORDER BY pct_of_company DESC NULLS LAST, id DESC) rn FROM base b
  )
  SELECT DISTINCT stock_slug, stock_name, holder_name, is_promoter, pct_of_company
  FROM ranked WHERE rn = 1 AND pct_of_company >= 99 ORDER BY stock_name`;
console.log('\nSTOCKS_WITH_99_PLUS_ANY');
uiAll.forEach(r => console.log(`${r.stock_name}|${r.stock_slug}|${r.holder_name}|${r.is_promoter?'promoter':'non-promoter'}|${r.pct_of_company}`));

// Rows where pct=100 OR (pct=1.0 and could be mis-displayed) on siyaram silk mills
const silk = await sql`
  SELECT holder_name, pct_of_company, shares, is_promoter FROM shareholding_pattern_holders sph
  JOIN stocks s ON s.id=sph.stock_id WHERE s.slug='siyaram-silk-mills-limited' AND sph.quarter=${latest}::date
  ORDER BY pct_of_company DESC`;
console.log('\nSIYARAM_SILK_ALL');
silk.forEach(r => console.log(`${r.holder_name}|${r.pct_of_company}|${r.is_promoter}|shares=${r.shares}`));