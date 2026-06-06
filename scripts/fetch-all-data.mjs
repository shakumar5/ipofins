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
// PUPPETEER HELPER — Launch headless browser
// ═══════════════════════════════════════════════════════════════

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  try {
    const puppeteer = await import('puppeteer');
    browserInstance = await puppeteer.default.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    return browserInstance;
  } catch (e) {
    console.log(`    ⚠️ Puppeteer not available: ${e.message}`);
    return null;
  }
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. IPO DATA — BSE India (via Puppeteer)
// Source: https://www.bseindia.com/publicissue.html
// ═══════════════════════════════════════════════════════════════

async function fetchBSEIPOs() {
  console.log('\n  📊 [Zerodha] Fetching IPO data...');
  
  try {
    const response = await fetchWithHeaders('https://zerodha.com/ipo/');
    if (!response.ok) throw new Error(`Zerodha returned ${response.status}`);
    
    const html = await response.text();
    const { live, upcoming, closed } = parseZerodhaIPOs(html);
    
    console.log(`    ✅ Live: ${live.length} | Upcoming: ${upcoming.length} | Closed: ${closed.length}`);
    
    // Update upcoming-ipos.json with Zerodha's upcoming data
    if (upcoming.length > 0) {
      writeData('upcoming-ipos.json', upcoming);
    }
    
    // Update performance data from closed/listed
    if (closed.length > 0) {
      const perfData = readExisting('ipo-performance.json');
      perfData['2026'] = { mainboard: [], sme: [] };
      closed.forEach(ipo => {
        const entry = { name: ipo.name, listingDate: ipo.listingDate || '', issuePrice: ipo.priceMax || 0, listingPrice: ipo.listingPrice || 0, currentPrice: ipo.listingPrice || 0, sector: 'Others' };
        if (ipo.type === 'mainboard') {
          perfData['2026'].mainboard.push(entry);
        } else {
          perfData['2026'].sme.push(entry);
        }
      });
      writeData('ipo-performance.json', perfData);
    }
    
    // Return live IPOs for ipos.json
    return live;
  } catch (error) {
    console.log(`    ⚠️ Zerodha fetch failed: ${error.message}`);
    return [];
  }
}

function parseZerodhaIPOs(html) {
  const live = [];
  const upcoming = [];
  const closed = [];
  
  // Zerodha page has sections: ## Live, ## Upcoming, ## Closed
  // Each IPO entry has: name, type (SME/MAINBOARD), dates, price
  
  let currentSection = '';
  const lines = html.split('\n');
  
  // Use regex to find IPO entries in the HTML
  // Pattern: company name followed by SME/MAINBOARD, then details
  const ipoPattern = /(?:SME|MAINBOARD)\s+([\w\s\.\-\(\)]+?)(\d{2}(?:st|nd|rd|th)\s*[–\-]\s*\d{2}(?:st|nd|rd|th)\s+\w+\s+\d{4}[^₹]*?₹\s*([\d,]+)\s*(?:[–\-]\s*₹\s*([\d,]+))?)/g;
  
  // Simpler approach: split by sections and parse each
  const liveSectionMatch = html.match(/## Live([\s\S]*?)(?=## Upcoming|## Closed|$)/);
  const upcomingSectionMatch = html.match(/## Upcoming([\s\S]*?)(?=## Closed|## How|$)/);
  const closedSectionMatch = html.match(/## Closed([\s\S]*?)(?=## How|$)/);
  
  if (liveSectionMatch) {
    const liveEntries = extractZerodhaEntries(liveSectionMatch[1]);
    liveEntries.forEach(e => { e.status = 'live'; live.push(e); });
  }
  
  if (upcomingSectionMatch) {
    const upEntries = extractZerodhaUpcoming(upcomingSectionMatch[1]);
    upEntries.forEach(e => upcoming.push(e));
  }
  
  if (closedSectionMatch) {
    const closedEntries = extractZerodhaEntries(closedSectionMatch[1]);
    closedEntries.forEach(e => { e.status = 'listed'; closed.push(e); });
  }
  
  return { live, upcoming, closed };
}

function extractZerodhaEntries(sectionHtml) {
  const entries = [];
  
  // Pattern: [TYPE] Company Name[dates] • ₹price
  // Example: "SME Vahh Chemicals04th – 08th Jun 2026 • ₹60"
  // Example: "MAINBOARD Hexagon Nutrition05th – 09th Jun 2026 • ₹42 – ₹45"
  const entryPattern = /(SME|MAINBOARD)\s+([A-Za-z][\w\s\.\-\(\)&]+?)(\d{2}(?:st|nd|rd|th))/g;
  
  let match;
  while ((match = entryPattern.exec(sectionHtml)) !== null) {
    const type = match[1].toLowerCase() === 'sme' ? 'sme' : 'mainboard';
    const name = match[2].trim();
    
    if (!name || name.length < 3) continue;
    
    // Find price after this match
    const afterMatch = sectionHtml.substring(match.index);
    const priceMatch = afterMatch.match(/₹\s*([\d,]+)(?:\s*[–\-]\s*₹\s*([\d,]+))?/);
    const priceMin = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;
    const priceMax = priceMatch && priceMatch[2] ? parseInt(priceMatch[2].replace(/,/g, '')) : priceMin;
    
    // Find dates
    const dateMatch = afterMatch.match(/(\d{2}(?:st|nd|rd|th)\s*[–\-]\s*\d{2}(?:st|nd|rd|th)\s+\w+\s+\d{4}|\d{2}(?:st|nd|rd|th)\s+\w+\s+\d{4}\s*[–\-]\s*\d{2}(?:st|nd|rd|th)\s+\w+\s+\d{4})/);
    const dateStr = dateMatch ? dateMatch[1] : '';
    
    // Find listing gain for closed IPOs
    const gainMatch = afterMatch.match(/with\s+(-?\d+)%\s+gain/);
    const listingGain = gainMatch ? parseInt(gainMatch[1]) : null;
    
    // Find listing date
    const listingMatch = afterMatch.match(/(?:Listed?|Listing)\s+on\s+(\d{2}\s+\w+\s+\d{4}|\d+\s+\w+\s+\d{4})/);
    const listingDate = listingMatch ? listingMatch[1] : '';
    
    const priceRange = priceMax > priceMin ? `${priceMin}-${priceMax}` : `${priceMin}`;
    const listingPrice = listingGain !== null && priceMax > 0 ? Math.round(priceMax * (1 + listingGain / 100)) : null;
    
    entries.push({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      type,
      priceRange,
      priceMax,
      lotSize: 0,
      openDate: dateStr,
      closeDate: '',
      listingDate,
      listingPrice,
      sector: 'Others',
      issueSize: '',
      subscription: null,
      gmp: null,
      registrar: '',
      founders: '',
      headquarters: '',
      founded: '',
      description: '',
      purpose: '',
      drhpUrl: 'https://www.sebi.gov.in/filings/public-issues.html',
      aiScore: null,
      aiSummary: '',
      highlights: [],
      riskScore: 5,
      verdict: 'neutral',
    });
  }
  
  return entries;
}

function extractZerodhaUpcoming(sectionHtml) {
  const entries = [];
  
  // Upcoming format: "MAINBOARD Company NameTo be announced"
  const entryPattern = /(SME|MAINBOARD)\s+([A-Za-z][\w\s\.\-\(\)&]+?)To be announced/g;
  
  let match;
  while ((match = entryPattern.exec(sectionHtml)) !== null) {
    const type = match[1].toLowerCase() === 'sme' ? 'sme' : 'mainboard';
    const name = match[2].trim();
    
    if (!name || name.length < 3) continue;
    
    entries.push({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      sector: 'Others',
      type,
      issueSize: '',
      drhpDate: '',
      status: 'drhp-filed',
      registrar: '',
      founders: '',
      headquarters: '',
      founded: '',
      description: '',
      purpose: '',
      drhpUrl: 'https://www.sebi.gov.in/filings/public-issues.html',
    });
  }
  
  return entries;
}

// ═══════════════════════════════════════════════════════════════
// 2. IPO SUBSCRIPTION — NSE (skipped - blocks servers)
// ═══════════════════════════════════════════════════════════════

async function fetchNSESubscription() {
  console.log('\n  📈 [NSE] Fetching subscription data (Puppeteer)...');
  
  const browser = await getBrowser();
  if (!browser) {
    console.log('    ⚠️ No browser available, skipping NSE');
    return [];
  }
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    
    // NSE is very strict — try with longer timeout
    await page.goto('https://www.nseindia.com/market-data/all-upcoming-issues-ipo', { 
      waitUntil: 'domcontentloaded', 
      timeout: 45000 
    });
    
    // Wait for table or timeout gracefully
    const tableLoaded = await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(() => null);
    
    if (!tableLoaded) {
      console.log('    ⚠️ NSE table did not load (bot protection). Skipping.');
      await page.close();
      return [];
    }
    
    await new Promise(r => setTimeout(r, 2000));
    
    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const results = [];
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length >= 7) {
          const name = cells[0]?.textContent?.trim() || '';
          const subscriptionText = cells[cells.length - 1]?.textContent?.trim() || '';
          const subscription = parseFloat(subscriptionText) || 0;
          if (name && subscription > 0) {
            results.push({ name, subscription });
          }
        }
      });
      return results;
    });
    
    await page.close();
    console.log(`    Found subscription data for ${data.length} IPOs`);
    return data;
  } catch (error) {
    console.log(`    ⚠️ NSE skipped (blocked/timeout): ${error.message.split('\n')[0]}`);
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
  
  // Keep only top 200 by NAV (most established/popular funds)
  const top200 = unique.sort((a, b) => b.nav - a.nav).slice(0, 200);
  console.log(`    Filtered to top ${top200.length} funds by NAV`);
  
  return top200;
}

function mergeAMFIData(existing, amfiFunds) {
  const existingMap = new Map(existing.map(f => [f.slug, f]));
  
  // Update existing funds with fresh NAV
  for (const amfiFund of amfiFunds) {
    if (existingMap.has(amfiFund.slug)) {
      const curr = existingMap.get(amfiFund.slug);
      curr.nav = amfiFund.nav; // Update NAV
      if (amfiFund.schemeCode) curr.schemeCode = amfiFund.schemeCode;
    } else {
      // Add new fund (without returns/rating — those need historical data)
      existingMap.set(amfiFund.slug, {
        name: amfiFund.name,
        slug: amfiFund.slug,
        category: amfiFund.category,
        nav: amfiFund.nav,
        schemeCode: amfiFund.schemeCode,
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

/**
 * Fetch historical returns for all funds using mfapi.in
 * API: https://api.mfapi.in/mf/{schemeCode}
 * Returns full NAV history — we calculate 1Y, 3Y, 5Y returns
 */
async function fetchFundReturns() {
  console.log('\n  📊 [mfapi.in] Calculating fund returns from historical NAV...');
  
  const funds = readExisting('mutual-funds.json');
  const fundsWithCode = funds.filter(f => f.schemeCode);
  
  console.log(`    ${fundsWithCode.length} funds with scheme codes. Fetching historical NAV...`);
  
  let updated = 0;
  let failed = 0;
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < fundsWithCode.length; i += BATCH_SIZE) {
    const batch = fundsWithCode.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.allSettled(
      batch.map(fund => fetchSingleFundReturn(fund))
    );
    
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled' && results[j].value) {
        const { slug, returns1y, returns3y, returns5y } = results[j].value;
        const fund = funds.find(f => f.slug === slug);
        if (fund) {
          if (returns1y !== null) fund.returns1y = returns1y;
          if (returns3y !== null) fund.returns3y = returns3y;
          if (returns5y !== null) fund.returns5y = returns5y;
          updated++;
        }
      } else {
        failed++;
      }
    }
    
    // Small delay between batches to be respectful
    if (i + BATCH_SIZE < fundsWithCode.length) {
      await new Promise(r => setTimeout(r, 500));
    }
    
    // Progress log every 50 funds
    if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= fundsWithCode.length) {
      console.log(`    Progress: ${Math.min(i + BATCH_SIZE, fundsWithCode.length)}/${fundsWithCode.length} (${updated} updated, ${failed} failed)`);
    }
  }
  
  writeData('mutual-funds.json', funds);
  console.log(`    ✅ Returns calculated for ${updated} funds (${failed} failed)`);
}

async function fetchSingleFundReturn(fund) {
  try {
    const response = await fetch(`https://api.mfapi.in/mf/${fund.schemeCode}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.data || data.data.length < 30) return null;
    
    const navHistory = data.data; // Array of {date, nav} sorted newest first
    const currentNAV = parseFloat(navHistory[0].nav);
    
    // Find NAV from approximately 1 year ago, 3 years ago, 5 years ago
    const nav1y = findNAVAtDate(navHistory, 365);
    const nav3y = findNAVAtDate(navHistory, 365 * 3);
    const nav5y = findNAVAtDate(navHistory, 365 * 5);
    
    const returns1y = nav1y ? parseFloat(((currentNAV - nav1y) / nav1y * 100).toFixed(1)) : null;
    const returns3y = nav3y ? parseFloat((((currentNAV / nav3y) ** (1/3) - 1) * 100).toFixed(1)) : null;
    const returns5y = nav5y ? parseFloat((((currentNAV / nav5y) ** (1/5) - 1) * 100).toFixed(1)) : null;
    
    return { slug: fund.slug, returns1y, returns3y, returns5y };
  } catch {
    return null;
  }
}

function findNAVAtDate(navHistory, daysAgo) {
  const now = new Date();
  const targetDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
  
  // Find the NAV entry closest to the target date (data is sorted newest first)
  for (const entry of navHistory) {
    const parts = entry.date.split('-');
    if (parts.length !== 3) continue;
    
    // Parse DD-MM-YYYY format
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
    const year = parseInt(parts[2]);
    const entryDate = new Date(year, month, day);
    
    if (entryDate <= targetDate) {
      return parseFloat(entry.nav);
    }
  }
  
  return null; // Not enough history
}

// ═══════════════════════════════════════════════════════════════
// MERGE & UPDATE LOGIC
// ═══════════════════════════════════════════════════════════════

function mergeIPOData(existing, bseIPOs, nseData, sebiFilings) {
  // If scraper provided live IPOs, REPLACE all live entries (don't merge old fake data)
  let result = [];
  
  if (bseIPOs.length > 0) {
    // Keep only listed/closed from existing, replace live with fresh data
    result = existing.filter(ipo => ipo.status !== 'live');
    
    // Add fresh live IPOs from scraper
    for (const bseIPO of bseIPOs) {
      // Skip garbage entries
      if (!bseIPO.name || bseIPO.name.length < 3) continue;
      if (bseIPO.name.toLowerCase() === 'total') continue;
      
      result.push({
        ...bseIPO,
        issueSize: bseIPO.issueSize || '',
        aiSummary: '',
        highlights: [],
        riskScore: 5,
        verdict: 'neutral',
        aiScore: undefined,
        gmp: undefined,
        subscription: bseIPO.subscription || undefined,
        founders: '',
        headquarters: '',
        founded: '',
        description: '',
        purpose: '',
        drhpUrl: 'https://www.sebi.gov.in/filings/public-issues.html',
        registrar: '',
      });
    }
  } else {
    // Scraper returned nothing — keep existing data as-is
    result = existing;
  }
  
  // Update subscription data from NSE (if available)
  if (Array.isArray(nseData) && nseData.length > 0) {
    for (const nseIPO of nseData) {
      const name = nseIPO.name || nseIPO.companyName || '';
      const slug = slugify(name);
      const found = result.find(i => i.slug === slug);
      if (found && nseIPO.subscription) {
        found.subscription = parseFloat(nseIPO.subscription) || undefined;
      }
    }
  }
  
  return result;
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
// SCREENER.IN PARSERS
// ═══════════════════════════════════════════════════════════════

function parseScreenerUpcoming(html) {
  const ipos = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const row = match[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellPattern.exec(row)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    }
    
    // Strict validation: must have at least 5 cells, first cell is company name
    if (cells.length < 5) continue;
    
    let name = cells[0].replace(/NSE|BSE|SME|-SME/g, '').trim();
    
    // Skip junk rows
    if (!name || name.length < 4) continue;
    if (/^(total|showing|company|name|upcoming|recent|ipo|market|home|dashboard|screen|login)/i.test(name)) continue;
    if (/^[^a-zA-Z]/.test(name)) continue; // Must start with a letter
    if (name.includes('←') || name.includes('→') || name.includes('Next') || name.includes('Go Back')) continue;
    
    // Must have a numeric cell (issue size in Cr) to be a real IPO row
    const hasNumeric = cells.some(c => /^\d[\d,.]*$/.test(c.trim()) && parseInt(c.replace(/,/g,'')) > 0);
    if (!hasNumeric) continue;
    
    // Extract subscription (e.g., "6.2 times" or "1.6 times")
    const subMatch = cells.find(c => /[\d.]+\s*times/i.test(c));
    const subscription = subMatch ? parseFloat(subMatch) : undefined;
    
    // Extract issue size (Cr) - typically 3rd or 4th cell with just a number
    const sizeCell = cells.find((c, i) => i > 0 && /^\d[\d,]*$/.test(c.trim()));
    const issueSize = sizeCell ? parseInt(sizeCell.replace(/,/g, '')) : 0;
    
    // Determine type based on exchange mention or size
    const rawText = cells[0];
    const isSME = rawText.includes('SME') || rawText.includes('-SME') || (issueSize > 0 && issueSize < 500);
    
    ipos.push({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      priceRange: '0',
      lotSize: 0,
      openDate: '',
      closeDate: '',
      status: 'live',
      type: isSME ? 'sme' : 'mainboard',
      sector: 'Others',
      subscription,
      issueSize: issueSize > 0 ? `₹${issueSize} Cr` : '',
    });
  }
  
  console.log(`    Parsed ${ipos.length} IPOs (filtered from HTML)`);
  return ipos;
}

function parseScreenerRecent(html) {
  const ipos = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const row = match[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellPattern.exec(row)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    }
    
    if (cells.length >= 4 && cells[0] && cells[0].length > 2) {
      const name = cells[0].replace(/REIT|NSE|BSE|SME/g, '').trim();
      if (!name || name.includes('Company') || name.length < 3) continue;
      
      const listingDate = cells[1] || '';
      const issueSize = parseInt((cells[2] || '0').replace(/,/g, '')) || 0;
      const issuePrice = parseFloat((cells[3] || '0').replace(/[₹,\s]/g, '')) || 0;
      const currentPrice = parseFloat((cells[4] || '0').replace(/[₹,\s]/g, '')) || 0;
      
      if (issuePrice > 0 && currentPrice > 0) {
        ipos.push({ name, listingDate, issueSize, issuePrice, currentPrice });
      }
    }
  }
  return ipos.slice(0, 30);
}

// ═══════════════════════════════════════════════════════════════
// 6. FUND HOLDINGS — AMFI Portfolio Disclosure (Puppeteer)
// Source: https://www.amfiindia.com/online-center/portfolio-disclosure
// ═══════════════════════════════════════════════════════════════

async function fetchFundHoldings() {
  console.log('\n  📋 [AMFI] Fetching fund holdings (Puppeteer)...');
  
  const browser = await getBrowser();
  if (!browser) {
    console.log('    ⚠️ No browser available, skipping holdings');
    return;
  }
  
  const funds = readExisting('mutual-funds.json');
  // Get top funds by NAV (most popular — fetch holdings for top 30)
  const topFunds = funds
    .filter(f => f.schemeCode && f.nav > 50)
    .sort((a, b) => (b.nav || 0) - (a.nav || 0))
    .slice(0, 30);
  
  if (topFunds.length === 0) {
    console.log('    No funds with scheme codes to fetch holdings for');
    return;
  }
  
  console.log(`    Fetching holdings for top ${topFunds.length} funds...`);
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate to portfolio disclosure page
    await page.goto('https://www.amfiindia.com/online-center/portfolio-disclosure', { 
      waitUntil: 'networkidle2', timeout: 30000 
    });
    
    // Wait for the page to load fully
    await new Promise(r => setTimeout(r, 3000));
    
    // Try to interact with the disclosure type dropdown
    // The page has: Select Disclosure Type → Select AMC → Select Scheme → Get data
    const hasDropdown = await page.$('select, [role="listbox"], .dropdown').catch(() => null);
    
    if (!hasDropdown) {
      console.log('    ⚠️ Portfolio disclosure page structure not accessible via automation');
      console.log('    Using mfapi.in as alternative source for basic portfolio info...');
      
      // Alternative: Use mfapi.in which sometimes includes portfolio data
      // For now, mark holdings as needing manual/API source
      await page.close();
      
      // Create holdings data structure (ready for population)
      const holdingsData = {};
      topFunds.forEach(f => {
        holdingsData[f.slug] = {
          lastUpdated: null,
          holdings: [],
          source: 'pending'
        };
      });
      
      writeData('fund-holdings.json', holdingsData);
      console.log(`    Created holdings placeholder for ${topFunds.length} funds`);
      return;
    }
    
    // If dropdown exists, try to extract data
    // This is AMC-specific and may vary
    await page.close();
    
  } catch (error) {
    console.log(`    ⚠️ Holdings fetch failed: ${error.message}`);
    
    // Create empty holdings structure
    const holdingsData = {};
    const funds = readExisting('mutual-funds.json');
    funds.filter(f => f.schemeCode).slice(0, 30).forEach(f => {
      holdingsData[f.slug] = { lastUpdated: null, holdings: [], source: 'pending' };
    });
    writeData('fund-holdings.json', holdingsData);
  }
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
  
  // 5. Calculate returns from historical NAV (mfapi.in)
  await fetchFundReturns();
  
  // 6. Fetch fund holdings via AMFI portfolio disclosure (Puppeteer)
  await fetchFundHoldings();
  
  // 7. Ensure static data is intact
  ensureStaticData();
  
  // Close browser if opened
  await closeBrowser();
  
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  ✅ Data refresh complete. Ready for build.');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(0); // Don't fail build — keep existing data
});
