#!/usr/bin/env node
/**
 * Full curated MF rebuild: purge → seed funds → seed holdings → dedupe stocks.
 *
 * Usage:
 *   node scripts/node-with-ca.mjs db/rebuild-curated-mf.mjs
 *   node scripts/node-with-ca.mjs db/rebuild-curated-mf.mjs --skip-parse
 */
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { nodeExecCmd } from '../scripts/lib/node-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skipParse = args.includes('--skip-parse');

function run(cmd, label) {
  console.log(`\n  ▶ ${label}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: process.env });
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  Curated MF Rebuild — Direct Growth, holdings-gated');
console.log('═══════════════════════════════════════════════════════════');

if (!skipParse) {
  run('node scripts/parse-holdings.mjs', 'Parse Holdings folder → fund-holdings.json');
} else {
  console.log('\n  ℹ Skipping parse (--skip-parse)');
}

run(nodeExecCmd('db/purge-mf-data.mjs', '--confirm'), 'Purge MF tables (IPOs preserved)');
run(nodeExecCmd('db/seed/seed-curated-mf.mjs'), 'Seed curated funds + NAV/returns');
run(nodeExecCmd('db/seed/seed-holdings-batch.mjs', '--full --curated-only'), 'Seed holdings (all months, curated only)');
run(nodeExecCmd('db/seed/dedupe-stocks-canonical.mjs'), 'Deduplicate stocks');

console.log('\n  ✅ Curated MF rebuild complete');
console.log('  Next: npm run export:client-data && npm run build\n');
