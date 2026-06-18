#!/usr/bin/env node
/**
 * Validate NAV → fund mapping: compare live AMFI data with Neon fund_navs.
 * Run: node --use-system-ca scripts/audit-nav-mapping.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { fetchAMFINAVs } from './lib/authorized-sources.mjs';
import { buildFundMatcher } from './lib/fund-match.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = neon(readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim());

const TOLERANCE = 0.02;

function namesCompatible(dbName, amfiName) {
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const a = norm(dbName);
  const b = norm(amfiName);
  return a.includes(b.slice(0, 12)) || b.includes(a.slice(0, 12)) || a === b;
}

console.log('\n═══ NAV Mapping Audit ═══\n');

const amfiFunds = await fetchAMFINAVs();
const amfiByCode = new Map(amfiFunds.map((f) => [f.schemeCode, f]));
const amfiBySlug = new Map(amfiFunds.map((f) => [f.slug, f]));

const fundRows = await sql`SELECT id, slug, name, amc_id FROM funds WHERE is_active = true`;
const amcRows = await sql`SELECT id, name, slug FROM amcs`;
const resolveFund = buildFundMatcher(fundRows, amcRows);

/** Best AMFI row for a holdings fund id (via matcher, not exact slug). */
const amfiByFundId = new Map();
for (const a of amfiFunds) {
  const fundId = resolveFund(a.slug, { name: a.name, amc: a.amc || '' });
  if (!fundId) continue;
  const prev = amfiByFundId.get(fundId);
  if (!prev) {
    amfiByFundId.set(fundId, a);
    continue;
  }
  // Prefer scheme already linked, else keep higher NAV growth option (not bonus)
  const dbFund = fundRows.find((f) => f.id === fundId);
  if (dbFund?.scheme_code === a.schemeCode) amfiByFundId.set(fundId, a);
}

function amfiForHoldingsFund(fund) {
  if (fund.scheme_code && amfiByCode.has(fund.scheme_code)) return amfiByCode.get(fund.scheme_code);
  if (amfiBySlug.has(fund.slug)) return amfiBySlug.get(fund.slug);
  return amfiByFundId.get(fund.id) ?? null;
}

const dbFunds = await sql`
  SELECT f.id, f.name, f.slug, f.scheme_code, f.category,
    fn.nav AS db_nav, fn.date AS nav_date
  FROM funds f
  LEFT JOIN LATERAL (
    SELECT nav, date FROM fund_navs WHERE fund_id = f.id ORDER BY date DESC LIMIT 1
  ) fn ON true
  WHERE f.is_active = true
`;

const holdingsFunds = await sql`
  SELECT DISTINCT f.id, f.name, f.slug, f.scheme_code
  FROM funds f
  JOIN fund_holdings fh ON fh.fund_id = f.id
  WHERE f.is_active = true
`;

const holdingsIds = new Set(holdingsFunds.map((f) => f.id));

let schemeMatch = 0;
let schemeMismatch = 0;
let slugOnlyMatch = 0;
let slugNameMismatch = 0;
let dualMapped = 0;
let amfiUnmapped = 0;
let holdingsWithNav = 0;
let holdingsNavCorrect = 0;
let holdingsNavWrong = 0;
let holdingsNoNav = 0;

const mismatchSamples = [];
const slugRiskSamples = [];
const holdingsIssues = [];

for (const amfi of amfiFunds) {
  const byCode = dbFunds.filter((f) => f.scheme_code === amfi.schemeCode);
  const bySlug = dbFunds.filter((f) => f.slug === amfi.slug);

  if (byCode.length === 0 && bySlug.length === 0) {
    amfiUnmapped++;
    continue;
  }

  if (byCode.length > 0 && bySlug.length > 0 && byCode[0].id !== bySlug[0].id) {
    dualMapped++;
  }

  const targets = new Set([...byCode, ...bySlug].map((f) => f.id));

  for (const fund of [...byCode, ...bySlug]) {
    if (fund.db_nav == null) continue;

    const navDiff = Math.abs(Number(fund.db_nav) - amfi.nav);
    if (fund.scheme_code === amfi.schemeCode) {
      if (navDiff <= TOLERANCE) schemeMatch++;
      else {
        schemeMismatch++;
        if (mismatchSamples.length < 8) {
          mismatchSamples.push({
            name: fund.name,
            scheme_code: fund.scheme_code,
            db_nav: Number(fund.db_nav),
            amfi_nav: amfi.nav,
            diff: navDiff.toFixed(4),
          });
        }
      }
    } else if (fund.slug === amfi.slug) {
      slugOnlyMatch++;
      if (!namesCompatible(fund.name, amfi.name) && navDiff <= TOLERANCE) {
        slugNameMismatch++;
        if (slugRiskSamples.length < 8) {
          slugRiskSamples.push({
            db_name: fund.name,
            amfi_name: amfi.name,
            slug: fund.slug,
            nav: Number(fund.db_nav),
          });
        }
      }
    }
  }
}

for (const fund of holdingsFunds) {
  const amfi = amfiForHoldingsFund(fund);

  if (fund.id && dbFunds.find((f) => f.id === fund.id)?.db_nav != null) {
    holdingsWithNav++;
    if (!amfi) {
      holdingsNavWrong++;
      if (holdingsIssues.length < 8) {
        holdingsIssues.push({ issue: 'no_amfi_match', name: fund.name, slug: fund.slug });
      }
    } else {
      const dbNav = Number(dbFunds.find((f) => f.id === fund.id).db_nav);
      if (Math.abs(dbNav - amfi.nav) <= TOLERANCE) holdingsNavCorrect++;
      else {
        holdingsNavWrong++;
        if (holdingsIssues.length < 8) {
          holdingsIssues.push({
            issue: 'nav_mismatch',
            name: fund.name,
            slug: fund.slug,
            db_nav: dbNav,
            amfi_nav: amfi.nav,
          });
        }
      }
    }
  } else {
    holdingsNoNav++;
  }
}

const fundsWithNav = dbFunds.filter((f) => f.db_nav != null).length;
const orphanNav = dbFunds.filter(
  (f) =>
    f.db_nav != null &&
    f.scheme_code &&
    !amfiByCode.has(f.scheme_code) &&
    !amfiBySlug.has(f.slug)
).length;

console.log('AMFI equity direct-growth funds parsed:', amfiFunds.length);
console.log('DB active funds with latest NAV:', fundsWithNav);
console.log('');
console.log('── Scheme-code mapping (gold standard) ──');
console.log('  NAV matches AMFI by scheme_code:', schemeMatch);
console.log('  NAV mismatch vs AMFI scheme_code:', schemeMismatch);
console.log('');
console.log('── Slug mapping (holdings funds) ──');
console.log('  Matched by slug only (no scheme_code on row):', slugOnlyMatch);
console.log('  Slug hit but DB name differs from AMFI:', slugNameMismatch);
console.log('  AMFI funds with split records (code≠slug id):', dualMapped);
console.log('  AMFI funds with no DB match:', amfiUnmapped);
console.log('');
console.log('── Holdings funds (what users see) ──');
console.log('  With holdings + NAV:', holdingsWithNav);
console.log('  Holdings NAV correct vs AMFI:', holdingsNavCorrect);
console.log('  Holdings NAV wrong / unverifiable:', holdingsNavWrong);
console.log('  Holdings funds still missing NAV:', holdingsNoNav);
console.log('');
console.log('── Orphans ──');
console.log('  DB funds with NAV but not in AMFI feed:', orphanNav);

if (mismatchSamples.length) {
  console.log('\n⚠️  Scheme-code NAV mismatches (sample):');
  console.table(mismatchSamples);
}
if (slugRiskSamples.length) {
  console.log('\n⚠️  Slug matched but names differ (sample):');
  console.table(slugRiskSamples);
}
if (holdingsIssues.length) {
  console.log('\n⚠️  Holdings fund issues (sample):');
  console.table(holdingsIssues);
}

const spotChecks = [
  'hdfc-large-cap-fund',
  'parag-parikh-flexi-cap-fund-an-open-ended-dynamic-equity-scheme-investing-across',
  'nippon-india-large-cap-fund',
  'nippon-india-vision-large-mid-cap-fund',
  'sbi-bluechip-fund',
  'lic-mf-banking-financial-services-fund',
  'sbi-flexi-cap-fund',
];
console.log('\n── Spot checks (holdings slugs) ──');
for (const slug of spotChecks) {
  const db = dbFunds.find((f) => f.slug === slug);
  const amfi = db ? amfiForHoldingsFund(db) : amfiBySlug.get(slug);
  if (!db) {
    console.log(`  ${slug}: NOT IN DB`);
    continue;
  }
  const ok =
    amfi && db.db_nav != null && Math.abs(Number(db.db_nav) - amfi.nav) <= TOLERANCE
      ? '✅'
      : db.db_nav != null
        ? '⚠️'
        : '❌ no NAV';
  console.log(
    `  ${ok} ${slug}: DB ₹${db.db_nav ?? '—'} | AMFI ₹${amfi?.nav ?? '—'} | scheme ${db.scheme_code ?? 'null'}`
  );
}

const accuracy =
  schemeMatch + holdingsNavCorrect > 0
    ? (
        ((schemeMatch + holdingsNavCorrect) /
          (schemeMatch + schemeMismatch + holdingsNavWrong + holdingsNavCorrect || 1)) *
        100
      ).toFixed(1)
    : '0';

console.log(`\nOverall mapping confidence: ~${accuracy}%`);
console.log(schemeMismatch === 0 && holdingsNavWrong === 0 ? '\n✅ Mapping looks correct.\n' : '\n❌ Review mismatches above.\n');
