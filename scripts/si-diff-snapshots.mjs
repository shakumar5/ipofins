#!/usr/bin/env node
/**
 * Diff two SI business snapshots (baseline vs post-run). Verifies every
 * business table is byte-identical (count + checksum), and explicitly calls
 * out pipeline_runs (metadata) as the only permitted change.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const [baselinePath, postrunPath] = process.argv.slice(2).length === 2
  ? process.argv.slice(2)
  : [
      join(__dirname, 'output', 'si-baseline.json'),
      join(__dirname, 'output', 'si-postrun.json'),
    ];

const base = JSON.parse(readFileSync(baselinePath, 'utf-8'));
const post = JSON.parse(readFileSync(postrunPath, 'utf-8'));

// Tables that pipelines 4/6/7/8 mutate as BUSINESS data — must be identical.
const BUSINESS = [
  'tracked_entities',
  'tracked_entity_tags',
  'entity_strategies',
  'shareholding_pattern_holders',
  'sast_filings',
  'entity_holdings',
  'entity_changes',
  'entity_stock_signals',
  'entity_quarterly_stats',
  'entity_overlaps',
  'entity_conviction',
  'corporate_actions',
];

const META = ['pipeline_runs'];

let failures = 0;

console.log('═'.repeat(64));
console.log('  SI business-data dry-run verification');
console.log(`  baseline: ${base.label} (${base.capturedAt})`);
console.log(`  post-run: ${post.label} (${post.capturedAt})`);
console.log('═'.repeat(64));

console.log('\n── BUSINESS TABLES (must be identical) ──────────────────');
for (const t of BUSINESS) {
  const b = base.tables[t];
  const p = post.tables[t];
  const countOk = b.count === p.count;
  const hashOk = b.hash === p.hash;
  const ok = countOk && hashOk;
  if (!ok) failures++;
  const tag = ok ? '✅ IDENTICAL' : '❌ CHANGED';
  console.log(
    `  ${tag}  ${t.padEnd(34)} count ${b.count}→${p.count}  hash ${hashOk ? 'same' : 'DIFF'}`
  );
  if (b.error) console.log(`            (baseline error: ${b.error})`);
  if (p.error) console.log(`            (post-run error: ${p.error})`);
}

console.log('\n── PIPELINE-8 SPECIFIC WRITE TARGETS ─────────────────────');
const sp = [
  ['sast_filings (all)', base.tables.sast_filings, post.tables.sast_filings],
  ['sast_filings is_preliminary', base.sastFilings_preliminary, post.sastFilings_preliminary],
  ['entity_holdings (all)', base.tables.entity_holdings, post.tables.entity_holdings],
  ['entity_holdings is_preliminary', base.entityHoldings_preliminary, post.entityHoldings_preliminary],
];
for (const [name, b, p] of sp) {
  const bc = b?.c ?? b?.count;
  const pc = p?.c ?? p?.count;
  const ok = bc === pc;
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'}  ${name.padEnd(34)} ${bc} → ${pc}`);
}

console.log('\n── METADATA (expected to change — health log only) ───────');
for (const t of META) {
  const b = base.tables[t];
  const p = post.tables[t];
  const changed = b.count !== p.count || b.hash !== p.hash;
  console.log(
    `  ${changed ? 'ℹ️  CHANGED (expected)' : '✅ unchanged'}  ${t.padEnd(34)} count ${b.count}→${p.count}`
  );
}

console.log('\n' + '═'.repeat(64));
if (failures === 0) {
  console.log('  ✅ PASS — zero business-data side effects detected.');
  console.log('     (pipeline_runs metadata changed as expected — see above.)');
} else {
  console.log(`  ❌ FAIL — ${failures} business table(s) changed unexpectedly.`);
}
console.log('═'.repeat(64));
process.exit(failures === 0 ? 0 : 1);
