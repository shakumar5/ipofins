#!/usr/bin/env node
/** Export /data/one-percent-holder-positions.json for 1% Club name search. */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql } from './lib/db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'one-percent-holder-positions.json');

function normalizeHolderSearchKey(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const rows = await sql`
  WITH latest AS (
    SELECT MAX(quarter) AS q FROM shareholding_pattern_holders WHERE is_promoter = FALSE
  )
  SELECT
    sph.holder_name,
    te.slug AS entity_slug,
    s.slug AS stock_slug,
    s.name AS stock_name,
    sph.pct_of_company,
    sph.shares,
    CASE
      WHEN sph.shares > 0 AND sqp.close_price IS NOT NULL
        THEN ROUND((sph.shares::numeric * sqp.close_price) / 1e7, 2)
      ELSE NULL
    END AS market_value_cr
  FROM shareholding_pattern_holders sph
  JOIN stocks s ON s.id = sph.stock_id
  LEFT JOIN tracked_entities te ON te.id = sph.entity_id
  LEFT JOIN stock_quarter_prices sqp
    ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
  WHERE sph.quarter = (SELECT q FROM latest)
    AND sph.is_promoter = FALSE
    AND sph.pct_of_company >= 1.0
  ORDER BY sph.pct_of_company DESC
`;

const record = {};
for (const r of rows) {
  const key = r.entity_slug
    ? `entity:${r.entity_slug}`
    : `name:${normalizeHolderSearchKey(r.holder_name)}`;
  if (!record[key]) record[key] = [];
  record[key].push({
    stockSlug: r.stock_slug,
    stockName: r.stock_name,
    pct: r.pct_of_company == null ? null : Number(r.pct_of_company),
    shares: r.shares == null ? null : Number(r.shares),
    marketValueCr: r.market_value_cr == null ? null : Number(r.market_value_cr),
  });
}

mkdirSync(join(ROOT, 'public', 'data'), { recursive: true });
writeFileSync(OUT, JSON.stringify(record));
console.log(`Wrote ${Object.keys(record).length} holder keys -> ${OUT}`);
