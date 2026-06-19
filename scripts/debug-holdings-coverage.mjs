/**
 * Full audit: every listable Direct-Growth fund vs holdings + AMC coverage.
 *
 * Usage: node --use-system-ca scripts/debug-holdings-coverage.mjs
 * Output: scripts/output/holdings-coverage-audit.csv + console summary
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { normalizeFundName } from './lib/fund-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const sql = neon(env.match(/DATABASE_URL=(.+)/)[1].trim());

const LISTABLE = [
  'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap',
  'Value', 'Focused', 'ELSS', 'Sectoral/Thematic', 'Sectoral', 'Contra', 'Dividend Yield', 'Index',
];

function baseSlug(slug) {
  return String(slug)
    .replace(/(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$/i, '')
    .replace(/-growth-option$/i, '')
    .replace(/-growth-plan$/i, '')
    .replace(/-growth$/i, '');
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

// --- Load listable funds (same filters as getAllFunds) ---
const listable = await sql`
  SELECT f.id, f.slug, f.name, f.category, f.scheme_code, f.amc_id, a.name AS amc_name
  FROM funds f
  LEFT JOIN amcs a ON a.id = f.amc_id
  WHERE f.is_active = true
    AND f.scheme_code IS NOT NULL AND TRIM(f.scheme_code) <> ''
    AND f.slug LIKE '%-direct-plan'
    AND f.category = ANY(${LISTABLE})
    AND f.name NOT ILIKE '%IDCW%'
    AND f.name NOT ILIKE '%dividend payout%'
    AND f.name NOT ILIKE '%dividend plan%'
    AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
  ORDER BY f.category, f.name
`;

const [latest] = await sql`SELECT MAX(month) AS month FROM fund_holdings`;
const latestMonth = latest?.month;

// Production matcher (same as holdings.ts)
const matchedRows = await sql`
  WITH latest AS (SELECT MAX(month) AS m FROM fund_holdings),
  holders AS (
    SELECT DISTINCT
      f.id AS holder_id,
      f.slug AS holder_slug,
      f.name AS holder_name,
      f.amc_id,
      f.scheme_code AS holder_scheme,
      regexp_replace(
        regexp_replace(f.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
        '-growth-option$', ''
      ) AS holder_base
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id
    WHERE fh.month = (SELECT m FROM latest)
  ),
  listable AS (
    SELECT f.id, f.slug, f.amc_id, f.scheme_code,
      regexp_replace(
        regexp_replace(f.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
        '-growth-option$', ''
      ) AS base_slug
    FROM funds f
    WHERE f.is_active = true
      AND f.scheme_code IS NOT NULL AND TRIM(f.scheme_code) <> ''
      AND f.slug LIKE '%-direct-plan'
      AND f.category = ANY(${LISTABLE})
      AND f.name NOT ILIKE '%IDCW%'
      AND f.name NOT ILIKE '%dividend payout%'
      AND f.name NOT ILIKE '%dividend plan%'
      AND NOT (f.name LIKE '%(%' AND f.name NOT LIKE '%)%')
  )
  SELECT DISTINCT l.slug, l.id AS listable_id
  FROM listable l
  WHERE EXISTS (
    SELECT 1 FROM holders h
    WHERE h.holder_id = l.id
       OR (
         l.amc_id IS NOT NULL
         AND h.amc_id = l.amc_id
         AND h.holder_scheme IS NOT NULL
         AND TRIM(h.holder_scheme) <> ''
         AND h.holder_scheme = l.scheme_code
       )
       OR (
         l.amc_id IS NOT NULL
         AND h.amc_id = l.amc_id
         AND h.holder_base = l.base_slug
       )
       OR h.holder_base = l.base_slug
  )
`;
const matchedSlugs = new Set(matchedRows.map((r) => r.slug));

// All holders for latest month
const holders = await sql`
  SELECT DISTINCT
    f.id AS holder_id,
    f.slug AS holder_slug,
    f.name AS holder_name,
    f.amc_id,
    f.scheme_code,
    regexp_replace(
      regexp_replace(f.slug, '(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$', ''),
      '-growth-option$', ''
    ) AS holder_base,
    (SELECT COUNT(*)::int FROM fund_holdings fh WHERE fh.fund_id = f.id AND fh.month = ${latestMonth}) AS holding_rows
  FROM fund_holdings fh
  JOIN funds f ON f.id = fh.fund_id
  WHERE fh.month = ${latestMonth}
`;

const holdersByBase = new Map();
const holdersByAmc = new Map();
const holderByNorm = new Map();
const holderByScheme = new Map();
for (const h of holders) {
  holdersByBase.set(h.holder_base, h);
  if (!holdersByAmc.has(h.amc_id)) holdersByAmc.set(h.amc_id, []);
  holdersByAmc.get(h.amc_id).push(h);
  const norm = normalizeFundName(h.holder_name, '');
  holderByNorm.set(`${h.amc_id}|${norm}`, h);
  if (h.scheme_code) holderByScheme.set(`${h.amc_id}|${h.scheme_code}`, h);
}

// Direct holdings on same slug
const directHolderIds = new Set(
  holders.filter((h) => h.holder_slug === h.holder_slug && listable.some((l) => l.slug === h.holder_slug)).map((h) => h.holder_id)
);

// Parsed JSON keys (if exists)
let parsedJsonSlugs = new Set();
const jsonPath = join(ROOT, 'src/data/fund-holdings.json');
if (existsSync(jsonPath)) {
  const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  parsedJsonSlugs = new Set(Object.keys(data.holdings || {}));
}

// AMC-level: does AMC have any holdings?
const amcHasHoldings = new Set(holders.map((h) => h.amc_id).filter(Boolean));

function classify(fund) {
  if (matchedSlugs.has(fund.slug)) {
    const holder = holders.find((h) => h.holder_slug === fund.slug)
      || holdersByBase.get(baseSlug(fund.slug))
      || holderByScheme.get(`${fund.amc_id}|${fund.scheme_code}`);
    return {
      status: 'OK',
      reason: 'holdings_linked',
      holder_slug: holder?.holder_slug || fund.slug,
      holder_rows: holder?.holding_rows ?? '',
    };
  }

  if (!fund.amc_id) {
    const byBase = holdersByBase.get(baseSlug(fund.slug));
    if (byBase) {
      return {
        status: 'MISSING',
        reason: 'no_amc_id_but_base_slug_exists',
        holder_slug: byBase.holder_slug,
        holder_rows: byBase.holding_rows,
      };
    }
    return { status: 'MISSING', reason: 'no_amc_id', holder_slug: '', holder_rows: '' };
  }

  if (!amcHasHoldings.has(fund.amc_id)) {
    return { status: 'MISSING', reason: 'amc_no_holdings_in_db', holder_slug: '', holder_rows: '' };
  }

  const byScheme = holderByScheme.get(`${fund.amc_id}|${fund.scheme_code}`);
  if (byScheme) {
    return {
      status: 'MISSING',
      reason: 'scheme_match_not_linked',
      holder_slug: byScheme.holder_slug,
      holder_rows: byScheme.holding_rows,
    };
  }

  const byBase = holdersByBase.get(baseSlug(fund.slug));
  if (byBase && byBase.amc_id === fund.amc_id) {
    return {
      status: 'MISSING',
      reason: 'base_slug_exists_same_amc_not_linked',
      holder_slug: byBase.holder_slug,
      holder_rows: byBase.holding_rows,
    };
  }

  const norm = normalizeFundName(fund.name, fund.amc_name || '');
  const byNorm = holderByNorm.get(`${fund.amc_id}|${norm}`);
  if (byNorm) {
    return {
      status: 'MISSING',
      reason: 'name_norm_match_not_linked',
      holder_slug: byNorm.holder_slug,
      holder_rows: byNorm.holding_rows,
    };
  }

  const amcFunds = holdersByAmc.get(fund.amc_id) || [];
  const otherSlugs = amcFunds.slice(0, 3).map((h) => h.holder_slug).join('; ');
  return {
    status: 'MISSING',
    reason: 'amc_has_other_funds_only',
    holder_slug: otherSlugs,
    holder_rows: '',
  };
}

const rows = [];
const reasonCounts = {};
let ok = 0;
let missing = 0;

for (const f of listable) {
  const c = classify(f);
  if (c.status === 'OK') ok++;
  else missing++;
  reasonCounts[c.reason] = (reasonCounts[c.reason] || 0) + 1;

  const inJson = parsedJsonSlugs.has(f.slug) || parsedJsonSlugs.has(baseSlug(f.slug));
  rows.push({
    status: c.status,
    reason: c.reason,
    slug: f.slug,
    name: f.name,
    category: f.category,
    scheme_code: f.scheme_code,
    amc_id: f.amc_id ?? '',
    amc_name: f.amc_name ?? '(null)',
    holder_slug: c.holder_slug,
    holder_rows: c.holding_rows,
    in_parsed_json: inJson ? 'yes' : 'no',
  });
}

const outDir = join(ROOT, 'scripts', 'output');
mkdirSync(outDir, { recursive: true });
const csvPath = join(outDir, 'holdings-coverage-audit.csv');
const header = Object.keys(rows[0] || {}).join(',');
const csv = [header, ...rows.map((r) => Object.values(r).map(csvEscape).join(','))].join('\n');
writeFileSync(csvPath, csv, 'utf-8');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Holdings coverage audit (All Funds tab)');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Latest holdings month: ${latestMonth}`);
console.log(`  Listable Direct-Growth funds: ${listable.length}`);
console.log(`  Holdings linked (UI shows link): ${ok}`);
console.log(`  Missing (UI shows No Data): ${missing}`);
console.log('');
console.log('  By reason:');
for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${count.toString().padStart(3)}  ${reason}`);
}
console.log('');
console.log(`  CSV written: ${csvPath}`);
console.log('');

const fixable = rows.filter((r) =>
  r.status === 'MISSING' &&
  ['scheme_match_not_linked', 'base_slug_exists_same_amc_not_linked', 'name_norm_match_not_linked', 'no_amc_id_but_base_slug_exists'].includes(r.reason)
);
if (fixable.length) {
  console.log(`  FIXABLE via matcher (${fixable.length}):`);
  for (const r of fixable.slice(0, 15)) {
    console.log(`    - ${r.name}`);
    console.log(`      listable: ${r.slug}`);
    console.log(`      holder:   ${r.holder_slug} (${r.reason})`);
  }
  if (fixable.length > 15) console.log(`    ... and ${fixable.length - 15} more in CSV`);
  console.log('');
}

const noAmc = rows.filter((r) => r.amc_name === '(null)' || r.amc_id === '');
if (noAmc.length) {
  console.log(`  Funds with missing AMC assignment (${noAmc.length}):`);
  for (const r of noAmc.slice(0, 20)) {
    console.log(`    - ${r.slug} | holdings: ${r.status}`);
  }
  if (noAmc.length > 20) console.log(`    ... ${noAmc.length - 20} more in CSV`);
  console.log('');
}

const amcNoData = rows.filter((r) => r.reason === 'amc_no_holdings_in_db');
if (amcNoData.length) {
  const byAmc = {};
  for (const r of amcNoData) {
    byAmc[r.amc_name] = (byAmc[r.amc_name] || 0) + 1;
  }
  console.log(`  AMCs with zero holdings in DB (${Object.keys(byAmc).length} AMCs, ${amcNoData.length} listable funds):`);
  for (const [amc, count] of Object.entries(byAmc).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${count.toString().padStart(3)}  ${amc}`);
  }
  console.log('');
}

const otherOnly = rows.filter((r) => r.reason === 'amc_has_other_funds_only');
if (otherOnly.length) {
  console.log(`  Funds where AMC has holdings but not this scheme (${otherOnly.length}) — sample:`);
  for (const r of otherOnly.slice(0, 12)) {
    console.log(`    - ${r.name} [${r.amc_name}]`);
    console.log(`      other holder(s): ${r.holder_slug}`);
  }
  if (otherOnly.length > 12) console.log(`    ... ${otherOnly.length - 12} more in CSV`);
}
