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

import { readdirSync, writeFileSync, statSync, readFileSync, existsSync } from 'fs';
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
  if (fn.includes('april') || fn.includes('apr-2026') || fn.includes('30-04') || fn.includes('30-apr') || fn.includes('apr_2026') || fn.includes('april-2026') || fn.includes('_30_04') || fn.includes('30042026') || fn.includes('apr 2026') || fn.includes('april 2026') || /\d{1,2}\s+apr\b/i.test(fn)) return 'April 2026';
  if (fn.includes('march') || fn.includes('mar-2026') || fn.includes('31-03') || fn.includes('31-mar') || fn.includes('31march') || fn.includes('mar_2026') || fn.includes('march-2026') || fn.includes('_31_03') || fn.includes('mar2026') || fn.includes('31032026') || fn.includes('mar 2026') || fn.includes('march 2026') || /\d{1,2}\s+mar\b/i.test(fn)) return 'March 2026';
  if (fn.includes('may') || fn.includes('may-2026') || fn.includes('31-05') || fn.includes('may_2026') || fn.includes('_31_05') || fn.includes('may2026') || fn.includes('may 2026') || fn.includes('31052026') || /\d{1,2}\s+may\b/i.test(fn)) return 'May 2026';
  if (fn.includes('june') || fn.includes('jun-2026') || fn.includes('30-06') || fn.includes('30-jun') || fn.includes('jun_2026') || fn.includes('june-2026') || fn.includes('_30_06') || fn.includes('30062026') || fn.includes('jun 2026') || fn.includes('june 2026') || /\d{1,2}\s+jun\b/i.test(fn)) return 'June 2026';
  
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
      if (rowStr.includes('may') && rowStr.includes('2026') && !rowStr.includes('market')) return 'May 2026';
      if (rowStr.includes('june') && rowStr.includes('2026') && !rowStr.includes('market')) return 'June 2026';
      if (rowStr.includes('jun') && rowStr.includes('2026') && !rowStr.includes('market')) return 'June 2026';
      if (rowStr.includes('30-04-2026') || rowStr.includes('30/04/2026')) return 'April 2026';
      if (rowStr.includes('31-03-2026') || rowStr.includes('31/03/2026')) return 'March 2026';
      if (rowStr.includes('31-05-2026') || rowStr.includes('31/05/2026')) return 'May 2026';
      if (rowStr.includes('30-06-2026') || rowStr.includes('30/06/2026')) return 'June 2026';
      // Handle Excel date serial numbers (e.g., 46173 = May 31, 2026)
      if (rowStr.includes('46173') || rowStr.includes('46174')) return 'May 2026';
      if (rowStr.includes('46203') || rowStr.includes('46204')) return 'June 2026';
      if (rowStr.includes('46143') || rowStr.includes('46142')) return 'April 2026';
      if (rowStr.includes('46112') || rowStr.includes('46113')) return 'March 2026';
    }
    const fromStatement = detectMonthFromPortfolioStatement(sheetData);
    if (fromStatement) return fromStatement;
  }
  return null;
}

function detectMonthFromPortfolioStatement(sheetData) {
  if (!sheetData) return null;
  const monthMap = {
    january: 'January', jan: 'January',
    february: 'February', feb: 'February',
    march: 'March', mar: 'March',
    april: 'April', apr: 'April',
    may: 'May',
    june: 'June', jun: 'June',
    july: 'July', jul: 'July',
    august: 'August', aug: 'August',
    september: 'September', sep: 'September',
    october: 'October', oct: 'October',
    november: 'November', nov: 'November',
    december: 'December', dec: 'December',
  };
  for (let i = 0; i < Math.min(15, sheetData.length); i++) {
    const rowStr = JSON.stringify(sheetData[i] || []);
    const m = rowStr.match(/portfolio statement as on\s+([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (m) {
      const mon = monthMap[m[1].toLowerCase()];
      if (mon) return `${mon} ${m[3]}`;
    }
    const m2 = rowStr.match(/month ended\s+\d{1,2}\s+([a-z]+)/i);
    if (m2) {
      const partial = m2[1].toLowerCase();
      for (const [key, mon] of Object.entries(monthMap)) {
        if (key.startsWith(partial) || partial.startsWith(key.slice(0, 3))) {
          const yearMatch = rowStr.match(/20\d{2}/);
          return `${mon} ${yearMatch ? yearMatch[0] : '2026'}`;
        }
      }
    }
  }
  return null;
}

function dedupeFundMonthEntries(results) {
  const best = new Map();
  for (const entry of results) {
    const key = `${entry.slug}|${entry.month}`;
    const prev = best.get(key);
    if (!prev || entry.holdings.length > prev.holdings.length) {
      best.set(key, entry);
    }
  }
  return [...best.values()];
}

function peekWorkbookMonth(filepath) {
  try {
    const wb = XLSX.readFile(filepath, { sheetRows: 20 });
    for (const sn of wb.SheetNames) {
      if (sn.toLowerCase() === 'index') continue;
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
      const month = detectMonth('', data) || detectMonthFromPortfolioStatement(data);
      if (month) return month;
    }
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    return detectMonth('', data) || detectMonthFromPortfolioStatement(data);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// DETECT AMC FROM FILENAME/CONTENT
// ═══════════════════════════════════════════════════════════════
function detectAMC(filename, sheetData) {
  const fn = filename.toLowerCase();
  const firstRows = (sheetData || []).slice(0, 5).map(r => JSON.stringify(r || []).toLowerCase()).join(' ');
  const combined = fn + ' ' + firstRows;
  
  if (combined.includes('bank of india') || fn.includes('boi ')) return 'Bank of India';
  if (combined.includes('franklin') || combined.includes('templeton')) return 'Franklin India';
  if (combined.includes('navi ')) return 'Navi';
  if (combined.includes('old bridge') || fn.includes('oldbridge')) return 'Old Bridge';
  if (combined.includes('hdfc')) return 'HDFC';
  if (combined.includes('icici prudential') || combined.includes('icici pru')) return 'ICICI Prudential';
  if (combined.includes('sbi mutual') || combined.includes('sbi ') || (fn.startsWith('sbi') && !fn.includes('aditya'))) return 'SBI';
  if (fn.includes('all-schemes-monthly-portfolio')) return 'SBI';
  if (combined.includes('aditya birla') || combined.includes('absl') || fn.includes('abslmf')) return 'Aditya Birla Sun Life';
  if (combined.includes('bandhan')) return 'Bandhan';
  if (combined.includes('bajaj finserv') || fn.includes('bajaj')) return 'Bajaj Finserv';
  if (combined.includes('canara robeco') || fn.includes('canara')) return 'Canara Robeco';
  if (combined.includes('dsp')) return 'DSP';
  if (combined.includes('axis mutual') || combined.includes('axis ')) return 'Axis';
  if (combined.includes('kotak')) return 'Kotak';
  if (combined.includes('nippon india') || fn.includes('nimf')) return 'Nippon India';
  if (combined.includes('motilal oswal') || fn.includes('motilal')) return 'Motilal Oswal';
  if (combined.includes('invesco')) return 'Invesco India';
  if (combined.includes('edelweiss') || fn.includes('edel_') || fn.includes('edel_portfolio')) return 'Edelweiss';
  if (combined.includes('helios')) return 'Helios';
  if (combined.includes('lic mf') || fn.includes('lic ') || fn.startsWith('lic ')) return 'LIC';
  if (combined.includes('angel one') || fn.includes('angel-one')) return 'Angel One';
  if (combined.includes('groww') || /ib\d+-groww/i.test(fn)) return 'Groww';
  if (/cmfle?xi/i.test(fn) || combined.includes('capitalmind')) return 'Capitalmind';
  if (combined.includes('pgim')) return 'PGIM India';
  if (combined.includes('samco') || /in_mf_monthly_portfolio.*samco/i.test(fn)) return 'Samco';
  if (combined.includes('360 one') || /in_mf_monthly_portfolio.*360/i.test(fn)) return '360 ONE';
  if (combined.includes('apex') || fn.includes('woc ') || fn.startsWith('woc ')) return 'White Oak Capital';
  if (combined.includes('ppfas') || combined.includes('parag parikh')) return 'PPFAS';
  if (combined.includes('uti') || fn.includes('uti_mf') || fn.includes('fw_uti')) return 'UTI';
  if (combined.includes('taurus')) return 'Taurus';
  if (combined.includes('jm ') || fn.includes('jm ') || fn.includes('jm-')) return 'JM Financial';
  if (combined.includes('hsbc')) return 'HSBC';
  if (combined.includes('shriram')) return 'Shriram';
  if (combined.includes('sundaram')) return 'Sundaram';
  if (combined.includes('trust') || fn.includes('trustmf')) return 'Trust MF';
  if (combined.includes('unifi')) return 'Unifi';
  if (combined.includes('choice')) return 'Choice';
  if (combined.includes('jio') || fn.includes('jioblack')) return 'Jio BlackRock';
  if (combined.includes('abakkus')) return 'Abakkus';
  if (fn.includes('leeqtf') || fn.includes('portfolio-disclosures-monthly')) return 'Kotak';
  if (fn.includes('monthlyportfolio_') || (fn.includes('monthly_portfolio_') && !fn.includes('choice') && !fn.includes('iti') && !fn.includes('samco'))) return 'Kotak';
  if (fn.includes('portf') && fn.includes('holding') && fn.includes('may')) return 'Kotak';
  
  return 'Unknown';
}

// ═══════════════════════════════════════════════════════════════
// EXTRACT FUND NAME FROM FILENAME (AMC-specific patterns)
// ═══════════════════════════════════════════════════════════════
function fundNameFromFilename(filename) {
  const base = basename(filename);
  const stem = base.replace(/\.xlsxx?$/i, '');
  const spaced = stem.replace(/_/g, ' ');

  let m = spaced.match(/^PGIM\s+INDIA\s+(.+?)\s+(?:January|February|March|April|May|June|Jan|Feb|Mar|Apr|May|Jun)\s*2026/i);
  if (m) return `PGIM India ${m[1].trim()}`;

  m = stem.match(/^IB\d+-Groww\s+(.+)$/i);
  if (m) return `Groww ${m[1].trim()}`;

  if (/^CMFLEXI/i.test(stem)) return 'Capitalmind Flexi Cap Fund';

  m = stem.match(/Samco_?([A-Za-z_]+?)_\d{8,}/i);
  if (m) {
    const part = m[1].replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    return part.toLowerCase().includes('fund') ? `Samco ${part}` : `Samco ${part} Fund`;
  }

  if (/choice/i.test(stem) && /mutual|portfolio/i.test(stem)) {
    return 'Choice Flexi Cap Fund';
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// DETECT FUND NAME FROM SHEET DATA
// ═══════════════════════════════════════════════════════════════
function detectFundName(sheetData, sheetName, filename) {
  // Priority 1: Look for explicit "SCHEME NAME:" label (SBI, Kotak, etc. use this)
  for (let i = 0; i < Math.min(6, sheetData.length); i++) {
    const row = sheetData[i];
    if (!row) continue;
    for (let ci = 0; ci < row.length; ci++) {
      const cell = row[ci];
      if (!cell || typeof cell !== 'string') continue;
      const val = cell.trim().toLowerCase();
      if (val.includes('scheme name') || val === 'scheme name :' || val === 'scheme name:') {
        // The fund name is typically in the next cell or same row
        const nextCell = row[ci + 1];
        if (nextCell && typeof nextCell === 'string' && nextCell.trim().length > 5) {
          return nextCell.trim().replace(/\s*\(An open ended.*?\)/gi, '').replace(/\s*-\s*An Open.*$/gi, '').replace(/\r\n/g, ' ').trim();
        }
      }
    }
  }

  // Priority 2: Check first 5 rows for fund name (but skip generic AMC names)
  for (let i = 0; i < Math.min(5, sheetData.length); i++) {
    const row = sheetData[i];
    if (!row) continue;
    for (let ci = 0; ci < row.length; ci++) {
      const cell = row[ci];
      if (!cell || typeof cell !== 'string') continue;
      const val = cell.trim();
      if (val.includes('PORTFOLIO STATEMENT OF')) {
        return val.replace(/PORTFOLIO STATEMENT OF\s+/i, '').replace(/\s+AS ON.*$/i, '').replace(/\r\n/g, ' ').trim();
      }
      // Fund name pattern: reasonably long, contains fund-related keywords
      if (val.length > 10 && val.length < 150 && 
          (val.includes('Fund') || val.includes('FUND') || val.includes('ETF') || val.includes('FOF') || val.includes('Scheme')) &&
          !val.includes('Portfolio') && !val.includes('Monthly') &&
          !val.includes('Generated') && !val.includes('Statement') &&
          !val.includes('Name of') && !val.includes('ISIN')) {
        // Skip generic AMC names (e.g., "SBI Mutual Fund", "HDFC Mutual Fund")
        if (/^[A-Z\s]+ Mutual Fund$/i.test(val)) continue;
        if (val.endsWith('Mutual Fund') && val.split(' ').length <= 4) continue;
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

function shouldSkipNonEquityFund(fnLower) {
  return (
    fnLower.includes('liquid') ||
    fnLower.includes('overnight') ||
    fnLower.includes('money market') ||
    fnLower.includes('gilt') ||
    fnLower.includes('bond') ||
    fnLower.includes('debt') ||
    fnLower.includes('gold etf') ||
    fnLower.includes('gold fund') ||
    fnLower.includes('silver etf') ||
    fnLower.includes('silver fund') ||
    fnLower.includes('fixed maturity') ||
    fnLower.includes('savings fund') ||
    fnLower.includes('ultra short') ||
    fnLower.includes('corporate bond') ||
    fnLower.includes('credit risk') ||
    fnLower.includes('banking & psu') ||
    fnLower.includes('banking and psu debt') ||
    fnLower.includes('constant maturity') ||
    fnLower.includes('float') ||
    fnLower.includes('low duration') ||
    fnLower.includes('short duration') ||
    fnLower.includes('medium duration') ||
    fnLower.includes('medium term') ||
    fnLower.includes('long duration') ||
    fnLower.includes('dynamic bond') ||
    fnLower.includes('income fund') ||
    fnLower.includes('arbitrage') ||
    fnLower.includes('nifty sdl') ||
    fnLower.includes('target maturity') ||
    fnLower.includes('index fund') ||
    fnLower.includes('1d rate') ||
    fnLower.includes('insurance plan') ||
    fnLower.includes('hybrid') ||
    fnLower.includes('retirement') ||
    fnLower.includes("children's") ||
    fnLower.includes('children ') ||
    fnLower.includes('balanced advantage') ||
    fnLower.includes('asset allocation') ||
    fnLower.includes('fund of fund') ||
    fnLower.includes(' fo f') ||
    fnLower.includes('fof') ||
    fnLower.includes('exchange traded') ||
    fnLower.includes(' etf') ||
    fnLower.includes('conservative') ||
    fnLower.includes('interval fund') ||
    fnLower.includes('master equity plan') ||
    fnLower.includes('segregated')
  );
}

function isUtiSebiExposureFile(filepath, filename) {
  const fileLow = filename.toLowerCase();
  const pathLower = filepath.toLowerCase().replace(/\\/g, '/');
  return /sebi exposure/i.test(fileLow) && (pathLower.includes('uti_mf') || pathLower.includes('fw_uti'));
}

function normalizeUtiFundName(schemeLine) {
  return schemeLine
    .replace(/^SCHEME:\s*/i, '')
    .replace(/^UTI\s*-\s*/i, 'UTI ')
    .replace(/\s*\(.*$/, '')
    .replace(/\.\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUtiHoldingsFromBlock(data, startIdx, endIdx) {
  const holdings = [];
  let headerIdx = -1;
  const colName = 0;
  const colSector = 1;
  const colQty = 2;
  const colValue = 3;
  const colPct = 4;
  const colISIN = 7;

  for (let i = startIdx; i < Math.min(endIdx, startIdx + 15); i++) {
    const row = data[i];
    if (!row) continue;
    const rowStr = row.map((c) => String(c || '').toLowerCase()).join('|');
    if (rowStr.includes('name') && rowStr.includes('instrument')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  for (let i = headerIdx + 1; i < endIdx; i++) {
    const row = data[i];
    if (!row) continue;
    const c0 = String(row[colName] || '').trim();
    if (/^DEBT INSTRUMENTS/i.test(c0) || /^SCHEME CODE/i.test(c0)) break;
    if (/^TOTAL/i.test(c0) || /^EQUITY AND EQUITY/i.test(c0) || /^\(a\)/i.test(c0) || /^\(b\)/i.test(c0)) continue;
    if (!/^EQ\s*-/i.test(c0)) continue;

    const stockName = c0.replace(/^EQ\s*-\s*/i, '').trim();
    const isin = String(row[colISIN] || '').trim();
    const sector = String(row[colSector] || '').replace(/\r\n/g, ' ').trim();
    const qty = parseFloat(String(row[colQty] || '0').replace(/,/g, '')) || 0;
    const value = parseFloat(String(row[colValue] || '0').replace(/,/g, '')) || 0;
    let pct = parseFloat(String(row[colPct] || '0').replace(/,/g, '')) || 0;
    if (row[colPct] === '*' || pct > 30) pct = 0;
    if (!stockName || stockName.length < 3) continue;
    if (pct === 0 && value === 0) continue;

    holdings.push({
      name: stockName.replace(/\s+/g, ' '),
      isin: isin.startsWith('INE') || isin.startsWith('IN0') ? isin : '',
      sector,
      quantity: qty,
      value: Math.round(value * 100) / 100,
      pct: Math.round(pct * 100) / 100,
    });
  }

  holdings.sort((a, b) => b.pct - a.pct);
  return holdings.slice(0, 20);
}

function parseUtiSebiExposureFile(data, month) {
  const results = [];
  const blocks = [];

  for (let i = 0; i < data.length; i++) {
    const c0 = String((data[i] || [])[0] || '');
    if (/^SCHEME:\s*/i.test(c0)) {
      blocks.push({ schemeRow: i, name: normalizeUtiFundName(c0) });
    }
  }

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const startIdx = block.schemeRow;
    const endIdx = bi + 1 < blocks.length ? blocks[bi + 1].schemeRow : data.length;
    const fundName = block.name;
    if (!fundName || shouldSkipNonEquityFund(fundName.toLowerCase())) continue;

    const holdings = parseUtiHoldingsFromBlock(data, startIdx, endIdx);
    if (holdings.length < 3) continue;

    results.push({
      fundName,
      amc: 'UTI',
      month,
      holdings,
      slug: slugify(fundName),
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// PARSE HOLDINGS FROM A SHEET
// ═══════════════════════════════════════════════════════════════
function parseHoldingsFromSheet(data) {
  const holdings = [];
  
  // Find the header row (contains "ISIN" or "Name of the Instrument" or similar)
  let headerIdx = -1;
  let colName = -1, colISIN = -1, colSector = -1, colQty = -1, colValue = -1, colPct = -1;
  
  for (let i = 0; i < Math.min(30, data.length); i++) {
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
    
    // Skip debt/money market instruments — detected by credit rating in sector column
    // or by instrument name patterns (e.g., "7.35% Bharti Telecom Limited (15/10/2027)")
    if (sector && /^(CRISIL|ICRA|FITCH|CARE|IND|BWR|Brickwork)\s/i.test(sector)) continue;
    if (sector && /^(Sovereign|Floating|Fixed|Treasury|Money Market|Certificate|Mutual Fund)/i.test(sector)) continue;
    if (/^\d+\.?\d*\s*%\s/.test(stockName)) continue; // Names starting with coupon rate like "7.35% ..." or "7.35 % ..."
    if (/\(\d{2}\/\d{2}\/\d{4}\)/.test(stockName)) continue; // Names with maturity dates like "(15/10/2027)"
    if (/\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2,4}/i.test(stockName)) continue; // Dates like "01DEC2027"
    if (/T-BILL|TBILL|GOI|G\.?SEC|DAYS?\s+\d/i.test(stockName)) continue; // Government securities
    if (/\bNCD\b/i.test(stockName)) continue; // Non-Convertible Debentures
    if (/\(ZCB\)/i.test(stockName)) continue; // Zero coupon bonds
    if (/securitisation trust/i.test(stockName)) continue; // Securitized instruments
    if (/\bREIT\b|\bInvIT\b/i.test(stockName)) continue; // REITs and InvITs
    if (/\bPTC\b/i.test(stockName)) continue; // Pass-Through Certificates
    if (/commercial paper/i.test(stockName)) continue; // Commercial paper
    
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

function isJioBlackRockFile(filepath, filename) {
  const fileLow = filename.toLowerCase();
  const pathLower = filepath.toLowerCase().replace(/\\/g, '/');
  return /jioblackro-/i.test(fileLow) || pathLower.includes('jioblack') || pathLower.includes('jio-black');
}

function normalizeJioSheetCode(code) {
  return String(code || '').trim().replace(/'+$/g, '');
}

function buildJioSheetFundMap(wb) {
  const map = new Map();
  if (!wb.SheetNames.includes('Index')) return map;

  const idx = XLSX.utils.sheet_to_json(wb.Sheets.Index, { header: 1 });
  for (const row of idx) {
    if (!row || row.length < 3) continue;
    const shortName = normalizeJioSheetCode(row[1]);
    const schemeName = String(row[2] || '').trim();
    if (shortName && schemeName && /jioblackrock/i.test(schemeName)) {
      map.set(shortName, schemeName);
    }
  }
  return map;
}

function fundNameFromJioSheet(data, sheetName, sheetFundMap) {
  const code = normalizeJioSheetCode(sheetName);
  if (sheetFundMap.has(code)) return sheetFundMap.get(code);

  for (let i = 0; i < Math.min(4, data.length); i++) {
    const row = data[i] || [];
    for (const cell of row) {
      const val = String(cell || '').trim();
      if (/^JioBlackRock\s/i.test(val) && val.length < 120) return val;
    }
  }
  return null;
}

function parseJioBlackRockFile(wb, filename, filepath) {
  const results = [];
  const sheetFundMap = buildJioSheetFundMap(wb);

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase() === 'index') continue;

    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
    if (data.length < 5) continue;

    const month =
      detectMonth(filename, data) ||
      detectMonth(filepath, data) ||
      detectMonthFromPortfolioStatement(data);
    if (!month) continue;

    const fundName = fundNameFromJioSheet(data, sheetName, sheetFundMap);
    if (!fundName) continue;
    if (shouldSkipNonEquityFund(fundName.toLowerCase())) continue;

    const holdings = parseHoldingsFromSheet(data);
    if (holdings.length < 3) continue;

    results.push({
      fundName,
      amc: 'Jio BlackRock',
      month,
      holdings,
      slug: slugify(fundName),
    });
  }

  return results;
}

function isSundaramPortfolioFile(filepath, filename) {
  if (!/^monthlyportfolio_/i.test(filename)) return false;
  try {
    const wb = XLSX.readFile(filepath, { sheets: ['Index'], sheetRows: 8 });
    if (!wb.SheetNames.includes('Index')) return false;
    const idx = XLSX.utils.sheet_to_json(wb.Sheets.Index, { header: 1 });
    return JSON.stringify(idx).toLowerCase().includes('sundaram');
  } catch {
    return false;
  }
}

function isTrustPortfolioFile(filepath, filename) {
  return /^monthly port_/i.test(filename);
}

function buildSundaramSheetFundMap(wb) {
  const map = new Map();
  if (!wb.SheetNames.includes('Index')) return map;

  const idx = XLSX.utils.sheet_to_json(wb.Sheets.Index, { header: 1 });
  for (const row of idx) {
    if (!row || row.length < 3) continue;
    const shortName = String(row[1] || '').trim();
    const schemeName = String(row[2] || '').trim();
    if (shortName && schemeName && /sundaram/i.test(schemeName)) {
      map.set(shortName, schemeName);
    }
  }
  return map;
}

function fundNameFromSundaramSheet(data, sheetName, sheetFundMap) {
  if (sheetFundMap.has(sheetName)) return sheetFundMap.get(sheetName);

  for (let i = 0; i < Math.min(4, data.length); i++) {
    const row = data[i] || [];
    for (const cell of row) {
      const val = String(cell || '').trim();
      if (/^Sundaram\s/i.test(val) && val.length < 120) return val;
    }
  }
  return null;
}

function fundNameFromTrustSheet(data) {
  for (let i = 0; i < Math.min(4, data.length); i++) {
    const row = data[i] || [];
    for (const cell of row) {
      const val = String(cell || '').trim();
      if (/^TRUSTMF\s/i.test(val)) return val;
    }
  }
  return null;
}

function parseIndexMappedAmcFile(wb, filename, filepath, amc, sheetFundMap, fundNameResolver) {
  const results = [];

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase() === 'index') continue;

    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
    if (data.length < 5) continue;

    const month =
      detectMonth(filename, data) ||
      detectMonth(filepath, data) ||
      detectMonthFromPortfolioStatement(data);
    if (!month) continue;

    const fundName = fundNameResolver(data, sheetName, sheetFundMap);
    if (!fundName) continue;
    if (shouldSkipNonEquityFund(fundName.toLowerCase())) continue;

    const holdings = parseHoldingsFromSheet(data);
    if (holdings.length < 3) continue;

    results.push({
      fundName,
      amc,
      month,
      holdings,
      slug: slugify(fundName),
    });
  }

  return results;
}

function parseSundaramPortfolioFile(wb, filename, filepath) {
  const sheetFundMap = buildSundaramSheetFundMap(wb);
  return parseIndexMappedAmcFile(
    wb,
    filename,
    filepath,
    'Sundaram',
    sheetFundMap,
    fundNameFromSundaramSheet
  );
}

function parseTrustPortfolioFile(wb, filename, filepath) {
  return parseIndexMappedAmcFile(
    wb,
    filename,
    filepath,
    'Trust',
    new Map(),
    (data) => fundNameFromTrustSheet(data)
  );
}

// ═══════════════════════════════════════════════════════════════
// PROCESS A SINGLE FILE (may have multiple sheets = multiple funds)
// ═══════════════════════════════════════════════════════════════
function processFile(filepath, filename) {
  const results = [];
  
  const pathLower = filepath.toLowerCase().replace(/\\/g, '/');
  const fileLow = filename.toLowerCase();

  // Skip non-portfolio ancillary files
  if (/risk-o-meter|divmast|fut disclo|average-aum|annexure/i.test(fileLow) && !/portfolio-disclosure|monthly-portfolio/i.test(fileLow)) {
    return results;
  }

  // Detect AMC from full path (folders like "Monthly-Portfolio-Disclosure-April-2026" = ICICI)
  let pathAMC = null;
  if (pathLower.includes('monthly-portfolio-disclosure-')) pathAMC = 'ICICI Prudential';
  if (pathLower.includes('monthly portfolio-mar-2026') || pathLower.includes('monthly disclosure-april')) pathAMC = 'Aditya Birla Sun Life';
  if (pathLower.includes('all-schemes-monthly-portfolio')) pathAMC = 'SBI';
  if (pathLower.includes('portfolio-disclosures-monthly')) pathAMC = 'Kotak';
  if (pathLower.includes('fw_uti') || pathLower.includes('uti_mf')) pathAMC = 'UTI';
  if (pathLower.includes('31052026_abslmf') || pathLower.includes('abslmf')) pathAMC = 'Aditya Birla Sun Life';
  if (pathLower.includes('bank-of-india') || pathLower.includes('bank_of_india') || pathLower.includes('boi_')) pathAMC = 'Bank of India';
  if (pathLower.includes('navi')) pathAMC = 'Navi';
  if (pathLower.includes('old-bridge') || pathLower.includes('oldbridge') || pathLower.includes('old_bridge')) pathAMC = 'Old Bridge';
  if (pathLower.includes('franklin') || pathLower.includes('templeton')) pathAMC = 'Franklin India';
  if (pathLower.includes('taurus')) pathAMC = 'Taurus';
  if (pathLower.includes('abakkus')) pathAMC = 'Abakkus';
  if (pathLower.includes('trustmf') || pathLower.includes('trust-mf')) pathAMC = 'Trust MF';
  if (pathLower.includes('jioblack') || pathLower.includes('jio-black')) pathAMC = 'Jio BlackRock';
  if (pathLower.includes('angel-one') || pathLower.includes('angelone')) pathAMC = 'Angel One';
  if (pathLower.includes('unifi')) pathAMC = 'Unifi';
  if (pathLower.includes('groww') || /ib\d+-groww/i.test(fileLow)) pathAMC = 'Groww';
  if (/cmfle?xi/i.test(fileLow)) pathAMC = 'Capitalmind';
  if (pathLower.includes('pgim') || fileLow.startsWith('pgim')) pathAMC = 'PGIM India';
  if (pathLower.includes('shriram')) pathAMC = 'Shriram';
  if (pathLower.includes('choice')) pathAMC = 'Choice';
  if (pathLower.includes('edel_portfolio') || fileLow.startsWith('edel_')) pathAMC = 'Edelweiss';
  if (/samco/i.test(fileLow)) pathAMC = 'Samco';
  
  if (isUtiSebiExposureFile(filepath, filename)) {
    try {
      const wb = XLSX.readFile(filepath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const month = detectMonth(filename, data) || detectMonth(filepath, data);
      if (month) return parseUtiSebiExposureFile(data, month);
    } catch (e) {
      // fall through
    }
    return results;
  }

  if (isJioBlackRockFile(filepath, filename)) {
    try {
      const wb = XLSX.readFile(filepath);
      return parseJioBlackRockFile(wb, filename, filepath);
    } catch (e) {
      return results;
    }
  }

  if (isSundaramPortfolioFile(filepath, filename)) {
    try {
      const wb = XLSX.readFile(filepath);
      return parseSundaramPortfolioFile(wb, filename, filepath);
    } catch (e) {
      return results;
    }
  }

  if (isTrustPortfolioFile(filepath, filename)) {
    try {
      const wb = XLSX.readFile(filepath);
      return parseTrustPortfolioFile(wb, filename, filepath);
    } catch (e) {
      return results;
    }
  }

  try {
    const wb = XLSX.readFile(filepath);
    
    for (const sheetName of wb.SheetNames) {
      // Skip index/summary sheets
      if (sheetName.toLowerCase() === 'index' || sheetName.toLowerCase() === 'summary') continue;
      
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      if (data.length < 5) continue;
      
      const month = detectMonth(filename, data) || detectMonth(filepath, data);
      if (!month) continue; // Skip if can't determine month
      
      const amc = pathAMC || detectAMC(filepath, data) || detectAMC(filename, data);
      let fundName = fundNameFromFilename(filename) || detectFundName(data, sheetName, filename);
      if (pathAMC === 'ICICI Prudential' && filename.startsWith('ICICI')) {
        fundName = filename.replace(/\.xlsx?$/i, '');
      }
      const holdings = parseHoldingsFromSheet(data);
      
      if (holdings.length < 3) continue; // Skip if too few holdings (probably not equity)
      
      // Skip junk fund names (Excel column headers parsed as fund names)
      if (/^(Industry|Market|Rating|Quantity|Value|ISIN|%|Sl\.?\s*No|Sr\.?\s*No)/i.test(fundName)) continue;
      if (/Fair Value|Rs\.?\s*in\s*Lacs|Net Assets/i.test(fundName)) continue;
      
      // Only include equity funds (skip debt, gold, liquid, overnight etc.)
      const fnLower = (fundName + ' ' + sheetName).toLowerCase();
      if (shouldSkipNonEquityFund(fnLower)) continue;
      
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
function isDuplicateFolderPath(filePath) {
  // Skip re-downloaded copies like "Monthly-Portfolio-Disclosure-April-2026 (1)"
  return /\(1\)(\\|\/|$)/i.test(filePath) || /\\\(1\)\\|\/\(1\)\//i.test(filePath);
}

function getAllFiles(dir) {
  const results = [];
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (/\(1\)$/i.test(item)) continue;
      results.push(...getAllFiles(fullPath));
    } else if ((item.endsWith('.xlsx') || item.endsWith('.xls')) && !isDuplicateFolderPath(fullPath)) {
      results.push({ path: fullPath, name: item });
    }
  }
  
  return results;
}

const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function sortMonthLabels(months) {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split(' ');
    const [mb, yb] = b.split(' ');
    if (ya !== yb) return Number(ya) - Number(yb);
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
  });
}

function detectMonthQuick(filepath, filename) {
  const pathNorm = filepath.replace(/\\/g, '/');
  const fromName = detectMonth(filename, null) || detectMonth(pathNorm, null);
  if (fromName) return fromName;
  if (/jioblackro-/i.test(filename) || /sebi exposure/i.test(filename) || /^monthlyportfolio_/i.test(filename) || /^monthly port_/i.test(filename)) {
    return peekWorkbookMonth(filepath);
  }
  return null;
}

function rebuildAmcMap(holdings) {
  const amcs = {};
  for (const fund of Object.values(holdings)) {
    if (!fund.amc) continue;
    if (!amcs[fund.amc]) amcs[fund.amc] = [];
    if (!amcs[fund.amc].includes(fund.name)) amcs[fund.amc].push(fund.name);
  }
  for (const amc of Object.keys(amcs)) amcs[amc].sort();
  return amcs;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
const parseArgs = process.argv.slice(2);
const incremental = parseArgs.includes('--incremental');
const monthFilterArg = parseArgs.find((a) => a.startsWith('--month='))?.split('=')[1];

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  IPOfins — Holdings Data Parser');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  📂 Source: ${INPUT_DIR}`);
console.log('');

let allFiles = getAllFiles(INPUT_DIR);
const parsedMonths = new Set();

if (incremental || monthFilterArg) {
  for (const f of allFiles) {
    const m = detectMonthQuick(f.path, f.name);
    if (m) parsedMonths.add(m);
  }
  let targetMonth = monthFilterArg;
  if (!targetMonth) {
    const sorted = sortMonthLabels(parsedMonths);
    targetMonth = sorted[sorted.length - 1];
  } else if (!/\d{4}/.test(targetMonth)) {
    const match = sortMonthLabels(parsedMonths).find((m) =>
      m.toLowerCase().startsWith(targetMonth.toLowerCase())
    );
    if (match) targetMonth = match;
  }
  const before = allFiles.length;
  allFiles = allFiles.filter((f) => detectMonthQuick(f.path, f.name) === targetMonth);
  console.log(`  ⚡ Incremental mode: ${targetMonth} only (${allFiles.length}/${before} files)`);
  console.log('');
}

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

const beforeDedupe = allResults.length;
const dedupedResults = dedupeFundMonthEntries(allResults);
if (dedupedResults.length < beforeDedupe) {
  console.log(`  Deduped: ${beforeDedupe - dedupedResults.length} duplicate fund-month entries`);
}
allResults.length = 0;
allResults.push(...dedupedResults);

console.log(`  Processed: ${processed} files with holdings`);
console.log(`  Skipped: ${skipped} files (no equity holdings found)`);
console.log(`  Total fund-month entries: ${allResults.length}`);

// ═══════════════════════════════════════════════════════════════
// BUILD OUTPUT STRUCTURE
// ═══════════════════════════════════════════════════════════════
// Group by fund slug — collect months dynamically from parsed data
const monthSet = new Set();
const output = {
  lastUpdated: new Date().toISOString().split('T')[0],
  months: [],
  amcs: {},
  holdings: {},
};

// Group by fund slug
for (const entry of allResults) {
  const { slug, fundName, amc, month, holdings } = entry;
  monthSet.add(month);
  
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

output.months = sortMonthLabels(monthSet);

// Sort AMC fund lists
for (const amc of Object.keys(output.amcs)) {
  output.amcs[amc].sort();
}

// ═══════════════════════════════════════════════════════════════
// DATA QUALITY VALIDATION — Final pass before writing
// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('  🔍 Running data quality validation...');

let validationIssues = 0;

// 1. Remove holdings with 0% weight (parsing artifacts)
for (const [slug, fund] of Object.entries(output.holdings)) {
  const months = Object.keys(fund).filter(k => k !== 'name' && k !== 'amc');
  for (const month of months) {
    if (!Array.isArray(fund[month])) continue;
    const before = fund[month].length;
    fund[month] = fund[month].filter(h => h.pct > 0);
    if (before !== fund[month].length) validationIssues += (before - fund[month].length);
  }
}

// 2. Clean stock names (trailing special characters from Excel)
for (const [slug, fund] of Object.entries(output.holdings)) {
  const months = Object.keys(fund).filter(k => k !== 'name' && k !== 'amc');
  for (const month of months) {
    if (!Array.isArray(fund[month])) continue;
    for (const h of fund[month]) {
      h.name = h.name.replace(/[\s\$~!^#@\*]+$/g, '').replace(/\s+/g, ' ').trim();
      if (h.sector) h.sector = h.sector.replace(/[\s\$~!^#@\*]+$/g, '').replace(/\s+/g, ' ').trim();
    }
  }
}

// 3. Remove funds with insufficient data (< 3 holdings in all months)
const emptyFunds = [];
for (const [slug, fund] of Object.entries(output.holdings)) {
  const months = Object.keys(fund).filter(k => k !== 'name' && k !== 'amc');
  const hasEnough = months.some(m => Array.isArray(fund[m]) && fund[m].length >= 3);
  if (!hasEnough) {
    emptyFunds.push(fund.name);
    delete output.holdings[slug];
  }
}

// 4. Remove junk fund names (Excel column headers, etc.)
const junkFundPatterns = [
  /^(Industry|Market|Rating|Quantity|Value|ISIN|%|Sl\.?\s*No|Sr\.?\s*No)/i,
  /Fair Value|Rs\.?\s*in\s*Lacs|Net Assets/i,
  /^Product Labelling/i,
  /^Portfolio Statement/i,
  /^SCHEME CODE/i,
  /^\(Investment Manager/i,
];
for (const [slug, fund] of Object.entries(output.holdings)) {
  if (junkFundPatterns.some(p => p.test(fund.name))) {
    delete output.holdings[slug];
    validationIssues++;
  }
}

// 5. Update AMC lists to reflect final holdings
const finalFundNames = new Set(Object.values(output.holdings).map(f => f.name));
for (const [amc, funds] of Object.entries(output.amcs)) {
  output.amcs[amc] = funds.filter(f => finalFundNames.has(f));
  if (output.amcs[amc].length === 0) delete output.amcs[amc];
}

console.log(`    Removed ${validationIssues} invalid records`);
console.log(`    Removed ${emptyFunds.length} funds with insufficient data`);

const fundCount = Object.keys(output.holdings).length;
const amcCount = Object.keys(output.amcs).length;

console.log('');
console.log(`  📊 Final output:`);
console.log(`     Months: ${output.months.join(', ')}`);
console.log(`     AMCs: ${amcCount}`);
console.log(`     Funds with holdings: ${fundCount}`);
console.log('');
console.log('  AMC breakdown:');
for (const [amc, funds] of Object.entries(output.amcs).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`    ${amc.padEnd(22)} ${funds.length} funds`);
}

// Merge with existing JSON in incremental mode
let finalOutput = output;
if ((incremental || monthFilterArg) && existsSync(OUTPUT_FILE)) {
  const existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'));
  const monthsToReplace = new Set(output.months);
  for (const fund of Object.values(existing.holdings || {})) {
    for (const m of monthsToReplace) delete fund[m];
  }
  for (const [slug, fund] of Object.entries(output.holdings)) {
    if (!existing.holdings[slug]) {
      existing.holdings[slug] = { name: fund.name, amc: fund.amc };
    }
    Object.assign(existing.holdings[slug], fund);
  }
  existing.months = sortMonthLabels(new Set([...(existing.months || []), ...output.months]));
  existing.lastUpdated = output.lastUpdated;
  existing.amcs = rebuildAmcMap(existing.holdings);
  finalOutput = existing;
  console.log(`  🔀 Merged into existing JSON (${existing.months.length} months total)`);
}

writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
console.log('');
console.log(`  ✅ Written: src/data/fund-holdings.json`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');
