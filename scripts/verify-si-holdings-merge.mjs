#!/usr/bin/env node
/**
 * Verify curated super-investor holdings align with 1% Club name search
 * (e.g. AKASH BHANSHALI typo filings → Akash Bhansali profile).
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const HOLDER_STOP_WORDS = new Set([
  'ltd', 'limited', 'pvt', 'private', 'pte', 'llp', 'the', 'mr', 'mrs', 'ms', 'dr', 'shri', 'smt', 'kumar', 'kumari',
]);

function holderNameTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[.\-,()]/g, ' ')
    .replace(/\b(ltd|limited|pvt|private|pte|llp)\b/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !HOLDER_STOP_WORDS.has(t));
}

function tokensMatch(queryToken, nameToken) {
  if (nameToken === queryToken) return true;
  if (nameToken.startsWith(queryToken) || queryToken.startsWith(nameToken)) return true;
  return false;
}

function holderTokensMatchQuery(name, query) {
  const queryTokens = holderNameTokens(query);
  if (!queryTokens.length) return false;
  const nameTokens = holderNameTokens(name);
  if (!nameTokens.length) return false;
  return queryTokens.every((qt) => nameTokens.some((nt) => tokensMatch(qt, nt)));
}

function entityMatchesFilingName(entity, filingName) {
  const candidates = [entity.name, entity.displayName, ...(entity.aliases || [])].filter(Boolean);
  return candidates.some(
    (c) => holderTokensMatchQuery(filingName, c) || holderTokensMatchQuery(c, filingName),
  );
}

const exportPath = join(ROOT, 'public', 'data', 'one-percent-holder-positions.json');
assert.ok(existsSync(exportPath), 'one-percent-holder-positions.json missing — run export pipeline');

const positions = JSON.parse(readFileSync(exportPath, 'utf8'));
const roster = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'super-investors.json'), 'utf8'));

const akash = roster.find((e) => e.name === 'Akash Bhansali');
assert.ok(akash, 'Akash Bhansali missing from roster');

let matchedStocks = 0;
for (const [key, list] of Object.entries(positions)) {
  if (!key.startsWith('name:')) continue;
  const filingName = key.slice(5);
  if (!entityMatchesFilingName(akash, filingName)) continue;
  matchedStocks += list.length;
}

assert.ok(
  matchedStocks >= 10,
  `Expected 10+ 1% Club positions for Akash Bhansali via name match, got ${matchedStocks}`,
);

// AKASH BHANSHALI (filing typo) must surface as name-matched, not only roster aliases.
const typoKey = 'name:AKASH BHANSHALI';
assert.ok(
  positions[typoKey]?.length >= 10,
  `Expected AKASH BHANSHALI filing key in export, got ${positions[typoKey]?.length ?? 0}`,
);

console.log(`verify-si-holdings-merge: ok (${matchedStocks} positions; filing key ${typoKey} present)`);
