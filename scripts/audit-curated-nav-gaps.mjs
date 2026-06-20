#!/usr/bin/env node
/**
 * List curated funds missing NAV and why (offline — uses JSON only).
 * Run: node scripts/audit-curated-nav-gaps.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildCuratedFundList, indexMutualFunds, resolveMfFundForParserSlug } from './lib/canonical-fund-filter.mjs';
import { slugify, slugVariants } from './lib/fund-match.mjs';
import { baseSlug } from './lib/mf-hub-holdings-meta.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const holdings = JSON.parse(readFileSync(join(ROOT, 'src/data/fund-holdings.json'), 'utf8'));
const mutualFunds = JSON.parse(readFileSync(join(ROOT, 'src/data/mutual-funds.json'), 'utf8'));
const mfIndex = indexMutualFunds(mutualFunds);

const curated = buildCuratedFundList(holdings, mutualFunds);
const withNav = curated.filter((f) => f.nav != null && Number(f.nav) > 0);
const missingNav = curated.filter((f) => f.nav == null || Number(f.nav) <= 0);

function classify(fund) {
  const fundData = holdings.holdings[fund.parserSlug] || {};
  const schemeInHoldings = String(fundData.scheme_code || fundData.schemeCode || '').trim();
  const mf = resolveMfFundForParserSlug(fund.parserSlug, fundData, mfIndex);

  if (!mf) {
    if (schemeInHoldings) return 'no_mf_match_but_holdings_has_scheme';
    return 'no_mf_match';
  }
  if (mf.nav == null || Number(mf.nav) <= 0) return 'mf_match_nav_null';
  return 'unexpected_has_nav';
}

function fuzzyMfCandidates(parserSlug, fundData) {
  const name = String(fundData.name || '').toLowerCase();
  const amc = String(fundData.amc || '').toLowerCase();
  const b = baseSlug(parserSlug);
  const variants = new Set([parserSlug, b, ...slugVariants(b)]);

  return mutualFunds
    .filter((mf) => {
      const mfBase = baseSlug(mf.slug);
      if (variants.has(mf.slug) || variants.has(mfBase)) return true;
      for (const v of slugVariants(mfBase)) {
        if (variants.has(v)) return true;
      }
      const mfName = mf.name.toLowerCase();
      return amc && mfName.includes(amc.split(' ')[0]) && mfName.includes(name.split(' ').slice(0, 3).join(' ').slice(0, 20));
    })
    .slice(0, 3)
    .map((mf) => ({ slug: mf.slug, name: mf.name, schemeCode: mf.schemeCode, nav: mf.nav }));
}

const byReason = {};
for (const f of missingNav) {
  const reason = classify(f);
  byReason[reason] = (byReason[reason] || 0) + 1;
}

const byCategory = {};
for (const f of missingNav) {
  byCategory[f.category] = (byCategory[f.category] || 0) + 1;
}

const byAmc = {};
for (const f of missingNav) {
  byAmc[f.amc] = (byAmc[f.amc] || 0) + 1;
}

console.log('\n═══ Curated NAV gap analysis (offline) ═══\n');
console.log(`Curated funds:     ${curated.length}`);
console.log(`With NAV:          ${withNav.length}`);
console.log(`Missing NAV:       ${missingNav.length}`);
console.log(`With scheme code:  ${curated.filter((f) => f.schemeCode).length}`);
console.log(`Missing scheme:    ${curated.filter((f) => !f.schemeCode).length}`);

console.log('\n── Missing NAV by reason ──');
for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason}: ${count}`);
}

console.log('\n── Missing NAV by category ──');
for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}

console.log('\n── Top AMCs with missing NAV ──');
for (const [amc, count] of Object.entries(byAmc).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${amc}: ${count}`);
}

const details = missingNav.map((f) => {
  const fundData = holdings.holdings[f.parserSlug] || {};
  const reason = classify(f);
  const schemeInHoldings = String(fundData.scheme_code || fundData.schemeCode || '').trim();
  const fuzzy = reason.startsWith('no_mf') ? fuzzyMfCandidates(f.parserSlug, fundData) : [];
  return {
    name: f.name,
    category: f.category,
    amc: f.amc,
    parserSlug: f.parserSlug,
    dbSlug: f.dbSlug,
    schemeCode: f.schemeCode || schemeInHoldings || null,
    mfSlug: f.mfSlug,
    reason,
    fuzzyCandidates: fuzzy.length ? fuzzy : undefined,
  };
});

const outPath = join(ROOT, 'scripts/output/curated-nav-gaps.json');
import { mkdirSync, writeFileSync } from 'fs';
mkdirSync(join(ROOT, 'scripts/output'), { recursive: true });
writeFileSync(outPath, JSON.stringify({ summary: { curated: curated.length, withNav: withNav.length, missingNav: missingNav.length, byReason, byCategory, byAmc }, funds: details }, null, 2));

console.log(`\n── Sample missing NAV (first 15) ──`);
for (const row of details.slice(0, 15)) {
  console.log(`  [${row.reason}] ${row.name}`);
  console.log(`    parser: ${row.parserSlug}`);
  console.log(`    scheme: ${row.schemeCode || '—'}  mf: ${row.mfSlug || '—'}`);
  if (row.fuzzyCandidates?.length) {
    console.log(`    fuzzy: ${row.fuzzyCandidates.map((c) => c.slug).join(', ')}`);
  }
}

console.log(`\nFull list written: ${outPath}\n`);
