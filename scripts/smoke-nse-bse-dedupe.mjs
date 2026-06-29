import { sql } from './lib/db.mjs';

const keyExpr = `COALESCE(NULLIF(UPPER(TRIM(s.isin)), ''), NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.bse_code), ''), s.slug)`;

const crossExchange = await sql`
  SELECT s1.isin, s1.nse_symbol, s1.bse_code, s2.nse_symbol AS nse2, s2.bse_code AS bse2
  FROM stocks s1
  JOIN stocks s2 ON s1.isin = s2.isin AND s1.id < s2.id
  WHERE s1.isin IS NOT NULL AND TRIM(s1.isin) <> ''
    AND NULLIF(TRIM(s1.nse_symbol), '') IS NOT NULL
    AND NULLIF(TRIM(s2.nse_symbol), '') IS NULL
  LIMIT 5
`;
console.log('NSE + BSE-only rows sharing ISIN:', crossExchange.length);
if (crossExchange.length) console.log(crossExchange);

for (const slug of ['vijay-kedia', 'dolly-khanna']) {
  const [te] = await sql`SELECT id FROM tracked_entities WHERE slug = ${slug}`;
  const [raw] = await sql`
    SELECT COUNT(*)::int AS cnt FROM entity_holdings eh
    JOIN stocks s ON s.id = eh.stock_id
    WHERE eh.entity_id = ${te.id} AND eh.strategy_id IS NULL
      AND eh.quarter = (SELECT MAX(quarter) FROM entity_holdings WHERE entity_id = ${te.id} AND strategy_id IS NULL)
  `;
  const [deduped] = await sql`
    SELECT COUNT(DISTINCT ${sql.unsafe(keyExpr)})::int AS cnt
    FROM entity_holdings eh JOIN stocks s ON s.id = eh.stock_id
    WHERE eh.entity_id = ${te.id} AND eh.strategy_id IS NULL
      AND eh.quarter = (SELECT MAX(quarter) FROM entity_holdings WHERE entity_id = ${te.id} AND strategy_id IS NULL)
  `;
  console.log(slug, { rawRows: raw.cnt, uniqueListingKey: deduped.cnt });
}
process.exit(0);