#!/usr/bin/env node
/** Quick verification: sample seeded entities + strategies from DB. */
import { readFileSync } from 'fs';
import pg from 'pg';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim().replace(/&?channel_binding=require/i, '');
const c = new pg.Client({ connectionString: url });
await c.connect();

const e = await c.query(
  "SELECT name, type, tier, display_name FROM tracked_entities ORDER BY type, name"
);
console.log(`Entities (${e.rows.length}):`);
for (const r of e.rows) {
  console.log(`  [${(r.type ?? '').padEnd(8)}] ${(r.tier ?? '-').padEnd(10)} ${r.name}`);
}

const strat = await c.query(
  `SELECT te.name AS provider, es.name AS strategy, es.strategy_type
   FROM entity_strategies es
   JOIN tracked_entities te ON te.id = es.entity_id
   ORDER BY te.name`
);
console.log(`\nStrategies (${strat.rows.length}):`);
for (const r of strat.rows) {
  console.log(`  ${(r.provider ?? '').padEnd(28)} → ${r.strategy} (${r.strategy_type ?? '-'})`);
}

const tags = await c.query(
  `SELECT te.name, tet.tag FROM tracked_entity_tags tet
   JOIN tracked_entities te ON te.id = tet.entity_id
   ORDER BY te.name, tet.tag`
);
console.log(`\nTags (${tags.rows.length}):`);
for (const r of tags.rows) {
  console.log(`  ${(r.name ?? '').padEnd(28)} #${r.tag}`);
}

await c.end();
