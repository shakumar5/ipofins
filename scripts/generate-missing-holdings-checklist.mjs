/**
 * Generate human-readable checklist of missing holdings for All Funds tab.
 * Run: node --use-system-ca scripts/generate-missing-holdings-checklist.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = join(ROOT, 'scripts', 'output', 'holdings-coverage-audit.csv');

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

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

const rows = parseCsv(readFileSync(csvPath, 'utf-8'));
const missing = rows.filter((r) => r.status === 'MISSING');

const addAmc = new Map();
const addFiles = [];
const codeFix = [];

for (const r of missing) {
  if (r.reason === 'amc_no_holdings_in_db') {
    if (!addAmc.has(r.amc_name)) addAmc.set(r.amc_name, []);
    addAmc.get(r.amc_name).push(r);
  } else if (r.reason === 'name_norm_match_not_linked' || r.in_parsed_json === 'yes') {
    codeFix.push(r);
  } else {
    addFiles.push(r);
  }
}

const byAmcFiles = {};
for (const r of addFiles) {
  if (!byAmcFiles[r.amc_name]) byAmcFiles[r.amc_name] = [];
  byAmcFiles[r.amc_name].push(r);
}

let md = `# Missing Holdings Checklist (All Funds tab)

Generated from live DB audit. **366** listable Direct-Growth equity funds · **${rows.filter((r) => r.status === 'OK').length}** linked · **${missing.length}** missing.

Place new Excel files under \`C:\\Users\\shaik\\Downloads\\Holdings\\\` (any subfolder). After adding files, run:

\`\`\`bash
cd finverseui
npm run pipeline:monthly
\`\`\`

---

## 1. Add entire AMC portfolio disclosure (${[...addAmc.values()].reduce((n, a) => n + a.length, 0)} funds)

No May 2026 portfolio data exists for these AMCs in the DB. Download **full monthly portfolio disclosure** (all equity schemes) from the AMC website.

`;

for (const [amc, funds] of [...addAmc.entries()].sort((a, b) => b[1].length - a[1].length)) {
  md += `### ${amc} (${funds.length} funds)\n\n`;
  md += `| # | Fund name | Scheme code | Category |\n|---|-----------|-------------|----------|\n`;
  funds.forEach((f, i) => {
    md += `| ${i + 1} | ${f.name} | ${f.scheme_code} | ${f.category} |\n`;
  });
  md += '\n';
}

md += `---

## 2. Add per-scheme Excel files (${addFiles.length} funds)

AMC has some holdings in DB but **this scheme** was not parsed. Add the May 2026 portfolio Excel for each fund below.

`;

for (const [amc, funds] of Object.entries(byAmcFiles).sort((a, b) => b[1].length - a[1].length)) {
  md += `### ${amc} (${funds.length})\n\n`;
  md += `| # | Fund name | Category | Scheme code |\n|---|-----------|----------|-------------|\n`;
  funds.forEach((f, i) => {
    md += `| ${i + 1} | ${f.name} | ${f.category} | ${f.scheme_code} |\n`;
  });
  md += '\n';
}

md += `---

## 3. Fixed by parser/matcher update — no new files (${codeFix.length} funds)

These already exist in parsed JSON or DB under a slightly different slug. **Do not add files** — re-run pipeline after code fix.

| Fund name | AMC | Holder slug in DB |
|-----------|-----|-------------------|
`;

for (const r of codeFix) {
  md += `| ${r.name} | ${r.amc_name} | ${r.holder_slug || '—'} |\n`;
}

md += `
---

## Summary

| Action | Funds |
|--------|------:|
| Add entire AMC folder | ${[...addAmc.values()].reduce((n, a) => n + a.length, 0)} |
| Add individual scheme Excel | ${addFiles.length} |
| Parser/matcher fix only | ${codeFix.length} |
| **Total missing** | **${missing.length}** |

`;

const outDir = join(ROOT, 'scripts', 'output');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'MISSING_HOLDINGS_CHECKLIST.md');
writeFileSync(outPath, md, 'utf-8');
console.log(`Written: ${outPath}`);
console.log(`  Add AMC: ${[...addAmc.values()].reduce((n, a) => n + a.length, 0)}`);
console.log(`  Add files: ${addFiles.length}`);
console.log(`  Code fix: ${codeFix.length}`);
