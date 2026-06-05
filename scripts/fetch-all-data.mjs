/**
 * IPOfins — Automated Data Fetcher
 * 
 * PRIMARY SOURCES:
 * ═══════════════
 * IPO Data:
 *   1. BSE India  → https://www.bseindia.com/publicissue.html (Live IPOs, price, dates)
 *   2. NSE India  → https://www.nseindia.com/market-data/all-upcoming-issues-ipo (Subscription data)
 *   3. SEBI       → https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=10 (DRHP filings = upcoming)
 * 
 * Mutual Fund Data:
 *   1. AMFI India → https://www.amfiindia.com/spages/NAVAll.txt (All NAVs, daily)
 * 
 * RUNS: Every 12 hours via GitHub Actions
 * ZERO manual intervention. No API keys needed.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function writeData(filename, data) {
  const filepath = join(DATA_DIR, filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  ✅ ${filename} — ${Array.isArray(data) ? data.length + ' records' : 'updated'}`);
}

function readExisting(filename) {
  const filepath = join(DATA_DIR, filename);
  if (existsSync(filepath)) return JSON.parse(readFileSync(filepath, 'utf-8'));
  return [];
}

async function fetchWithHeaders(url) {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// 1. IPO DATA — BSE India (Primary for live IPOs)
// Source: https://www.bseindia.com/publicissue.html
// ═══════════════════════════════════════════════════════════════

async function fetchBSEIPOs() {
  console.log('\n  📊 [BSE] Fetching live IPO data...');
  
  try {
    // BSE renders table via JavaScript — try their API endpoint instead
    const response = await fetchWithHeaders('https://www.bseindia.com/publicissue.html');
    if (!response.ok) throw new Error(`BSE returned ${response.status}`);
    
    const html = await response.text();
    const ipos = parseBSEHtml(html);
    
    if (ipos.length === 0) {
      console.log('    BSE HTML parsing returned 0 (JS-rendered page). Trying alternative...');
      // Fallback: try Chittorgarh for IPO data
      return await fetchChittorgarhIPOs();
    }
    
    console.log(`    Found ${ipos.length} entries from BSE`);
    return ipos;
  } catch (error) {
    console.log(`    ⚠️ BSE fetch failed: ${error.message}`);
    return await fetchChittorgarhIPOs();
  }
}

async function fetchChittorgarhIPOs() {
  console.log('    Trying Chittorgarh as fallback...');
  try {
    const response = await fetchWithHeaders('https://www.chittorgarh.com/report/ipo-in-india-list-main-board-sme/82/');
    if (!response.ok) throw new Error(`Chittorgarh returned ${response.status}`);
    
    const html = await response.text();
    const ipos = [];
    
    // Chittorgarh uses tables with IPO data
    // Look for rows containing IPO info
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    
    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const row = match[1];
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellPattern.exec(row)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      
      // Chittorgarh table typically has: Company | Open | Close | Price | Size | Type
      if (cells.length >= 4) {
        const name = cells[0]?.replace(/\s+/g, ' ').trim();
        if (name && name.length > 3 && !name.includes('Company') && !name.includes('IPO Name')) {
          // Check if it looks like an IPO entry (has date-like values)
          const hasDate = cells.some(c => /\d{2}[\s-]\w{3}[\s-]\d{4}|\d{2}[\s-]\d{2}[\s-]\d{4}/.test(c));
          if (hasDate) {
            ipos.push({
              name,
              slug: slugify(name),
              priceRange: cells.find(c => /^\d+[\s-]+\d+$|^\d+$/.test(c.replace(/[₹,]/g, ''))) || '0',
              lotSize: 0,
              openDate: '',
              closeDate: '',
              status: 'live',
              type: name.toLowerCase().includes('sme') ? 'sme' : 'mainboard',
              sector: 'Others',
            });
          }
        }
      }
    }
    
    console.log(`    Found ${ipos.length} entries from Chittorgarh`);
    return ipos;
  } catch (error) {
    console.log(`    ⚠️ Chittorgarh fallback also failed: ${error.message}`);
    return [];
  }
}

function parseBSEHtml(html) {
  const ipos = [];
  
  // BSE table rows contain: Company | Segment | Open | Close | Price | LotSize | Type | Status
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const row = match[1];
    const cells = [];
    let cellMatch;
    
    while ((cellMatch = cellPattern.exec(row)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    
    // BSE IPO table: Company | Segment | OpenDate | CloseDate | Price | LotSize | Type | Status
    if (cells.length >= 7 && cells[7] === 'Live' && (cells[6] === 'IPO' || cells[6] === 'FPO')) {
      const name = cells[0].replace(/\s+/g, ' ').trim();
      const segment = cells[1]; // MainBoard or SME
      const openDate = cells[2];
      const closeDate = cells[3];
      const priceRange = cells[4];
      const lotSize = parseInt(cells[5]) || 0;
      
      if (name && name.length > 2) {
        ipos.push({
          name,
          slug: slugify(name),
          priceRange: priceRange.replace(/\s/g, ''),
          lotSize,
          openDate: formatBSEDate(openDate),
          closeDate: formatBSEDate(closeDate),
          status: 'live',
          type: segment.toLowerCase().includes('sme') ? 'sme' : 'mainboard',
          sector: 'Others',
        });
      }
    }
  }
  
  return ipos;
}

function formatBSEDate(dateStr) {
  // BSE format: DD-MM-YYYY → Month DD, YYYY
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[parseInt(parts[1]) - 1] || parts[1];
  return `${month} ${parts[0]}, ${parts[2]}`;
}

// ═══════════════════════════════════════════════════════════════
// 2. IPO SUBSCRIPTION — NSE India
// Source: https://www.nseindia.com/market-data/all-upcoming-issues-ipo
// ═══════════════════════════════════════════════════════════════

async function fetchNSESubscription() {
  console.log('\n  📈 [NSE] Fetching subscription data...');
  
  try {
    // NSE requires session cookies - first hit the main page
    const mainResponse = await fetchWithHeaders('https://www.nseindia.com');
    if (!mainResponse.ok) throw new Error(`NSE main page returned ${mainResponse.status}`);
    
    // Get cookies from response
    const cookies = mainResponse.headers.get('set-cookie') || '';
    
    // Now fetch IPO data with cookies
    const response = await fetch('https://www.nseindia.com/api/ipo-current-issue', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Cookie': cookies,
        'Referer': 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
      },
    });
    
    if (!response.ok) throw new Error(`NSE API returned ${response.status}`);
    
    const data = await response.json();
    console.log(`    Found subscription data for ${data?.length || 0} IPOs`);
    return data || [];
  } catch (error) {
    console.log(`    ⚠️ NSE subscription fetch failed: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. UPCOMING IPOs — SEBI DRHP Filings
// Source: https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=10
// ═══════════════════════════════════════════════════════════════

async function fetchSEBIDRHP() {
  console.log('\n  📋 [SEBI] Fetching DRHP filings...');
  
  try {
    const url = 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=10';
    const response = await fetchWithHeaders(url);
    if (!response.ok) throw new Error(`SEBI returned ${response.status}`);
    
    const html = await response.text();
    const filings = parseSEBIFilings(html);
    console.log(`    Found ${filings.length} DRHP filings`);
    return filings;
  } catch (error) {
    console.log(`    ⚠️ SEBI DRHP fetch failed: ${error.message}`);
    return [];
  }
}

function parseSEBIFilings(html) {
  const filings = [];
  
  // SEBI listing page has links to individual DRHP documents
  // Pattern: company name + date filed
  const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const datePattern = /(\d{2}\s+\w+\s+\d{4})/;
  
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    
    // Look for DRHP filing entries (contain company names)
    if (text.length > 10 && href.includes('/filings/') && !text.includes('SEBI') && !text.includes('Click')) {
      const dateMatch = text.match(datePattern);
      filings.push({
        name: text.replace(datePattern, '').replace(/[-–]/g, '').trim(),
        slug: slugify(text.replace(datePattern, '').trim()),
        drhpDate: dateMatch ? dateMatch[1] : '',
        drhpUrl: href.startsWith('http') ? href : `https://www.sebi.gov.in${href}`,
        status: 'drhp-filed',
        type: 'mainboard',
      });
    }
  }
  
  return filings.slice(0, 20); // Latest 20 filings
}

// ═══════════════════════════════════════════════════════════════
// 4. MUTUAL FUND NAVs — AMFI India
// Source: https://www.amfiindia.com/spages/NAVAll.txt
// ═══════════════════════════════════════════════════════════════

async function fetchAMFINAVs() {
  console.log('\n  💰 [AMFI] Fetching mutual fund NAVs...');
  
  try {
    const response = await fetchWithHeaders('https://www.amfiindia.com/spages/NAVAll.txt');
    if (!response.ok) throw new Error(`AMFI returned ${response.status}`);
    
    const text = await response.text();
    const allFunds = parseAMFIFunds(text);
    console.log(`    Parsed ${allFunds.length} equity growth funds from AMFI`);
    
    // Merge with existing data (preserve our curated fields like rating, riskLevel)
    const existing = readExisting('mutual-funds.json');
    const merged = mergeAMFIData(existing, allFunds);
    writeData('mutual-funds.json', merged);
    
  } catch (error) {
    console.log(`    ⚠️ AMFI NAV fetch failed: ${error.message}`);
    console.log('    Keeping existing mutual-funds.json');
  }
}

function parseAMFIFunds(text) {
  const funds = [];
  const lines = text.split('\n');
  let currentAMC = '';
  let currentCategory = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect AMC name (lines with just text, no semicolons, after blank line)
    if (trimmed && !trimmed.includes(';') && !trimmed.startsWith('Scheme') && !trimmed.startsWith('Open Ended')) {
      if (trimmed.includes('Mutual Fund')) {
        currentAMC = trimmed;
      } else if (trimmed.startsWith('Open Ended Schemes')) {
        // Category line like "Open Ended Schemes(Equity Scheme - Large Cap Fund)"
        const catMatch = trimmed.match(/Open Ended Schemes\((.+)\)/);
        if (catMatch) currentCategory = catMatch[1];
      }
      continue;
    }
    
    const parts = trimmed.split(';');
    if (parts.length < 5 || !parts[4] || isNaN(parseFloat(parts[4]))) continue;
    
    const schemeName = parts[3]?.trim() || '';
    const nav = parseFloat(parts[4]);
    const schemeCode = parts[0]?.trim();
    
    // Only include Direct Plan Growth schemes of Equity funds
    if (!schemeName || nav <= 0) continue;
    if (!schemeName.toLowerCase().includes('direct')) continue;
    if (!schemeName.toLowerCase().includes('growth')) continue;
    
    // Filter for equity categories only
    const isEquity = currentCategory.toLowerCase().includes('equity') || 
                     currentCategory.toLowerCase().includes('elss') ||
                     currentCategory.toLowerCase().includes('hybrid') ||
                     currentCategory.toLowerCase().includes('flexi') ||
                     schemeName.toLowerCase().includes('flexi cap') ||
                     schemeName.toLowerCase().includes('small cap') ||
                     schemeName.toLowerCase().includes('mid cap') ||
                     schemeName.toLowerCase().includes('large cap') ||
                     schemeName.toLowerCase().includes('bluechip') ||
                     schemeName.toLowerCase().includes('elss') ||
                     schemeName.toLowerCase().includes('hybrid') ||
                     schemeName.toLowerCase().includes('balanced');
    
    if (!isEquity) continue;
    
    // Determine category
    let category = 'Others';
    const nameLower = schemeName.toLowerCase();
    if (nameLower.includes('small cap') || nameLower.includes('smallcap')) category = 'Small Cap';
    else if (nameLower.includes('mid cap') || nameLower.includes('midcap')) category = 'Mid Cap';
    else if (nameLower.includes('large cap') || nameLower.includes('largecap') || nameLower.includes('bluechip')) category = 'Large Cap';
    else if (nameLower.includes('flexi cap') || nameLower.includes('flexicap') || nameLower.includes('multi cap') || nameLower.includes('multicap')) category = 'Flexi Cap';
    else if (nameLower.includes('elss') || nameLower.includes('tax') || nameLower.includes('long term equity')) category = 'ELSS';
    else if (nameLower.includes('hybrid') || nameLower.includes('balanced') || nameLower.includes('equity & debt') || nameLower.includes('aggressive')) category = 'Hybrid';
    else if (nameLower.includes('focused') || nameLower.includes('value') || nameLower.includes('contra') || nameLower.includes('dividend yield')) category = 'Flexi Cap';
    
    if (category === 'Others') continue; // Skip unrecognized categories
    
    // Clean fund name
    let cleanName = schemeName
      .replace(/- direct plan -? ?growth/i, '')
      .replace(/-? ?direct -? ?growth/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    funds.push({
      name: cleanName,
      slug: slugify(cleanName),
      category,
      nav,
      schemeCode,
      amc: currentAMC.replace(' Mutual Fund', ''),
      riskLevel: category === 'Small Cap' ? 'very-high' : category === 'Mid Cap' ? 'high' : category === 'Large Cap' ? 'moderate' : category === 'ELSS' ? 'moderate' : category === 'Hybrid' ? 'moderate' : 'moderate',
    });
  }
  
  // Deduplicate by slug, keep first occurrence
  const seen = new Set();
  const unique = funds.filter(f => {
    if (seen.has(f.slug)) return false;
    seen.add(f.slug);
    return true;
  });
  
  return unique;
}

function mergeAMFIData(existing, amfiFunds) {
  const existingMap = new Map(existing.map(f => [f.slug, f]));
  
  // Update existing funds with fresh NAV
  for (const amfiFund of amfiFunds) {
    if (existingMap.has(amfiFund.slug)) {
      const curr = existingMap.get(amfiFund.slug);
      curr.nav = amfiFund.nav; // Update NAV
    } else {
      // Add new fund (without returns/rating — those need historical data)
      existingMap.set(amfiFund.slug, {
        name: amfiFund.name,
        slug: amfiFund.slug,
        category: amfiFund.category,
        nav: amfiFund.nav,
        rating: null,
        returns1y: null,
        returns3y: null,
        returns5y: null,
        aum: '',
        riskLevel: amfiFund.riskLevel,
      });
    }
  }
  
  return Array.from(existingMap.values());
}

// ═══════════════════════════════════════════════════════════════
// MERGE & UPDATE LOGIC
// ═══════════════════════════════════════════════════════════════

function mergeIPOData(existing, bseIPOs, nseData, sebiFilings) {
  const existingMap = new Map(existing.map(ipo => [ipo.slug, ipo]));
  
  // Update/add BSE live IPOs
  for (const bseIPO of bseIPOs) {
    if (existingMap.has(bseIPO.slug)) {
      const curr = existingMap.get(bseIPO.slug);
      curr.status = 'live';
      curr.priceRange = bseIPO.priceRange || curr.priceRange;
      curr.openDate = bseIPO.openDate || curr.openDate;
      curr.closeDate = bseIPO.closeDate || curr.closeDate;
      curr.lotSize = bseIPO.lotSize || curr.lotSize;
      curr.type = bseIPO.type || curr.type;
    } else {
      existingMap.set(bseIPO.slug, {
        ...bseIPO,
        issueSize: '',
        aiSummary: '',
        highlights: [],
        riskScore: 5,
        verdict: 'neutral',
        aiScore: undefined,
        gmp: undefined,
        subscription: undefined,
        founders: '',
        headquarters: '',
        founded: '',
        description: '',
        purpose: '',
        drhpUrl: 'https://www.sebi.gov.in/filings/public-issues.html',
        registrar: '',
      });
    }
  }
  
  // Update subscription data from NSE
  if (Array.isArray(nseData)) {
    for (const nseIPO of nseData) {
      const name = nseIPO.companyName || nseIPO.symbol || '';
      const slug = slugify(name);
      if (existingMap.has(slug) && nseIPO.subscriptionTimes) {
        existingMap.get(slug).subscription = parseFloat(nseIPO.subscriptionTimes) || undefined;
      }
    }
  }
  
  // Update status of IPOs based on dates
  const now = new Date();
  for (const [slug, ipo] of existingMap) {
    if (!ipo.openDate || !ipo.closeDate) continue;
    const open = new Date(ipo.openDate);
    const close = new Date(ipo.closeDate);
    const listing = ipo.listingDate ? new Date(ipo.listingDate) : null;
    
    if (listing && now >= listing) ipo.status = 'listed';
    else if (now >= open && now <= close) ipo.status = 'live';
    else if (now > close && !listing) ipo.status = 'closed';
  }
  
  return Array.from(existingMap.values());
}

function mergeUpcomingData(existing, sebiFilings) {
  const existingMap = new Map(existing.map(ipo => [ipo.slug, ipo]));
  
  for (const filing of sebiFilings) {
    if (!existingMap.has(filing.slug) && filing.name) {
      existingMap.set(filing.slug, {
        name: filing.name,
        slug: filing.slug,
        sector: 'Others',
        type: filing.type || 'mainboard',
        issueSize: '',
        drhpDate: filing.drhpDate || '',
        status: 'drhp-filed',
        registrar: '',
        founders: '',
        headquarters: '',
        founded: '',
        description: '',
        purpose: '',
        drhpUrl: filing.drhpUrl || 'https://www.sebi.gov.in/filings/public-issues.html',
      });
    }
  }
  
  return Array.from(existingMap.values());
}

// ═══════════════════════════════════════════════════════════════
// STATIC DATA (Brokers, Tools, Articles — rarely change)
// ═══════════════════════════════════════════════════════════════

function ensureStaticData() {
  console.log('\n  📁 Checking static data files...');
  
  const files = ['brokers.json', 'tools.json', 'articles.json', 'ipo-performance.json'];
  for (const file of files) {
    const data = readExisting(file);
    if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
      console.log(`    ✓ ${file} intact`);
    } else {
      console.log(`    ⚠️ ${file} is empty — using defaults`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  IPOfins — Automated Data Refresh');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log('  Sources: BSE + NSE + SEBI (IPO) | AMFI (Mutual Funds)');
  
  // 1. Fetch from all IPO sources
  const bseIPOs = await fetchBSEIPOs();
  const nseData = await fetchNSESubscription();
  const sebiFilings = await fetchSEBIDRHP();
  
  // 2. Merge IPO data
  const existingIPOs = readExisting('ipos.json');
  const mergedIPOs = mergeIPOData(existingIPOs, bseIPOs, nseData, sebiFilings);
  writeData('ipos.json', mergedIPOs);
  
  // 3. Merge upcoming IPO data
  const existingUpcoming = readExisting('upcoming-ipos.json');
  const mergedUpcoming = mergeUpcomingData(existingUpcoming, sebiFilings);
  writeData('upcoming-ipos.json', mergedUpcoming);
  
  // 4. Fetch mutual fund NAVs from AMFI
  await fetchAMFINAVs();
  
  // 5. Ensure static data is intact
  ensureStaticData();
  
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  ✅ Data refresh complete. Ready for build.');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(0); // Don't fail build — keep existing data
});
