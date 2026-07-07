#!/usr/bin/env node
import { sql } from './lib/db.mjs';
import { buildEntityResolver } from './lib/entity-name-resolver.mjs';

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ['akash-bhansali'];

const entities = await sql`SELECT * FROM tracked_entities WHERE slug = ANY(${slugs})`;
const resolver = buildEntityResolver(entities);

for (const e of entities) {
  console.log(`\n${e.display_name} (${e.slug})`);
  console.log('  aliases:', e.aliases);
  const eh = await sql`
    SELECT COUNT(*)::int AS cnt FROM entity_holdings eh
    WHERE eh.entity_id = ${e.id} AND eh.strategy_id IS NULL
      AND eh.quarter = (SELECT MAX(quarter) FROM entity_holdings WHERE entity_id = ${e.id} AND strategy_id IS NULL)
  `;
  const sph = await sql`
    SELECT COUNT(DISTINCT stock_id)::int AS cnt FROM shareholding_pattern_holders
    WHERE entity_id = ${e.id} AND is_promoter = FALSE AND pct_of_company >= 1.0
      AND quarter = (SELECT MAX(quarter) FROM shareholding_pattern_holders WHERE is_promoter = FALSE)
  `;
  console.log('  entity_holdings (latest):', eh[0]?.cnt);
  console.log('  sph linked (latest global q):', sph[0]?.cnt);
}

if (slugs.includes('akash-bhansali')) {
  const names = ['AKASH BHANSALI', 'AKASH BHANSHALI', 'AKASH MANEK BHANSHALI'];
  console.log('\nResolver tests:');
  for (const n of names) {
    const m = resolver.resolve(n);
    console.log(`  ${n} →`, m ? `${m.entityName} (${m.confidence})` : 'no match');
  }
  const unlinked = await sql`
    SELECT holder_name, COUNT(DISTINCT stock_id)::int AS stocks
    FROM shareholding_pattern_holders
    WHERE holder_name ILIKE '%akash%bhans%'
      AND is_promoter = FALSE AND pct_of_company >= 1.0
      AND quarter = (SELECT MAX(quarter) FROM shareholding_pattern_holders WHERE is_promoter = FALSE)
    GROUP BY holder_name ORDER BY holder_name
  `;
  console.log('\nAKASH* filing names in latest SHP:', unlinked);
}
