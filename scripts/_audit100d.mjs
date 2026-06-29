import { sql, isDbConfigured } from './lib/db.mjs';
import { stockListingKeySql, holderFilingKeySql } from './lib/stock-listing-key.mjs';
if (!isDbConfigured()) process.exit(1);
const LK = stockListingKeySql('s');
const FK = holderFilingKeySql('sph.holder_name');
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

// Holder positions map style: entity rollup per stock listing_key
const rolled = await sql`
  WITH latest AS (SELECT ${latest}::date AS q),
  raw AS (
    SELECT te.slug entity_slug, COALESCE(te.display_name, te.name) entity_name,
      sph.holder_name, ${sql.unsafe(LK)} listing_key, ${sql.unsafe(FK)} filing_key,
      s.slug stock_slug, s.name stock_name, sph.pct_of_company, sph.shares, sph.stock_id
    FROM shareholding_pattern_holders sph
    JOIN stocks s ON s.id = sph.stock_id
    LEFT JOIN tracked_entities te ON te.id = sph.entity_id
    WHERE sph.quarter = (SELECT q FROM latest) AND sph.is_promoter = FALSE AND sph.pct_of_company >= 1.0
  ),
  deduped AS (
    SELECT DISTINCT ON (listing_key, filing_key) * FROM raw
    ORDER BY listing_key, filing_key, pct_of_company DESC NULLS LAST, stock_id ASC
  ),
  curated AS (
    SELECT entity_slug, entity_name, listing_key, stock_slug, stock_name,
      ROUND(SUM(pct_of_company)::numeric, 3) pct FROM deduped
    WHERE entity_slug IS NOT NULL GROUP BY entity_slug, entity_name, listing_key, stock_slug, stock_name
  ),
  mystery AS (
    SELECT NULL entity_slug, holder_name entity_name, listing_key, stock_slug, stock_name, pct_of_company pct
    FROM deduped WHERE entity_slug IS NULL
  )
  SELECT * FROM curated UNION ALL SELECT * FROM mystery
`;
const bad = rolled.filter(r => Number(r.pct) >= 99);
console.log('Holder positions map style >=99%:', bad.length);
bad.forEach(r => console.log(`${r.pct}% | ${r.entity_name} (${r.entity_slug}) | ${r.stock_name} (${r.stock_slug})`));

// pct exactly 1.0 in sph (possible 1% misread as 100% in some UI)
const onePct = await sql`
  SELECT s.name, s.slug, sph.holder_name, sph.pct_of_company, te.slug entity_slug
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  LEFT JOIN tracked_entities te ON te.id=sph.entity_id
  WHERE sph.quarter=${latest}::date AND sph.is_promoter=false AND sph.pct_of_company = 1.0
  ORDER BY s.name`;
console.log('\nNon-promoter exactly 1.0% rows:', onePct.length);
onePct.slice(0,30).forEach(r => console.log(`${r.name} (${r.slug}) | ${r.holder_name} | entity=${r.entity_slug}`));
if (onePct.length>30) console.log(`... and ${onePct.length-30} more`);

// siyaram on silk mills only
const ss = await sql`
  SELECT sph.holder_name, sph.pct_of_company, te.slug entity_slug
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  LEFT JOIN tracked_entities te ON te.id=sph.entity_id
  WHERE sph.quarter=${latest}::date AND s.slug='siyaram-silk-mills-limited' AND sph.is_promoter=false
  ORDER BY sph.pct_of_company DESC`;
console.log('\nSiyaram Silk Mills non-promoter holders:');
ss.forEach(r => console.log(`${r.pct_of_company}% | ${r.holder_name} | ${r.entity_slug}`));