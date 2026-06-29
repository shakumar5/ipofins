import { sql, isDbConfigured } from './lib/db.mjs';
if (!isDbConfigured()) process.exit(1);

const candidates = await sql`
  SELECT COUNT(*)::int AS cnt FROM shareholding_pattern_holders sph
  WHERE sph.pct_of_company >= 99
    AND EXISTS (
      SELECT 1 FROM shareholding_pattern_holders nxt
      WHERE nxt.stock_id = sph.stock_id AND nxt.holder_name = sph.holder_name
        AND nxt.quarter > sph.quarter AND nxt.shares = sph.shares
        AND nxt.pct_of_company > 0 AND nxt.pct_of_company < 20
    )`;
console.log('fixable via next quarter:', candidates[0].cnt);

const kedia = await sql`
  SELECT sph.quarter::text q, sph.pct_of_company, sph.shares
  FROM shareholding_pattern_holders sph
  JOIN stocks s ON s.id=sph.stock_id
  WHERE s.slug='siyaram-silk-mills-limited' AND sph.holder_name ILIKE '%kedia%'
  ORDER BY sph.quarter`;
console.log('kedia', kedia);

const dry = await sql`
  SELECT sph.id, s.slug, sph.holder_name, sph.quarter::text q, sph.pct_of_company, nxt.pct_of_company AS fix_to
  FROM shareholding_pattern_holders sph
  JOIN stocks s ON s.id=sph.stock_id
  JOIN shareholding_pattern_holders nxt ON nxt.stock_id=sph.stock_id AND nxt.holder_name=sph.holder_name
    AND nxt.quarter > sph.quarter AND nxt.shares=sph.shares AND nxt.pct_of_company > 0 AND nxt.pct_of_company < 20
  WHERE sph.pct_of_company >= 99
  ORDER BY s.name LIMIT 5`;
console.log('sample fixes', dry);