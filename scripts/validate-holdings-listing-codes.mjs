#!/usr/bin/env node
/**
 * Report fund-holdings-by-slug rows missing mandatory ISIN/NSE/BSE (Indian equities).
 * Run: npm run validate:holdings-listing-codes
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { meetsListingCodePolicy, sanitizeListingCodes, isInternationalEquityFund } from './lib/listing-codes.mjs';

const dir = join(process.cwd(), 'public', 'data', 'fund-holdings-by-slug');
if (!existsSync(dir)) {
  console.error('Missing fund-holdings-by-slug/');
  process.exit(1);
}

let total = 0;
let violations = 0;
const samples = [];

for (const fileName of readdirSync(dir)) {
  if (!fileName.endsWith('.json')) continue;
  let data;
  try {
    data = JSON.parse(readFileSync(join(dir, fileName), 'utf-8'));
  } catch {
    continue;
  }
  if (!Array.isArray(data.stocks)) continue;

  const fundSlug = fileName.replace(/\.json$/, '');
  const fundContext = {
    fundSlug,
    internationalFund: isInternationalEquityFund(fundSlug),
  };

  for (const row of data.stocks) {
    total++;
    if (meetsListingCodePolicy(row, fundContext)) continue;
    violations++;
    if (samples.length < 15) {
      samples.push({
        fund: fileName.replace(/\.json$/, ''),
        name: row.name,
        sector: row.sector,
        codes: sanitizeListingCodes(row),
      });
    }
  }
}

console.log(`Holdings rows: ${total}`);
console.log(`Missing ISIN/NSE/BSE (Indian equity): ${violations}`);

if (violations > 0) {
  console.log('\nSample violations:');
  for (const s of samples) {
    console.log(`  ${s.fund} — ${s.name} (${s.sector || 'no sector'})`);
  }
  process.exit(1);
}

console.log('OK — all rows meet listing code policy.');
