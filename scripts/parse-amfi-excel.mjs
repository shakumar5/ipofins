/**
 * Parse AMFI Fund Performance Excel files downloaded from:
 * https://www.amfiindia.com/net-asset-value/fund-performance
 * 
 * 12 Categories (as per AMFI):
 * 1. Large Cap
 * 2. Large & Mid Cap
 * 3. Flexi Cap
 * 4. Multi Cap
 * 5. Mid Cap
 * 6. Small Cap
 * 7. Value
 * 8. Contra
 * 9. Dividend Yield
 * 10. Focused
 * 11. Sectoral/Thematic
 * 12. ELSS
 * 
 * Run: node scripts/parse-amfi-excel.mjs
 * Input: C:\Users\shaik\Downloads\funds\*.xlsx
 * Output: src/data/mutual-funds.json
 * 
 * Update frequency: Manual every 15 days
 * All returns are Direct-Growth plan only.
 */

import { readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = 'C:/Users/shaik/Downloads/funds/';
const OUTPUT_FILE = join(__dirname, '..', 'src', 'data', 'mutual-funds.json');

// ═══════════════════════════════════════════════════════════════
// FILE → CATEGORY MAPPING (all 12 AMFI categories)
// ═══════════════════════════════════════════════════════════════
const FILE_CATEGORY_MAP = {
  'Fund-Performance-07-Jun-2026--1049.xlsx': 'Large Cap',
  'Fund-Performance-07-Jun-2026--1050.xlsx': 'Large & Mid Cap',
  'Fund-Performance-07-Jun-2026--1050 (1).xlsx': 'Flexi Cap',
  'Fund-Performance-07-Jun-2026--1050 (2).xlsx': 'Multi Cap',
  'Fund-Performance-07-Jun-2026--1051.xlsx': 'Mid Cap',
  'Fund-Performance-07-Jun-2026--1051 (1).xlsx': 'Small Cap',
  'Fund-Performance-07-Jun-2026--1051 (2).xlsx': 'Value',
  'Fund-Performance-07-Jun-2026--1052.xlsx': 'ELSS',
  'Fund-Performance-07-Jun-2026--1052 (1).xlsx': 'Contra',
  'Fund-Performance-07-Jun-2026--1052 (2).xlsx': 'Dividend Yield',
  'Fund-Performance-07-Jun-2026--1052 (3).xlsx': 'Focused',
  'Fund-Performance-07-Jun-2026--1052 (4).xlsx': 'Sectoral/Thematic',
};

// ═══════════════════════════════════════════════════════════════
// RISK LEVEL MAPPING
// ═══════════════════════════════════════════════════════════════
function getRiskLevel(category) {
  switch (category) {
    case 'Large Cap': return 'moderate';
    case 'Large & Mid Cap': return 'high';
    case 'Flexi Cap': return 'moderate';
    case 'Multi Cap': return 'high';
    case 'Mid Cap': return 'high';
    case 'Small Cap': return 'very-high';
    case 'Value': return 'high';
    case 'Contra': return 'high';
    case 'Dividend Yield': return 'moderate';
    case 'Focused': return 'high';
    case 'Sectoral/Thematic': return 'very-high';
    case 'ELSS': return 'high';
    default: return 'moderate';
  }
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ═══════════════════════════════════════════════════════════════
// PARSE SINGLE EXCEL FILE
// ═══════════════════════════════════════════════════════════════
function parseFile(filepath, category) {
  const wb = XLSX.readFile(filepath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  
  // Find header row (contains "Scheme Name")
  let headerIdx = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] && data[i][0] === 'Scheme Name') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];
  
  const funds = [];
  
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0] || typeof row[0] !== 'string' || row[0].length < 5) continue;
    
    const name = row[0].trim();
    
    // Column indices (from AMFI Excel structure):
    // [0] Scheme Name
    // [5] NAV Regular
    // [6] NAV Direct
    // [7] Return 1Y Regular
    // [8] Return 1Y Direct
    // [9] Return 1Y Benchmark
    // [13] Return 3Y Direct
    // [18] Return 5Y Direct
    // [23] Return 10Y Direct
    // [31] Daily AUM (Cr.)
    
    const navDirect = parseFloat(row[6]) || null;
    const r1yDirect = row[8] !== undefined && row[8] !== null && row[8] !== '' ? parseFloat(row[8]) : null;
    const r3yDirect = row[13] !== undefined && row[13] !== null && row[13] !== '' ? parseFloat(row[13]) : null;
    const r5yDirect = row[18] !== undefined && row[18] !== null && row[18] !== '' ? parseFloat(row[18]) : null;
    const aum = parseFloat(row[31]) || null;
    
    // Skip funds with no NAV
    if (!navDirect || navDirect <= 0) continue;
    
    // Skip very small funds (AUM < 100 Cr) — too small to be relevant
    if (aum && aum < 100) continue;
    
    funds.push({
      name,
      slug: slugify(name),
      category,
      nav: Math.round(navDirect * 100) / 100,
      returns1y: r1yDirect !== null ? Math.round(r1yDirect * 10) / 10 : null,
      returns3y: r3yDirect !== null ? Math.round(r3yDirect * 10) / 10 : null,
      returns5y: r5yDirect !== null ? Math.round(r5yDirect * 10) / 10 : null,
      aum: aum ? `₹${Math.round(aum).toLocaleString('en-IN')} Cr` : '',
      riskLevel: getRiskLevel(category),
      rating: null,
    });
  }
  
  return funds;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  IPOfins — AMFI Fund Performance Parser');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  📅 ${new Date().toLocaleDateString('en-IN')}`);
console.log(`  📂 Source: ${INPUT_DIR}`);
console.log('');

const allFunds = [];
const files = readdirSync(INPUT_DIR).filter(f => f.endsWith('.xlsx'));

for (const file of files) {
  const category = FILE_CATEGORY_MAP[file];
  if (!category) {
    console.log(`  ⚠️  Skipping unknown file: ${file}`);
    continue;
  }
  
  const funds = parseFile(join(INPUT_DIR, file), category);
  console.log(`  ✅ ${category.padEnd(20)} → ${funds.length} funds  (${file})`);
  allFunds.push(...funds);
}

// Deduplicate by slug (keep first occurrence)
const seen = new Set();
const unique = allFunds.filter(f => {
  if (seen.has(f.slug)) return false;
  seen.add(f.slug);
  return true;
});

console.log('');
console.log(`  📊 Total unique funds: ${unique.length}`);

// ═══════════════════════════════════════════════════════════════
// ASSIGN STAR RATINGS (within each category, by 3Y returns)
// ═══════════════════════════════════════════════════════════════
const categories = [...new Set(unique.map(f => f.category))];
for (const cat of categories) {
  const catFunds = unique.filter(f => f.category === cat && f.returns3y !== null);
  catFunds.sort((a, b) => (b.returns3y || 0) - (a.returns3y || 0));
  
  catFunds.forEach((fund, idx) => {
    const percentile = idx / catFunds.length;
    if (percentile < 0.1) fund.rating = 5;       // Top 10%
    else if (percentile < 0.3) fund.rating = 4;  // Top 30%
    else if (percentile < 0.6) fund.rating = 3;  // Top 60%
    else if (percentile < 0.8) fund.rating = 2;  // Top 80%
    else fund.rating = 1;
  });
}

// Sort: by category alphabetically, then by 3Y return desc within category
unique.sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return (b.returns3y || 0) - (a.returns3y || 0);
});

// ═══════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('  Category breakdown:');
for (const cat of categories.sort()) {
  const count = unique.filter(f => f.category === cat).length;
  const top = unique.filter(f => f.category === cat)[0];
  console.log(`    ${cat.padEnd(20)} ${String(count).padStart(3)} funds   Top: ${top?.name?.substring(0, 35) || '-'}`);
}

writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2));

console.log('');
console.log(`  ✅ Written: src/data/mutual-funds.json (${unique.length} funds)`);
console.log('');
console.log('  ℹ️  Data: AMFI India (amfiindia.com) — Direct Plan returns only');
console.log('  ℹ️  Regular plan returns are typically 0.5–1.5% lower annually');
console.log('  ℹ️  Update: Manual every 15 days');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
