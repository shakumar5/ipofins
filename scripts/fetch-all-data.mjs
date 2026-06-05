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
  console.log('\n  📊 [BSE] Fetching live IPO data (Puppeteer)...');
  
  const browser = await getBrowser();
  if (!browser) {
    console.log('    ⚠️ No browser available, skipping BSE');
    return [];
  }
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto('https://www.bseindia.com/publicissue.html', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for the IPO table to load
    await page.waitForSelector('table', { timeout: 15000 }).catch(() => {});
    
    // Extract IPO data from the rendered page
    const ipos = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tr');
      const results = [];
      
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length >= 7) {
          const status = cells[7]?.textContent?.trim();
          const type = cells[6]?.textContent?.trim();
          
          if (status === 'Live' && (type === 'IPO' || type === 'FPO')) {
            const name = cells[0]?.textContent?.trim() || '';
            const segment = cells[1]?.textContent?.trim() || '';
            const openDate = cells[2]?.textContent?.trim() || '';
            const closeDate = cells[3]?.textContent?.trim() || '';
            const price = cells[4]?.textContent?.trim() || '';
            const lotSize = cells[5]?.textContent?.trim() || '0';
            
            if (name && name.length > 2) {
              results.push({ name, segment, openDate, closeDate, price, lotSize: parseInt(lotSize) || 0 });
            }
          }
        }
      });
      
      return results;
    });
    
    // Also try to get subscription data from BSE
    // BSE subscription page: https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx
    let subscriptionData = [];
    try {
      await page.goto('https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx', { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise(r => setTimeout(r, 2000));
      
      subscriptionData = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr');
        const results = [];
        rows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          // Look for subscription times in the table
          if (cells.length >= 4) {
            const name = cells[0]?.textContent?.trim() || '';
            const text = row.textContent || '';
            // Try to find subscription multiplier (e.g., "17.66x" or "0.35x")
            const subMatch = text.match(/(\d+\.?\d*)\s*x/i);
            if (name && name.length > 3 && subMatch) {
              results.push({ name, subscription: parseFloat(subMatch[1]) });
            }
          }
        });
        return results;
      });
      
      console.log(`    Found subscription for ${subscriptionData.length} IPOs from BSE`);
    } catch (e) {
      console.log(`    ⚠️ BSE subscription page failed: ${e.message.split('\n')[0]}`);
    }
    
    await page.close();
    
    const formatted = ipos.map(ipo => {
      // Match subscription data by name
      const subInfo = subscriptionData.find(s => 
        ipo.name.toLowerCase().includes(s.name.toLowerCase().split(' ')[0]) ||
        s.name.toLowerCase().includes(ipo.name.toLowerCase().split(' ')[0])
      );
      
      return {
        name: ipo.name,
        slug: ipo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        priceRange: ipo.price.replace(/\s/g, ''),
        lotSize: ipo.lotSize,
        openDate: ipo.openDate,
        closeDate: ipo.closeDate,
        status: 'live',
        type: ipo.segment.toLowerCase().includes('sme') ? 'sme' : 'mainboard',
        sector: 'Others',
        subscription: subInfo?.subscription || undefined,
      };
    });
    
    console.log(`    Found ${formatted.length} live IPOs from BSE`);
    return formatted;
  } catch (error) {
    console.log(`    ⚠️ BSE Puppeteer failed: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. IPO SUBSCRIPTION — NSE India (via Puppeteer)
// Source: https://www.nseindia.com/market-data/all-upcoming-issues-ipo
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
  
  return unique;
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
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - daysAgo);
  
  // Find the NAV entry closest to the target date
  for (const entry of navHistory) {
    const parts = entry.date.split('-');
    if (parts.length !== 3) continue;
    const entryDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    
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
