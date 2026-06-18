import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const sql = neon(env.match(/DATABASE_URL=(.+)/)[1].trim());

/** Official AMFI member list (55 AMCs, amfiindia.com) */
const AMFI_MEMBERS = [
  'Abakkus',
  'Aditya Birla Sun Life',
  'AlphaGrep',
  'Angel One',
  'ASK',
  'Axis',
  'Bajaj Finserv',
  'Bandhan',
  'Bank of India',
  'Baroda BNP Paribas',
  'Canara Robeco',
  'Capitalmind',
  'Choice',
  'DSP',
  'Edelweiss',
  'Franklin Templeton',
  'Groww',
  'HDFC',
  'Helios',
  'HSBC',
  'ICICI Prudential',
  'IL&FS',
  'Invesco',
  'ITI',
  'Jio BlackRock',
  'JM Financial',
  'Kotak Mahindra',
  'Lakshya',
  'LIC',
  'Mahindra Manulife',
  'Mirae Asset',
  'Monarch',
  'Motilal Oswal',
  'Navi',
  'Nippon India',
  'NJ',
  'Old Bridge',
  'PGIM India',
  'PPFAS',
  'Quant',
  'Quantum',
  'Samco',
  'SBI',
  'Shriram',
  'Sundaram',
  'Tata',
  'Taurus',
  'The Wealth Company',
  'Trust',
  'Unifi',
  'Union',
  'UTI',
  'WhiteOak Capital',
  'Zerodha',
  '360 ONE',
];

/** Map AMFI name → our DB / parser canonical name */
const TO_OUR = {
  'Franklin Templeton': 'Franklin India',
  Invesco: 'Invesco India',
  'Baroda BNP Paribas': 'Baroda BNP',
  PPFAS: 'Parag Parikh',
  'Kotak Mahindra': 'Kotak',
  Quant: 'Quant',
};

function ourName(amfi) {
  return TO_OUR[amfi] || amfi;
}

const [latest] = await sql`SELECT MAX(month) AS month FROM fund_holdings`;

const dbAmcs = await sql`SELECT name FROM amcs WHERE name != 'Other'`;
const dbSet = new Set(dbAmcs.map((r) => r.name));

const withHoldings = await sql`
  SELECT DISTINCT a.name
  FROM fund_holdings fh
  JOIN funds f ON f.id = fh.fund_id
  JOIN amcs a ON a.id = f.amc_id
  WHERE fh.month = ${latest.month} AND a.name != 'Other'
`;
const holdingsSet = new Set(withHoldings.map((r) => r.name));

const parsed = JSON.parse(readFileSync(join(ROOT, 'src/data/fund-holdings.json'), 'utf-8'));
const PARSER_MAP = {
  'Franklin India': 'Franklin Templeton',
  'Invesco India': 'Invesco',
  'Baroda BNP Paribas': 'Baroda BNP',
  'Trust MF': 'Trust',
  'White Oak Capital': 'WhiteOak Capital',
  Jio: 'Jio BlackRock',
  Kotak: 'Kotak Mahindra',
  PPFAS: 'PPFAS',
};
const parsedSet = new Set(
  Object.keys(parsed.amcs || {}).map((n) => {
    const m = PARSER_MAP[n];
    if (m) return ourName(m) === m ? m : m;
    // reverse lookup
    for (const amfi of AMFI_MEMBERS) {
      if (ourName(amfi) === n || n.includes(amfi.split(' ')[0])) return amfi;
    }
    return n;
  })
);
// Simpler: check if parser amc string matches
function inParsed(amfi) {
  const keys = Object.keys(parsed.amcs || {});
  const on = ourName(amfi);
  return keys.some(
    (k) =>
      k.toLowerCase().includes(amfi.toLowerCase().split(' ')[0]) ||
      k === on ||
      (amfi === 'Franklin Templeton' && k.includes('Franklin')) ||
      (amfi === 'Invesco' && k.includes('Invesco')) ||
      (amfi === 'PPFAS' && k.includes('PPFAS')) ||
      (amfi === 'Kotak Mahindra' && k === 'Kotak') ||
      (amfi === 'Baroda BNP Paribas' && k.includes('Baroda')) ||
      (amfi === 'Trust' && k.includes('Trust')) ||
      (amfi === 'WhiteOak Capital' && k.includes('White')) ||
      (amfi === 'Jio BlackRock' && k.includes('Jio'))
  );
}

const missing = [];
const partial = [];
const covered = [];

for (const amfi of AMFI_MEMBERS) {
  const ours = ourName(amfi);
  const hasDb = dbSet.has(ours);
  const hasHoldings = holdingsSet.has(ours);
  const hasParsed = inParsed(amfi);

  if (hasHoldings) {
    covered.push({ amfi, ours, status: '✅ Has equity holdings (May)' });
  } else if (hasParsed || hasDb) {
    partial.push({
      amfi,
      ours,
      status: hasParsed && !hasHoldings ? '⚠️ In Holdings folder, not in DB' : '⚠️ In master DB, no May holdings',
      hasParsed,
      hasDb,
    });
  } else {
    missing.push({ amfi, status: '❌ Not in folder or DB' });
  }
}

console.log('\n=== AMFI AMC coverage (55 registered members) ===\n');
console.log(`✅ With equity holdings: ${covered.length}`);
console.log(`⚠️  In system but no May holdings: ${partial.length}`);
console.log(`❌ Completely missing: ${missing.length}`);
console.log(`📦 Plus 44 funds in "Other" bucket (mapping issue, not separate AMCs)\n`);

console.log('--- ✅ COVERED (' + covered.length + ') ---');
covered.forEach((r) => console.log(`  ${r.amfi}`));

console.log('\n--- ⚠️  PARTIAL — in DB or folder, no May equity holdings (' + partial.length + ') ---');
partial.forEach((r) => {
  const bits = [];
  if (r.hasDb) bits.push('master DB');
  if (r.hasParsed) bits.push('Holdings folder');
  console.log(`  ${r.amfi}  (${bits.join(', ')})`);
});

console.log('\n--- ❌ MISSING — not in Holdings folder & no holdings (' + missing.length + ') ---');
missing.forEach((r) => console.log(`  ${r.amfi}`));

console.log('\nNote: AMFI lists 55 members (not 51). We track equity-only holdings from monthly disclosures.\n');
