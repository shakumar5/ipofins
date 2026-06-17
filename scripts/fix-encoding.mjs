/**
 * Fix mojibake (UTF-8 read as Latin-1) in ipos.json.
 *
 * Strategy:
 *  1. Load the last clean git HEAD version as the base.
 *  2. Merge in any NEW fields added since HEAD (subscription, GMP, financials, etc.)
 *     that are NOT corrupt (no \uFFFD or â/Ã sequences).
 *  3. Apply direct string replacements for known mojibake patterns on all string values.
 *  4. Save.
 *
 * Known mojibake → correct:
 *   â‚¹   → ₹    (Indian Rupee sign)
 *   â€"  → —    (em dash)
 *   â€"  → –    (en dash)  
 *   â€™  → '    (right single quote)
 *   â€œ  → "    (left double quote)
 *   â€   → "    (right double quote)
 *   Ã¢â‚¬â€ → —  (em dash compound)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IPOS_PATH  = join(__dirname, '..', 'src', 'data', 'ipos.json');
const HEAD_PATH  = join(__dirname, 'ipos_head_clean.json');

// ── Replacement table — longer patterns must come first ───────────────────────
const REPLACEMENTS = [
  ['Ã¢â‚¬â€œ', '\u201C'],  // "
  ['Ã¢â‚¬â€™', '\u2019'],  // '
  ['Ã¢â‚¬â€"', '\u2014'],  // — (em)
  ['Ã¢â‚¬â€"', '\u2013'],  // – (en)
  ['Ã¢â‚¬â€',  '\u2014'],  // — variant
  ['Ã¢â‚¬Â',   '\u00A0'],  // NBSP
  ['â‚¹',       '₹'],
  ['â€"',       '\u2014'],
  ['â€"',       '\u2013'],
  ['â€™',       '\u2019'],
  ['â€œ',       '\u201C'],
  ['â€',        '\u201D'],
  ['Ã©',        'é'],
  ['Ã¨',        'è'],
  ['Ã ',        'à'],
  ['Ã®',        'î'],
  ['Ã§',        'ç'],
  ['Ã‚',        ''],
];

function isMojibake(str) {
  return typeof str === 'string' && (str.includes('â') || str.includes('Ã') || str.includes('\x80'));
}

function isCorrupt(str) {
  return typeof str === 'string' && str.includes('\uFFFD');
}

function fixString(str) {
  if (typeof str !== 'string') return str;
  if (!isMojibake(str)) return str;
  let s = str;
  for (const [from, to] of REPLACEMENTS) {
    if (s.includes(from)) s = s.split(from).join(to);
  }
  return s;
}

function fixDeep(val) {
  if (typeof val === 'string') return fixString(val);
  if (Array.isArray(val))      return val.map(fixDeep);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = fixDeep(v);
    return out;
  }
  return val;
}

function isValueCorrupt(val) {
  const s = JSON.stringify(val ?? '');
  return s.includes('\uFFFD');
}

// ── Load both versions ────────────────────────────────────────────────────────
const headIpos    = JSON.parse(readFileSync(HEAD_PATH,  'utf-8'));  // clean baseline
const currentIpos = JSON.parse(readFileSync(IPOS_PATH,  'utf-8'));  // may have \uFFFD

const headMap    = new Map(headIpos.map(i    => [i.slug, i]));
const currentMap = new Map(currentIpos.map(i => [i.slug, i]));

// ── Build merged result ───────────────────────────────────────────────────────
const result = [];
let fixedCount = 0;

for (const [slug, current] of currentMap) {
  const head = headMap.get(slug);

  if (!head) {
    // Brand-new IPO added since HEAD — just fix mojibake, keep as-is
    result.push(fixDeep(current));
    continue;
  }

  // Merge: start from HEAD (clean), then overlay fields that are NEWER and NOT corrupt
  const merged = { ...head };

  for (const [key, currentVal] of Object.entries(current)) {
    const headVal   = head[key];
    const corrupt   = isValueCorrupt(currentVal);

    if (corrupt) {
      // Field got damaged by previous bad run — keep HEAD value
      if (headVal !== undefined) {
        merged[key] = headVal;
      }
      continue;
    }

    // Prefer current value if it has more data (newer fetches)
    const currentStr = JSON.stringify(currentVal ?? '');
    const headStr    = JSON.stringify(headVal ?? '');

    if (currentStr !== headStr) {
      merged[key] = currentVal; // newer/different data from working tree
    }
  }

  // Now apply mojibake fix on the merged result
  const fixed = fixDeep(merged);

  if (JSON.stringify(fixed) !== JSON.stringify(head)) fixedCount++;
  result.push(fixed);
}

// Add any IPOs in HEAD not in current (shouldn't happen, but safety)
for (const [slug, ipo] of headMap) {
  if (!currentMap.has(slug)) result.push(fixDeep(ipo));
}

// ── Validate: no \uFFFD or mojibake remaining ─────────────────────────────────
// Also fix any ??????? patterns left from old git-corrupted data (₹ stored as ???)
result.forEach(ipo => {
  // Replace leading ??? sequences (from old git corruption of ₹ symbol) with ₹
  if (ipo.issueSize && /^\?+/.test(ipo.issueSize)) {
    ipo.issueSize = ipo.issueSize.replace(/^\?+/, '₹');
  }
  if (ipo.purpose && ipo.purpose.includes('???')) {
    ipo.purpose = ipo.purpose.replace(/\?{3,}/g, '₹');
  }
});
let remaining = 0;
result.forEach(ipo => {
  const s = JSON.stringify(ipo);
  if (s.includes('\uFFFD')) { console.log('  ⚠️  Still has \\uFFFD:', ipo.name); remaining++; }
  if (s.includes('â‚¹'))    { console.log('  ⚠️  Still has â‚¹:', ipo.name); remaining++; }
  if (s.includes('Ã¢'))     { console.log('  ⚠️  Still has Ã¢:', ipo.name); remaining++; }
});

// ── Save ─────────────────────────────────────────────────────────────────────
writeFileSync(IPOS_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8');

console.log(`\n  ✅ Done. ${result.length} IPOs saved.`);
if (remaining === 0) {
  console.log('  ✅ No encoding issues remaining.');
} else {
  console.log(`  ⚠️  ${remaining} fields still need attention.`);
}
