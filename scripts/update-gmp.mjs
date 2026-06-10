#!/usr/bin/env node
/**
 * Update GMP (Grey Market Premium) for IPOs
 * 
 * USAGE:
 *   node scripts/update-gmp.mjs "Hexagon Nutrition=7" "CMR Green=45" "Utkal=-5"
 *   node scripts/update-gmp.mjs --clear          (sets all GMP to null)
 *   node scripts/update-gmp.mjs --list           (shows current GMP values)
 * 
 * NOTES:
 *   - Matches IPO names loosely (case-insensitive, partial match)
 *   - Positive number = premium, negative = discount
 *   - Only updates live/closed IPOs (not listed ones)
 *   - This is OPTIONAL — run only when you have GMP data to update
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '../src/data/ipos.json');

function loadIPOs() {
  return JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
}

function saveIPOs(data) {
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function findIPO(ipos, searchName) {
  const query = searchName.toLowerCase().trim();
  // Try exact slug match first
  let match = ipos.find(ipo => ipo.slug === query);
  if (match) return match;
  // Try name contains
  match = ipos.find(ipo => ipo.name.toLowerCase().includes(query));
  if (match) return match;
  // Try partial word match
  const words = query.split(/\s+/);
  match = ipos.find(ipo => {
    const name = ipo.name.toLowerCase();
    return words.every(w => name.includes(w));
  });
  return match || null;
}

// --- Main ---
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║         IPOfins — GMP Update Tool (Optional)         ║
╚═══════════════════════════════════════════════════════╝

Usage:
  node scripts/update-gmp.mjs "IPO Name=GMP" "IPO Name=GMP" ...
  node scripts/update-gmp.mjs --list
  node scripts/update-gmp.mjs --clear

Examples:
  node scripts/update-gmp.mjs "Hexagon Nutrition=7" "CMR Green=45"
  node scripts/update-gmp.mjs "Utkal=-5"
  node scripts/update-gmp.mjs --list
`);
  process.exit(0);
}

const ipos = loadIPOs();

// --list: Show current GMP values
if (args[0] === '--list') {
  const activeIPOs = ipos.filter(i => i.status === 'live' || i.status === 'closed');
  if (activeIPOs.length === 0) {
    console.log('  No live/closed IPOs found.');
  } else {
    console.log('\n  Current GMP values:\n');
    console.log(`  ${'IPO Name'.padEnd(40)} ${'Status'.padEnd(8)} GMP`);
    console.log('  ' + '─'.repeat(60));
    for (const ipo of activeIPOs) {
      const gmpStr = ipo.gmp !== null && ipo.gmp !== undefined ? `₹${ipo.gmp}` : '—';
      console.log(`  ${ipo.name.padEnd(40)} ${ipo.status.padEnd(8)} ${gmpStr}`);
    }
  }
  console.log('');
  process.exit(0);
}

// --clear: Set all GMP to null
if (args[0] === '--clear') {
  let count = 0;
  for (const ipo of ipos) {
    if (ipo.gmp !== null && ipo.gmp !== undefined) {
      ipo.gmp = null;
      count++;
    }
  }
  saveIPOs(ipos);
  console.log(`  ✓ Cleared GMP for ${count} IPOs.`);
  process.exit(0);
}

// Parse "Name=Value" pairs
let updated = 0;
let notFound = [];

for (const arg of args) {
  const eqIdx = arg.lastIndexOf('=');
  if (eqIdx === -1) {
    console.log(`  ⚠️  Skipping invalid format: "${arg}" (expected "Name=GMP")`);
    continue;
  }

  const name = arg.slice(0, eqIdx).trim();
  const value = arg.slice(eqIdx + 1).trim();
  const gmpValue = parseFloat(value);

  if (isNaN(gmpValue)) {
    console.log(`  ⚠️  Skipping "${name}": invalid GMP value "${value}"`);
    continue;
  }

  const ipo = findIPO(ipos, name);
  if (!ipo) {
    notFound.push(name);
    continue;
  }

  const oldGmp = ipo.gmp;
  ipo.gmp = gmpValue;
  updated++;
  console.log(`  ✓ ${ipo.name}: GMP ${oldGmp ?? '—'} → ₹${gmpValue}`);
}

if (notFound.length > 0) {
  console.log(`\n  ⚠️  Not found: ${notFound.join(', ')}`);
  console.log('  Available live/closed IPOs:');
  const active = ipos.filter(i => i.status === 'live' || i.status === 'closed');
  for (const ipo of active) {
    console.log(`    - ${ipo.name}`);
  }
}

if (updated > 0) {
  saveIPOs(ipos);
  console.log(`\n  ✅ Updated GMP for ${updated} IPO(s). Remember to commit & push.`);
} else {
  console.log('\n  No updates made.');
}
