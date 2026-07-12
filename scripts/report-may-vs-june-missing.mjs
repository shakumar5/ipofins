#!/usr/bin/env node
/**
 * Compare May vs June 2026 fund_holdings coverage (direct-plan active funds).
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const url = (env.match(/^DATABASE_URL=(.+)$/m) || [])[1]?.trim();
if (!url) throw new Error('DATABASE_URL missing');
const sql = neon(url);

const may = await sql`
  SELECT a.name AS amc, f.slug, f.name AS fund
  FROM fund_holdings fh
  JOIN funds f ON f.id = fh.fund_id
  LEFT JOIN amcs a ON a.id = f.amc_id
  WHERE fh.month = '2026-05-01'::date
    AND f.is_active = true
    AND f.slug LIKE '%-direct-plan'
  GROUP BY a.name, f.slug, f.name
  ORDER BY a.name, f.name
`;

const jun = await sql`
  SELECT a.name AS amc, f.slug, f.name AS fund
  FROM fund_holdings fh
  JOIN funds f ON f.id = fh.fund_id
  LEFT JOIN amcs a ON a.id = f.amc_id
  WHERE fh.month = '2026-06-01'::date
    AND f.is_active = true
    AND f.slug LIKE '%-direct-plan'
  GROUP BY a.name, f.slug, f.name
  ORDER BY a.name, f.name
`;

const junSlugs = new Set(jun.map((r) => r.slug));
const missing = may.filter((r) => !junSlugs.has(r.slug));

const byAmc = {};
for (const r of missing) {
  const amc = r.amc || 'Unknown';
  if (!byAmc[amc]) byAmc[amc] = [];
  byAmc[amc].push({ fund: r.fund, slug: r.slug });
}

const amcSummary = {};
for (const amc of new Set([...may, ...jun].map((r) => r.amc || 'Unknown'))) {
  const mayN = may.filter((r) => (r.amc || 'Unknown') === amc).length;
  const junN = jun.filter((r) => (r.amc || 'Unknown') === amc).length;
  if (mayN === 0 && junN === 0) continue;
  amcSummary[amc] = {
    may: mayN,
    june: junN,
    missing: Math.max(0, mayN - junN),
    status: junN === 0 && mayN > 0 ? 'MISSING_AMC' : junN < mayN ? 'PARTIAL' : junN > mayN ? 'MORE_IN_JUNE' : 'OK',
  };
}

const missingAmcs = Object.entries(amcSummary)
  .filter(([, v]) => v.status === 'MISSING_AMC')
  .sort((a, b) => b[1].may - a[1].may);

const partialAmcs = Object.entries(amcSummary)
  .filter(([, v]) => v.status === 'PARTIAL')
  .sort((a, b) => b[1].missing - a[1].missing);

console.log('═══════════════════════════════════════════════════════════');
console.log('  May vs June 2026 holdings coverage (direct-plan)');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  May funds:    ${may.length}`);
console.log(`  June funds:   ${jun.length}`);
console.log(`  Missing:      ${missing.length} funds present in May but not June`);
console.log('');

console.log('── Completely missing AMCs (0 June funds) ──');
for (const [amc, v] of missingAmcs) {
  console.log(`  ${amc}: May ${v.may} → June 0`);
}
if (!missingAmcs.length) console.log('  (none)');

console.log('\n── Partial AMCs (some funds missing) ──');
for (const [amc, v] of partialAmcs) {
  console.log(`  ${amc}: May ${v.may} → June ${v.june} (missing ${v.missing})`);
}
if (!partialAmcs.length) console.log('  (none)');

console.log('\n── Missing funds by AMC ──');
for (const amc of Object.keys(byAmc).sort()) {
  const rows = byAmc[amc];
  console.log(`\n[${amc}] ${rows.length} missing`);
  for (const r of rows.sort((a, b) => a.fund.localeCompare(b.fund))) {
    console.log(`  - ${r.fund}`);
  }
}

const out = {
  mayFunds: may.length,
  juneFunds: jun.length,
  missingFunds: missing.length,
  amcSummary,
  missingByAmc: Object.fromEntries(
    Object.keys(byAmc)
      .sort()
      .map((amc) => [amc, byAmc[amc].map((r) => r.fund).sort()]),
  ),
};
writeFileSync(join(ROOT, 'docs', 'may-vs-june-2026-missing.json'), JSON.stringify(out, null, 2));
console.log('\n  Wrote docs/may-vs-june-2026-missing.json');
