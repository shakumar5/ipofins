/**
 * IPOfins — Holdings Data Parser
 * 
 * Parses mutual fund portfolio disclosure Excel files from multiple AMCs.
 * Each AMC has a different format, but all contain:
 *   - Stock/Instrument Name
 *   - ISIN (unique identifier)
 *   - Industry/Sector
 *   - Quantity
 *   - Market Value (Rs. in Lakhs)
 *   - % to NAV/Net Assets
 * 
 * Input:  C:\Users\shaik\Downloads\Holdings\*.xlsx (+ subfolders)
 * Output: src/data/fund-holdings.json
 * 
 * Structure of output:
 * {
 *   "months": ["March 2026", "April 2026"],
 *   "amcs": { "HDFC": [...fundNames], "ICICI": [...] },
 *   "holdings": {
 *     "fund-slug": {
 *       "name": "HDFC Mid Cap Fund",
 *       "amc": "HDFC",
 *       "April 2026": [ {name, isin, sector, quantity, value, pct}, ... ],
 *       "March 2026": [ ... ]
 *     }
 *   }
 * }
 */

import { readdirSync, writeFileSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = 'C:/Users/shaik/Downloads/Holdings/';
const OUTPUT_FILE = join(__dirname, '..', 'src', 'data', 'fund-holdings.json');

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 80);
}

// ═══════════════════════════════════════════════════════════════
// DETECT MONTH FROM FILENAME/CONTENT
// ═══════════════════════════════════════════════════════════════
function detectMonth(filename, sheetData) {
  const fn = (typeof filename === 'string' ? filename : '').toLowerCase();
  // Check filename first
  if (fn.includes('april') || fn.includes('apr-2026') || fn.includes('30-04') || fn.includes('30-apr') || fn.includes('apr_2026') || fn.includes('april-2026') || fn.includes('_30_04')) return 'April 2026';
  if (fn.includes('march') || fn.includes('mar-2026') || fn.includes('31-03') || fn.includes('31-mar') || fn.includes('31march') || fn.includes('mar_2026') || fn.includes('march-2026') || fn.includes('_31_03') || fn.includes('mar2026')) return 'March 2026';
  if (fn.includes('may') || fn.includes('may-2026') || fn.includes('31-05') || fn.includes('may_2026')) return 'May 2026';
  if (fn.includes('june') || fn.includes('jun-2026') || fn.includes('30-06') || fn.includes('jun_2026')) return 'June 2026';
  
  // Support folder structure: Holdings/2026/May/
  const pathMatch = fn.match(/holdings[\/\\](\d{4})[\/\\](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)/);
  if (pathMatch) {
    const year = pathMatch[1];
    const monthNames = { jan:'January', feb:'February', mar:'March', apr:'April', may:'May', jun:'June', jul:'July', aug:'August', sep:'September', oct:'October', nov:'November', dec:'December', january:'January', february:'February', march:'March', april:'April', june:'June', july:'July', august:'August', september:'September', october:'October', november:'November', december:'December' };
    const m = monthNames[pathMatch[2]];
    if (m) return `${m} ${year}`;
  }
  
  // Check first few rows of data
  if (sheetData) {
    for (let i = 0; i < Math.min(5, sheetData.length); i++) {
      const rowStr = JSON.stringify(sheetData[i] || []).toLowerCase();
      if (rowStr.includes('apr') && rowStr.includes('2026')) return 'April 2026';
      if (rowStr.includes('march') && rowStr.includes('2026')) return 'March 2026';
      if (rowStr.includes('mar') && rowStr.includes('2026') && !rowStr.includes('market')) return 'March 2026';
      if (rowStr.includes('30-04-2026') || rowStr.includes('30/04/2026')) return 'April 2026';
      if (rowStr.includes('31-03-2026') || rowStr.includes('31/03/2026')) return 'March 2026';
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// DETECT AMC FROM FILENAME/CONTENT
// ═══════════════════════════════════════════════════════════════
function detectAMC(filename, sheetData) {
  const fn = filename.toLowerCase();
  const firstRows = (sheetData || []).slice(0, 5).map(r => JSON.stringify(r || []).toLowerCase()).join(' ');
  const combined = fn + ' ' + firstRows;
  
  if (combined.includes('hdfc')) return 'HDFC';
  if (combined.includes('icici prudential') || combined.includes('icici pru')) return 'ICICI Prudential';
  if (combined.includes('sbi mutual') || combined.includes('sbi ') || (fn.startsWith('sbi') && !fn.includes('aditya'))) return 'SBI';
  if (combined.includes('aditya birla') || combined.includes('absl')) return 'Aditya Birla Sun Life';
  if (combined.includes('bandhan')) return 'Bandhan';
  if (combined.includes('bajaj finserv') || fn.includes('bajaj')) return 'Bajaj Finserv';
  if (combined.includes('canara robeco') || fn.includes('canara')) return 'Canara Robeco';
  if (combined.includes('dsp')) return 'DSP';
  if (combined.includes('axis mutual') || combined.includes('axis ')) return 'Axis';
  if (combined.includes('kotak')) return 'Kotak';
  if (combined.includes('nippon india')) return 'Nippon India';
  if (combined.includes('motilal oswal')) return 'Motilal Oswal';
  if (combined.includes('invesco')) return 'Invesco';
  if (combined.includes('edelweiss') || fn.includes('edel_')) return 'Edelweiss';
  if (combined.includes('helios')) return 'Helios';
  if (combined.includes('lic mf') || fn.includes('lic ')) return 'LIC';
  if (combined.includes('angel one') || fn.includes('angel-one')) return 'Angel One';
  if (combined.includes('360 one') || fn.includes('in_mf')) return '360 ONE';
  if (combined.includes('choice')) return 'Choice';
  if (combined.includes('jio') || fn.includes('jioblack')) return 'Jio';
  if (combined.includes('baroda') || combined.includes('bob') || fn.includes('bobbnp')) return 'Baroda BNP Paribas';
  if (combined.includes('mirae')) return 'Mirae Asset';
  if (combined.includes('iti mutual') || combined.includes('iti ')) return 'ITI';
  if (combined.includes('mahindra manulife') || combined.includes('mahindra')) return 'Mahindra Manulife';
  if (combined.includes('quant mutual') || combined.includes('quant ')) return 'Quant';
  if (fn.includes('contra') || fn.includes('flexi-cap') || fn.includes('large-cap') || fn.includes('multi-cap') || fn.includes('smallcap') || fn.includes('midcap-fund') || fn.includes('focused-fund') || fn.includes('elss-tax')) return 'Quant';
  if (fn.includes('monthly-portfolio') && fn.includes('isin')) return 'Mirae Asset';
  if (combined.includes('groww') || fn.startsWith('ib0') || fn.startsWith('ib1') || fn.startsWith('ib2') || fn.startsWith('ib3') || fn.startsWith('ib4')) return 'Groww';
  if (fn.includes('cmflexi')) return 'Groww';
  if (combined.includes('apex')) return 'White Oak';
  
  return 'Unknown';
}

// ═══════════════════════════════════════════════════════════════
// DETECT FUND NAME FROM SHEET DATA
// ═══════════════════════════════════════════════════════════════
function detectFundName(sheetData, sheetName, filename) {
  // Check first 5 rows for fund name
  for (let i = 0; i < Math.min(5, sheetData.length); i++) {
    const row = sheetData[i];
    if (!row) continue;
    for (let ci = 0; ci < row.length; ci++) {
      const cell = row[ci];
      if (!cell || typeof cell !== 'string') continue;
      const val = cell.trim();
      // Fund name pattern: reasonably long, contains fund-related keywords
      if (val.length > 10 && val.length < 150 && 
          (val.includes('Fund') || val.includes('FUND') || val.includes('ETF') || val.includes('FOF') || val.includes('Scheme')) &&
          !val.includes('Portfolio') && !val.includes('Monthly') &&
          !val.includes('Generated') && !val.includes('Statement') &&
          !val.includes('Name of') && !val.includes('ISIN')) {
        // Clean up
        return val.replace(/\s*\(An open ended.*?\)/gi, '').replace(/\s*-\s*An Open.*$/gi, '').replace(/\r\n/g, ' ').trim();
      }
    }
  }
  
  // Second pass: look for any string > 15 chars in first few rows that looks like a name
  for (let i = 0; i < Math.min(4, sheetData.length); i++) {
    const row = sheetData[i];
    if (!row) continue;
    for (const cell of row) {
      if (!cell || typeof cell !== 'string') continue;
      const val = cell.trim();
      if (val.length > 15 && val.length < 100 && 
          !val.includes('Portfolio') && !val.includes('Monthly') &&
          !val.includes('Generated') && !val.includes('Statement') &&
          !val.includes('Name of') && !val.includes('ISIN') &&
          !val.includes('Crisil') && !val.match(/^\d/) &&
          /^[A-Z]/.test(val)) {
        return val.replace(/\r\n/g, ' ').trim();
      }
    }
  }
  
  // Fallback: use sheet name if meaningful (not just a code)
  if (sheetName && sheetName.length > 5 && !sheetName.match(/^(Sheet|IDF|RBLF|AO\d|BF)/i)) {
    return sheetName;
  }
  
  // Fallback: extract from filename
  let fn = filename.replace(/\.xlsx?$/i, '').replace(/[-_]/g, ' ').replace(/\d{2,}/g, '').trim();
  // Clean common prefixes
  fn = fn.replace(/Monthly Portfolio (April|March|May|June|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb) /i, '');
  return fn || sheetName;
}

// ═══════════════════════════════════════════════════════════════
// PARSE HOLDINGS FROM A SHEET
// ═══════════════════════════════════════════════════════════════
function parseHoldingsFromSheet(data) {
  const holdings = [];
  
  // Find the header row (contains "ISIN" or "Name of the Instrument" or similar)
  let headerIdx = -1;
  let colName = -1, colISIN = -1, colSector = -1, colQty = -1, colValue = -1, colPct = -1;
  
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const rowStr = row.map(c => String(c || '').toLowerCase()).join('|');
    
    if (rowStr.includes('isin') && (rowStr.includes('name') || rowStr.includes('instrument'))) {
      headerIdx = i;
      // Map columns
      for (let j = 0; j < row.length; j++) {
        const h = String(row[j] || '').toLowerCase().replace(/\r\n/g, ' ');
        if (h.includes('name') && h.includes('instrument')) colName = j;
        else if (h === 'isin') colISIN = j;
        else if (h.includes('industry') || h.includes('rating') || h.includes('sector')) colSector = j;
        else if (h.includes('quantity') || h === 'qty') colQty = j;
        else if (h.includes('market') || h.includes('fair value') || h.includes('value')) colValue = j;
        else if (h.includes('% to') || h.includes('% of') || h.includes('net assets') || h.includes('nav')) colPct = j;
      }
      break;
    }
  }
  
  if (headerIdx === -1) return [];
  
  // If colName not found, try common positions
  if (colName === -1) colName = colISIN > 0 ? colISIN - 1 : 1;
  if (colISIN === -1) colISIN = colName + 1;
  if (colPct === -1) colPct = -1; // Will look for it
  
  // First pass: determine if pct column uses decimal format (0.0487) or percentage format (4.87)
  let maxPctValue = 0;
  if (colPct >= 0) {
    for (let i = headerIdx + 1; i < Math.min(headerIdx + 20, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const val = parseFloat(String(row[colPct] || '0').replace(/,/g, '')) || 0;
      if (val > maxPctValue) maxPctValue = val;
    }
  }
  // If the max value in pct column is < 1, all values are decimals (e.g., 0.0487 = 4.87%)
  const isDecimalFormat = maxPctValue > 0 && maxPctValue < 1;
  
  // Parse data rows
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    
    // Get stock name
    let stockName = String(row[colName] || '').trim();
    if (!stockName || stockName.length < 3) continue;
    
    // Get ISIN
    let isin = String(row[colISIN] || '').trim();
    
    // Skip non-equity rows (section headers, totals, etc.)
    if (stockName.match(/^(equity|listed|awaiting|reit|total|sub total|net|cash|repo|treps|reverse|money market|debt|fixed|treasury|commercial|certificate|debenture|bond|government|state|gsec|g-sec)/i)) continue;
    if (stockName.includes('Equity & Equity') || stockName.includes('EQUITY & EQUITY')) continue;
    if (stockName.includes('(a) Listed') || stockName.includes('(b) Unlisted')) continue;
    if (stockName.includes('Grand Total') || stockName.includes('Sub Total') || stockName.includes('Net Assets')) continue;
    
    // Must have a valid ISIN (INE...) or at least a numeric quantity
    const hasISIN = isin.startsWith('INE') || isin.startsWith('IN0');
    const qty = parseFloat(String(row[colQty] || '0').replace(/,/g, '')) || 0;
    
    if (!hasISIN && qty === 0) continue;
    
    // Get sector
    let sector = colSector >= 0 ? String(row[colSector] || '').trim() : '';
    
    // Get value (Rs in Lakhs)
    let value = colValue >= 0 ? parseFloat(String(row[colValue] || '0').replace(/,/g, '')) || 0 : 0;
    
    // Get percentage
    let pct = 0;
    if (colPct >= 0) {
      const rawPct = row[colPct];
      pct = parseFloat(String(rawPct || '0').replace(/,/g, '')) || 0;
      // Convert decimals to percentage if sheet uses decimal format
      if (isDecimalFormat && pct > 0) {
        pct = pct * 100; // 0.0487 → 4.87
      }
      // Cap at 30% — single holding above 30% is very rare, likely an error
      if (pct > 30) pct = 0;
    }
    
    // Skip if percentage is 0 and value is 0
    if (pct === 0 && value === 0) continue;
    
    holdings.push({
      name: stockName.replace(/\s+/g, ' '),
      isin: hasISIN ? isin : '',
      sector: sector.replace(/\r\n/g, ' '),
      quantity: qty,
      value: Math.round(value * 100) / 100,
      pct: Math.round(pct * 100) / 100,
    });
  }
  
  // Sort by percentage descending (top holdings first)
  holdings.sort((a, b) => b.pct - a.pct);
  
  // Return top 20 holdings only (keep data manageable)
  return holdings.slice(0, 20);
}

// ═══════════════════════════════════════════════════════════════
// PROCESS A SINGLE FILE (may have multiple sheets = multiple funds)
// ═══════════════════════════════════════════════════════════════
function processFile(filepath, filename) {
  const results = [];
  
  // Detect AMC from full path (folders like "Monthly-Portfolio-Disclosure-April-2026" = ICICI)
  const pathLower = filepath.toLowerCase().replace(/\\/g, '/');
  let pathAMC = null;
  if (pathLower.includes('monthly-portfolio-disclosure-')) pathAMC = 'ICICI Prudential';
  if (pathLower.includes('monthly portfolio-mar-2026') || pathLower.includes('monthly disclosure-april')) pathAMC = 'Aditya Birla Sun Life';
  
  try {
    const wb = XLSX.readFile(filepath);
    
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      if (data.length < 5) continue;
      
      const month = detectMonth(filename, data) || detectMonth(filepath, data);
      if (!month) continue; // Skip if can't determine month
      
      const amc = pathAMC || detectAMC(filename, data);
      // For ICICI: fund name is in the filename itself
      let fundName = detectFundName(data, sheetName, filename);
      if (pathAMC === 'ICICI Prudential' && filename.startsWith('ICICI')) {
        fundName = filename.replace(/\.xlsx?$/i, '');
      }
      const holdings = parseHoldingsFromSheet(data);
      
      if (holdings.length < 3) continue; // Skip if too few holdings (probably not equity)
      
      // Only include equity funds (skip debt, gold, liquid, overnight etc.)
      const fnLower = (fundName + ' ' + sheetName).toLowerCase();
      if (fnLower.includes('liquid') || fnLower.includes('overnight') || 
          fnLower.includes('money market') || fnLower.includes('gilt') ||
          fnLower.includes('bond') || fnLower.includes('debt') ||
          fnLower.includes('gold etf') || fnLower.includes('silver etf') ||
          fnLower.includes('fixed maturity') || fnLower.includes('savings fund') ||
          fnLower.includes('ultra short') || fnLower.includes('corporate bond') ||
          fnLower.includes('credit risk') || fnLower.includes('banking & psu debt') ||
          fnLower.includes('constant maturity') || fnLower.includes('float')) continue;
      
      results.push({
        fundName,
        amc,
        month,
        holdings,
        slug: slugify(fundName),
      });
    }
  } catch (e) {
    // Skip files that can't be read
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════
// SCAN ALL FILES RECURSIVELY
// ═══════════════════════════════════════════════════════════════
function getAllFiles(dir) {
  const results = [];
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      results.push(...getAllFiles(fullPath));
    } else if (item.endsWith('.xlsx') || item.endsWith('.xls')) {
      results.push({ path: fullPath, name: item });
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  IPOfins — Holdings Data Parser');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  📂 Source: ${INPUT_DIR}`);
console.log('');

const allFiles = getAllFiles(INPUT_DIR);
console.log(`  Found ${allFiles.length} Excel files to process...`);
console.log('');

const allResults = [];
let processed = 0;
let skipped = 0;

for (const file of allFiles) {
  const results = processFile(file.path, file.name);
  if (results.length > 0) {
    allResults.push(...results);
    processed++;
  } else {
    skipped++;
  }
}

console.log(`  Processed: ${processed} files with holdings`);
console.log(`  Skipped: ${skipped} files (no equity holdings found)`);
console.log(`  Total fund-month entries: ${allResults.length}`);

// ═══════════════════════════════════════════════════════════════
// BUILD OUTPUT STRUCTURE
// ═══════════════════════════════════════════════════════════════
const output = {
  lastUpdated: new Date().toISOString().split('T')[0],
  months: ['March 2026', 'April 2026'],
  amcs: {},
  holdings: {},
};

// Group by fund slug
for (const entry of allResults) {
  const { slug, fundName, amc, month, holdings } = entry;
  
  if (!output.holdings[slug]) {
    output.holdings[slug] = {
      name: fundName,
      amc,
    };
  }
  
  output.holdings[slug][month] = holdings;
  
  // Track AMCs
  if (!output.amcs[amc]) output.amcs[amc] = [];
  if (!output.amcs[amc].includes(fundName)) {
    output.amcs[amc].push(fundName);
  }
}

// Sort AMC fund lists
for (const amc of Object.keys(output.amcs)) {
  output.amcs[amc].sort();
}

const fundCount = Object.keys(output.holdings).length;
const amcCount = Object.keys(output.amcs).length;

console.log('');
console.log(`  📊 Final output:`);
console.log(`     AMCs: ${amcCount}`);
console.log(`     Funds with holdings: ${fundCount}`);
console.log('');
console.log('  AMC breakdown:');
for (const [amc, funds] of Object.entries(output.amcs).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`    ${amc.padEnd(22)} ${funds.length} funds`);
}

writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
console.log('');
console.log(`  ✅ Written: src/data/fund-holdings.json`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');
