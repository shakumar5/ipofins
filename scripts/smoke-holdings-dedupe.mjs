import { sql } from './lib/db.mjs';

const listingKeyExpr = `COALESCE(NULLIF(UPPER(TRIM(s.nse_symbol)), ''), NULLIF(TRIM(s.isin), ''), NULLIF(TRIM(s.bse_code), ''), s.slug)`;

for (const slug of ['vijay-kedia', 'dolly-khanna']) {
  const [te] = await sql`SELECT id FROM tracked_entities WHERE slug = ${slug}`;
  if (!te) {
    console.log(slug, 'not found');
    continue;
  }
  const [raw] = await sql`
    SELECT COUNT(*)::int AS cnt FROM entity_holdings eh
    JOIN stocks s ON s.id = eh.stock_id
    WHERE eh.entity_id = ${te.id} AND eh.strategy_id IS NULL
      AND eh.quarter = (
        SELECT MAX(quarter) FROM entity_holdings
        WHERE entity_id = ${te.id} AND strategy_id IS NULL
      )
  `;
  const [deduped] = await sql`
    SELECT COUNT(DISTINCT ${sql.unsafe(listingKeyExpr)})::int AS cnt
    FROM entity_holdings eh
    JOIN stocks s ON s.id = eh.stock_id
    WHERE eh.entity_id = ${te.id} AND eh.strategy_id IS NULL
      AND eh.quarter = (
        SELECT MAX(quarter) FROM entity_holdings
        WHERE entity_id = ${te.id} AND strategy_id IS NULL
      )
  `;
  const elecon = await sql`
    SELECT s.id, s.slug, s.name, s.nse_symbol FROM entity_holdings eh
    JOIN stocks s ON s.id = eh.stock_id
    WHERE eh.entity_id = ${te.id} AND eh.strategy_id IS NULL
      AND UPPER(TRIM(s.nse_symbol)) = 'ELECON'
      AND eh.quarter = (
        SELECT MAX(quarter) FROM entity_holdings
        WHERE entity_id = ${te.id} AND strategy_id IS NULL
      )
  `;
  console.log(slug, {
    rawRows: raw.cnt,
    uniqueByListingKey: deduped.cnt,
    eleconDuplicateStockIds: elecon.length,
    eleconSlugs: elecon.map((r) => r.slug),
  });
}

process.exit(0);