import { sql, isDbConfigured } from './lib/db.mjs';
import { stockListingKeySql, holderFilingKeySql } from './lib/stock-listing-key.mjs';
if (!isDbConfigured()) { console.error('no db'); process.exit(1); }

const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

const latestExact100 = await sql`
  SELECT COUNT(*)::int AS cnt FROM shareholding_pattern_holders
  WHERE quarter = ${latest}::date AND pct_of_company = 100`;
const latestExact100Np = await sql`
  SELECT COUNT(*)::int AS cnt FROM shareholding_pattern_holders
  WHERE quarter = ${latest}::date AND pct_of_company = 100 AND is_promoter = FALSE`;

const allExact100 = await sql`SELECT COUNT(*)::int AS cnt FROM shareholding_pattern_holders WHERE pct_of_company = 100`;
const allExact100Np = await sql`
  SELECT COUNT(*)::int AS cnt FROM shareholding_pattern_holders WHERE pct_of_company = 100 AND is_promoter = FALSE`;

const q1Np = await sql`
  SELECT COUNT(*)::int AS cnt FROM shareholding_pattern_holders
  WHERE quarter = '2025-04-01'::date AND pct_of_company = 100 AND is_promoter = FALSE`;

const LK = stockListingKeySql('s');
const FK = holderFilingKeySql('sph.holder_name');
const uiLatest = await sql`
  WITH base AS (
    SELECT sph.id, s.slug stock_slug, s.name stock_name, sph.holder_name, sph.is_promoter, sph.pct_of_company,
      ${sql.unsafe(LK)} listing_key, ${sql.unsafe(FK)} filing_key
    FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
    WHERE sph.quarter = ${latest}::date AND sph.pct_of_company >= 1.0
  ), ranked AS (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY listing_key, filing_key ORDER BY pct_of_company DESC NULLS LAST, id DESC) rn FROM base b
  )
  SELECT COUNT(*)::int AS cnt FROM ranked WHERE rn=1 AND pct_of_company = 100`;
const uiLatestNp = await sql`
  WITH base AS (
    SELECT sph.id, sph.is_promoter, sph.pct_of_company,
      ${sql.unsafe(LK)} listing_key, ${sql.unsafe(FK)} filing_key
    FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
    WHERE sph.quarter = ${latest}::date AND sph.pct_of_company >= 1.0
  ), ranked AS (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY listing_key, filing_key ORDER BY pct_of_company DESC NULLS LAST, id DESC) rn FROM base b
  )
  SELECT COUNT(*)::int AS cnt FROM ranked WHERE rn=1 AND pct_of_company = 100 AND is_promoter = FALSE`;

console.log('LATEST_QUARTER', latest);
console.log('RAW_EXACTLY_100_LATEST_ALL', latestExact100[0].cnt);
console.log('RAW_EXACTLY_100_LATEST_NON_PROMOTER', latestExact100Np[0].cnt);
console.log('UI_DEDUPED_EXACTLY_100_LATEST_ALL', uiLatest[0].cnt);
console.log('UI_DEDUPED_EXACTLY_100_LATEST_NON_PROMOTER', uiLatestNp[0].cnt);
console.log('ALL_QUARTERS_EXACTLY_100_ALL', allExact100[0].cnt);
console.log('ALL_QUARTERS_EXACTLY_100_NON_PROMOTER', allExact100Np[0].cnt);
console.log('2025-04-01_EXACTLY_100_NON_PROMOTER', q1Np[0].cnt);