import { sql, isDbConfigured } from './lib/db.mjs';
import { stockListingKeySql, holderFilingKeySql } from './lib/stock-listing-key.mjs';
if (!isDbConfigured()) process.exit(1);
const LK = stockListingKeySql('s');
const FK = holderFilingKeySql('sph.holder_name');
const [{ latest }] = await sql`SELECT MAX(quarter)::text AS latest FROM shareholding_pattern_holders`;

function displaysAs100(n) {
  const v = Number(n);
  return Number.isFinite(v) && v.toFixed(2) === '100.00';
}

// Raw sph latest quarter
const raw = await sql`
  SELECT s.name stock_name, s.slug stock_slug, sph.holder_name, sph.pct_of_company, sph.is_promoter, te.slug entity_slug
  FROM shareholding_pattern_holders sph JOIN stocks s ON s.id=sph.stock_id
  LEFT JOIN tracked_entities te ON te.id=sph.entity_id
  WHERE sph.quarter=${latest}::date
  ORDER BY sph.pct_of_company DESC`;
const raw100 = raw.filter(r => displaysAs100(r.pct_of_company));
console.log('RAW_SPH_DISPLAYS_100', raw100.length);
raw100.forEach(r => console.log(`${r.stock_name}|${r.stock_slug}|${r.holder_name}|${r.pct_of_company}|${r.is_promoter?'promoter':'non-promoter'}|${r.entity_slug||''}`));

// UI deduped path
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
  SELECT * FROM ranked WHERE rn=1`;
const ui100 = ui.filter(r => displaysAs100(r.pct_of_company));
console.log('\nUI_DEDUPED_DISPLAYS_100', ui100.length);
ui100.forEach(r => console.log(`${r.stock_name}|${r.stock_slug}|${r.holder_name}|${r.pct_of_company}|${r.is_promoter?'promoter':'non-promoter'}|${r.entity_slug||''}`));

// entity_holdings
const eh = await sql`
  SELECT s.name stock_name, s.slug stock_slug, COALESCE(te.display_name, te.name) entity_name, te.slug entity_slug, eh.pct_of_company
  FROM entity_holdings eh JOIN stocks s ON s.id=eh.stock_id
  LEFT JOIN tracked_entities te ON te.id=eh.entity_id
  WHERE eh.quarter=${latest}::date AND eh.strategy_id IS NULL`;
const eh100 = eh.filter(r => displaysAs100(r.pct_of_company));
console.log('\nENTITY_HOLDINGS_DISPLAYS_100', eh100.length);
eh100.forEach(r => console.log(`${r.stock_name}|${r.stock_slug}|${r.entity_name}|${r.pct_of_company}|${r.entity_slug||''}`));

// export json
import { readFileSync } from 'fs';
const j = JSON.parse(readFileSync('public/data/one-percent-holder-positions.json','utf8'));
const exp=[];
for (const [k,arr] of Object.entries(j)) for (const p of arr) if (displaysAs100(p.pct)) exp.push({holder:k,...p});
console.log('\nEXPORT_JSON_DISPLAYS_100', exp.length);
exp.forEach(r => console.log(`${r.stockName}|${r.stockSlug}|${r.holder}|${r.pct}`));

// Siyaram silk - anything that would show 100
const silk = raw.filter(r => (r.stock_slug||'').includes('siyaram-silk'));
console.log('\nSIYARAM_SILK_ALL');
silk.forEach(r => console.log(`${r.holder_name}|${r.pct_of_company}|displays100=${displaysAs100(r.pct_of_company)}`));