/**
 * Cross-reference missing listable funds with Holdings folder filenames.
 * Usage: node scripts/match-missing-to-files.mjs
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOLDINGS = 'C:/Users/shaik/Downloads/Holdings';
const csv = readFileSync(join(ROOT, 'scripts/output/holdings-coverage-audit.csv'), 'utf-8');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const lines = csv.trim().split('\n');
const headers = parseCsvLine(lines[0]);
const missing = lines.slice(1).map((line) => {
  const vals = parseCsvLine(line);
  const o = {};
  headers.forEach((h, i) => { o[h] = vals[i] ?? ''; });
  return o;
}).filter((r) => r.status === 'MISSING');

function walkFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (!/\(1\)$/.test(e)) walkFiles(p, out);
    } else if (/\.xlsx?$/i.test(e)) {
      out.push({ path: p, name: e, low: e.toLowerCase() });
    }
  }
  return out;
}

const files = walkFiles(HOLDINGS);
console.log(`Holdings Excel files: ${files.length}`);
console.log(`Missing listable funds: ${missing.length}\n`);

function tokens(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['fund', 'direct', 'plan', 'growth', 'the', 'and', 'for'].includes(w));
}

function scoreMatch(fundName, fileName) {
  const ft = tokens(fundName);
  const fn = fileName.toLowerCase();
  let hits = 0;
  for (const t of ft) {
    if (fn.includes(t)) hits++;
  }
  // AMC prefix boost
  const amc = fundName.split(' ')[0].toLowerCase();
  if (fn.includes(amc) && amc.length > 3) hits += 2;
  return hits;
}

const results = [];
let likelyInFolder = 0;
let noFileHint = 0;

for (const m of missing) {
  const scored = files
    .map((f) => ({ ...f, score: scoreMatch(m.name, f.name) }))
    .filter((f) => f.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const amcLow = m.amc_name.toLowerCase();
  const amcFiles = files.filter((f) => f.low.includes(amcLow.replace(/\s+/g, '-')) || f.low.includes(amcLow.replace(/\s+/g, '')) || f.low.includes(amcLow.split(' ')[0]));

  const inFolder = scored.length > 0 || amcFiles.length > 0;
  if (inFolder) likelyInFolder++;
  else noFileHint++;

  results.push({
    fund: m.name,
    amc: m.amc_name,
    reason: m.reason,
    bestFiles: scored.map((f) => f.name),
    amcFileCount: amcFiles.length,
    verdict: inFolder ? 'LIKELY_IN_FOLDER' : 'NO_FILE_FOUND',
  });
}

console.log(`Likely already in Holdings folder: ${likelyInFolder}`);
console.log(`No filename match found: ${noFileHint}\n`);

const byVerdict = { LIKELY_IN_FOLDER: [], NO_FILE_FOUND: [] };
for (const r of results) byVerdict[r.verdict].push(r);

console.log('=== Sample: files exist but DB missing (parser issue) ===');
for (const r of byVerdict.LIKELY_IN_FOLDER.slice(0, 15)) {
  console.log(`\n${r.fund} [${r.amc}]`);
  console.log(`  reason: ${r.reason}`);
  if (r.bestFiles[0]) console.log(`  file: ${r.bestFiles[0]}`);
  else console.log(`  amc files in folder: ${r.amcFileCount}`);
}

if (byVerdict.NO_FILE_FOUND.length) {
  console.log('\n=== Possibly truly missing files ===');
  for (const r of byVerdict.NO_FILE_FOUND) {
    console.log(`- ${r.fund} (${r.amc})`);
  }
}

const outPath = join(ROOT, 'scripts/output/missing-vs-files.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ likelyInFolder, noFileHint, results }, null, 2));
console.log(`\nWritten ${outPath}`);
