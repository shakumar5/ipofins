#!/usr/bin/env node
/**
 * Parse a HOLDINGS_INPUT_DIR subset into a temp JSON, then merge into
 * src/data/fund-holdings.json preferring fuller month portfolios.
 *
 * Usage:
 *   HOLDINGS_INPUT_DIR=... node scripts/parse-holdings-merge.mjs
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpackMonthHoldings } from './lib/holdings-month.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'src', 'data', 'fund-holdings.json');
const BACKUP = join(ROOT, 'src', 'data', 'fund-holdings.pre-merge-parse.json');
const SIDE = join(ROOT, 'src', 'data', 'fund-holdings.parse-subset.json');

if (!process.env.HOLDINGS_INPUT_DIR) {
  console.error('Set HOLDINGS_INPUT_DIR to the folder of Excels to parse');
  process.exit(1);
}
if (!existsSync(OUTPUT)) {
  console.error('Missing fund-holdings.json');
  process.exit(1);
}

copyFileSync(OUTPUT, BACKUP);

const parse = spawnSync(
  process.execPath,
  [...(process.execArgv || []), join(ROOT, 'scripts', 'parse-holdings.mjs')],
  {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  },
);
if ((parse.status ?? 1) !== 0) {
  copyFileSync(BACKUP, OUTPUT);
  process.exit(parse.status ?? 1);
}

// parse-holdings overwrote OUTPUT with subset — move to SIDE and restore backup base
copyFileSync(OUTPUT, SIDE);
copyFileSync(BACKUP, OUTPUT);

const bak = JSON.parse(readFileSync(OUTPUT, 'utf8'));
const neu = JSON.parse(readFileSync(SIDE, 'utf8'));
let updated = 0;
let added = 0;

for (const [slug, fund] of Object.entries(neu.holdings || {})) {
  if (!bak.holdings[slug]) {
    bak.holdings[slug] = { name: fund.name, amc: fund.amc };
    added++;
  }
  const dest = bak.holdings[slug];
  if (fund.name) dest.name = fund.name;
  if (fund.amc) dest.amc = fund.amc;
  for (const [key, val] of Object.entries(fund)) {
    if (key === 'name' || key === 'amc') continue;
    const incoming = unpackMonthHoldings(val);
    const current = unpackMonthHoldings(dest[key]);
    if (incoming.stocks.length > current.stocks.length) {
      dest[key] = val;
      updated++;
      console.log(`  ✓ ${slug} ${key}: ${current.stocks.length} → ${incoming.stocks.length}`);
    }
  }
}

const monthOrder = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const months = new Set([...(bak.months || []), ...(neu.months || [])]);
bak.months = [...months].sort((a, b) => {
  const [ma, ya] = a.split(' ');
  const [mb, yb] = b.split(' ');
  if (ya !== yb) return Number(ya) - Number(yb);
  return monthOrder.indexOf(ma) - monthOrder.indexOf(mb);
});
bak.lastUpdated = neu.lastUpdated || bak.lastUpdated;

const amcs = {};
for (const f of Object.values(bak.holdings)) {
  const a = f.amc || 'Unknown';
  if (!amcs[a]) amcs[a] = [];
  amcs[a].push(f.name);
}
for (const a of Object.keys(amcs)) amcs[a] = [...new Set(amcs[a])].sort();
bak.amcs = amcs;

writeFileSync(OUTPUT, JSON.stringify(bak, null, 2));
try { unlinkSync(SIDE); } catch { /* ignore */ }
console.log(`\n  Merged: ${updated} month updates, ${added} new funds, ${Object.keys(bak.holdings).length} funds total\n`);
