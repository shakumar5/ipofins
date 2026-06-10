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
import { validateBatch } from './lib/validate.mjs';
import { IPO_SCHEMA, MF_SCHEMA, UPCOMING_IPO_SCHEMA } from './lib/schemas.mjs';
import { checkCountThreshold, protectFields, preserveTimestamps } from './lib/diff-detector.mjs';
import { checkStaleness } from './lib/staleness-monitor.mjs';
import { sendAlert } from './lib/webhook-notifier.mjs';

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
// 1. IPO DATA — Zerodha (Listing + Detail Pages)
// Source: https://zerodha.com/ipo/
// Fetches listing page for all IPOs, then each detail page for
// rich data (description, lot size, purpose, strengths, risks)
// ═══════════════════════════════════════════════════════════════

async function fetchBSEIPOs() {
  console.log('\n  📊 [Zerodha] Fetching IPO listing page...');
  
  try {
    const response = await fetchWithHeaders('https://zerodha.com/ipo/');
    if (!response.ok) throw new Error(`Zerodha returned ${response.status}`);
    
    const html = await response.text();
    
    // Check if we got the real page or a Cloudflare challenge
    if (html.length < 5000 || html.includes('challenge-platform')) {
      console.log('    ⚠️ Cloudflare challenge detected. Cannot fetch from this IP.');
      return [];
    }
    
    const { live, upcoming, closed } = parseZerodhaListing(html);
    console.log(`    ✅ Live: ${live.length} | Upcoming: ${upcoming.length} | Closed: ${closed.length}`);
    
    // Update upcoming-ipos.json
    if (upcoming.length > 0) {
      // Validate before writing
      const { valid: validUp, rejected: rejectedUp } = validateBatch(upcoming, UPCOMING_IPO_SCHEMA);
      if (rejectedUp.length > 0) {
        console.log(`    ⚠️ Rejected ${rejectedUp.length} upcoming IPO records:`);
        rejectedUp.forEach(r => console.log(`      - ${r.record.name || 'unknown'}: ${r.reasons.join(', ')}`));
      }
      writeData('upcoming-ipos.json', validUp);
    }
    
    // Fetch detail pages for live IPOs to get rich data
    if (live.length > 0) {
      console.log(`    📄 Fetching detail pages for ${live.length} live IPO(s)...`);
      for (const ipo of live) {
        if (ipo.detailUrl) {
          await fetchIPODetail(ipo);
          // Small delay between requests to be respectful
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    
    // Fetch detail pages for closed IPOs too (for performance data)
    if (closed.length > 0) {
      console.log(`    📄 Fetching detail pages for ${closed.length} closed IPO(s)...`);
      for (const ipo of closed) {
        if (ipo.detailUrl) {
          await fetchIPODetail(ipo);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      // Update performance data
      const perfData = readExisting('ipo-performance.json');
      if (!perfData['2026']) perfData['2026'] = { mainboard: [], sme: [] };
      closed.forEach(ipo => {
        const entry = {
          name: ipo.name,
          listingDate: ipo.listingDate || '',
          issuePrice: ipo.priceMax || 0,
          listingPrice: ipo.listingPrice || 0,
          currentPrice: ipo.listingPrice || 0,
          sector: ipo.sector || 'Others',
        };
        const list = ipo.type === 'mainboard' ? perfData['2026'].mainboard : perfData['2026'].sme;
        if (!list.find(e => e.name === ipo.name)) {
          list.push(entry);
        }
      });
      writeData('ipo-performance.json', perfData);
    }
    
    // Return all IPOs (live + closed) for ipos.json
    return [...live, ...closed];
  } catch (error) {
    console.log(`    ⚠️ Zerodha fetch failed: ${error.message}`);
    await sendAlert({
      title: 'IPO Fetch Failed',
      message: `Source: Zerodha/BSE | Error: ${error.message} | Time: ${new Date().toISOString()}`,
      severity: 'error',
      source: 'fetchBSEIPOs',
    });
    return [];
  }
}

/**
 * Parse Zerodha listing page HTML.
 * The page has three tab sections: live-ipo, upcoming-ipo, closed-ipo
 * Each contains a table with IPO data.
 */
function parseZerodhaListing(html) {
  const live = [];
  const upcoming = [];
  const closed = [];
  
  // Extract sections by div IDs
  const liveSection = extractSection(html, 'live-ipo', 'upcoming-ipo');
  const upcomingSection = extractSection(html, 'upcoming-ipo', 'closed-ipo');
  const closedSection = extractSection(html, 'closed-ipo', '</main>');
  
  // Parse live IPOs
  const liveLinks = [...liveSection.matchAll(/href="\/ipo\/(\d+)\/([^"]+)"/g)];
  const liveNames = [...liveSection.matchAll(/ipo-name[^>]*>([^<]+)/g)];
  const liveTypes = [...liveSection.matchAll(/ipo-type[^>]*>([^<]+)/g)];
  const liveDates = [...liveSection.matchAll(/<td class="date">\s*(?:<span[^>]*>[^<]*<\/span>\s*)?([^<]+)/g)];
  const livePrices = [...liveSection.matchAll(/₹(\d[\d,]*)\s*(?:&ndash;|–|-)\s*₹(\d[\d,]*)|₹(\d[\d,]*)/g)];
  
  for (let i = 0; i < liveLinks.length; i++) {
    // Each IPO appears multiple times (desktop + mobile) — deduplicate by link
    const ipoId = liveLinks[i][1];
    const ipoSlug = liveLinks[i][2];
    if (live.find(l => l.slug === ipoSlug)) continue;
    
    const name = liveNames[i] ? liveNames[i][1].trim() : ipoSlug.replace(/-/g, ' ');
    const type = liveTypes[i] ? liveTypes[i][1].trim().toLowerCase() : 'sme';
    
    // Find price for this IPO
    const priceMatch = livePrices.length > 0 ? livePrices[Math.min(i, livePrices.length - 1)] : null;
    let priceMin = 0, priceMax = 0;
    if (priceMatch) {
      if (priceMatch[1] && priceMatch[2]) {
        priceMin = parseInt(priceMatch[1].replace(/,/g, ''));
        priceMax = parseInt(priceMatch[2].replace(/,/g, ''));
      } else if (priceMatch[3]) {
        priceMin = priceMax = parseInt(priceMatch[3].replace(/,/g, ''));
      }
    }
    
    live.push({
      name,
      slug: slugify(name),
      type: type === 'mainboard' ? 'mainboard' : 'sme',
      status: 'live',
      priceRange: priceMax > priceMin ? `${priceMin}-${priceMax}` : `${priceMin}`,
      priceMax,
      detailUrl: `https://zerodha.com/ipo/${ipoId}/${ipoSlug}`,
      // These will be filled from detail page
      lotSize: 0,
      openDate: '',
      closeDate: '',
      listingDate: '',
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
      highlights: [],
      risks: [],
      drhpUrl: '',
      aiScore: null,
      aiSummary: '',
      riskScore: 5,
      verdict: 'neutral',
    });
  }
  
  // Parse upcoming IPOs
  const upLinks = [...upcomingSection.matchAll(/href="\/ipo\/(\d+)\/([^"]+)"/g)];
  const upNames = [...upcomingSection.matchAll(/ipo-name[^>]*>([^<]+)/g)];
  const upTypes = [...upcomingSection.matchAll(/ipo-type[^>]*>([^<]+)/g)];
  const seenUpcoming = new Set();
  
  for (let i = 0; i < upNames.length; i++) {
    const name = upNames[i][1].trim();
    if (seenUpcoming.has(name)) continue;
    seenUpcoming.add(name);
    
    const type = upTypes[i] ? upTypes[i][1].trim().toLowerCase() : 'sme';
    const link = upLinks[i] ? upLinks[i] : null;
    
    upcoming.push({
      name,
      slug: slugify(name),
      type: type === 'mainboard' ? 'mainboard' : 'sme',
      status: 'upcoming',
      sector: 'Others',
      issueSize: '',
      drhpDate: '',
      detailUrl: link ? `https://zerodha.com/ipo/${link[1]}/${link[2]}` : '',
      drhpUrl: 'https://www.sebi.gov.in/filings/public-issues.html',
    });
  }
  
  // Parse closed IPOs
  const closedLinks = [...closedSection.matchAll(/href="\/ipo\/(\d+)\/([^"]+)"/g)];
  const closedNames = [...closedSection.matchAll(/ipo-name[^>]*>([^<]+)/g)];
  const closedTypes = [...closedSection.matchAll(/ipo-type[^>]*>([^<]+)/g)];
  const seenClosed = new Set();
  
  for (let i = 0; i < closedNames.length; i++) {
    const name = closedNames[i][1].trim();
    if (seenClosed.has(name)) continue;
    seenClosed.add(name);
    
    const type = closedTypes[i] ? closedTypes[i][1].trim().toLowerCase() : 'sme';
    const link = closedLinks[i] ? closedLinks[i] : null;
    
    closed.push({
      name,
      slug: slugify(name),
      type: type === 'mainboard' ? 'mainboard' : 'sme',
      status: 'listed',
      priceRange: '',
      priceMax: 0,
      detailUrl: link ? `https://zerodha.com/ipo/${link[1]}/${link[2]}` : '',
      lotSize: 0,
      openDate: '',
      closeDate: '',
      listingDate: '',
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
      highlights: [],
      risks: [],
      drhpUrl: '',
      aiScore: null,
      aiSummary: '',
      riskScore: 5,
      verdict: 'neutral',
    });
  }
  
  return { live, upcoming, closed };
}

/**
 * Extract a section of HTML between two marker IDs
 */
function extractSection(html, startId, endId) {
  const startIdx = html.indexOf(`id="${startId}"`);
  if (startIdx === -1) return '';
  const endIdx = endId ? html.indexOf(`id="${endId}"`, startIdx) : html.length;
  if (endIdx === -1) return html.substring(startIdx);
  return html.substring(startIdx, endIdx);
}

/**
 * Fetch a Zerodha IPO detail page and extract rich data.
 * Fills in: description, lot size, issue size, purpose, strengths, risks, dates, registrar
 */
async function fetchIPODetail(ipo) {
  try {
    const response = await fetchWithHeaders(ipo.detailUrl);
    if (!response.ok) {
      console.log(`      ⚠️ ${ipo.name}: HTTP ${response.status}`);
      return;
    }
    
    const html = await response.text();
    if (html.length < 3000) return; // Cloudflare or empty
    
    // Extract the main content, strip scripts/styles
    const clean = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // --- IPO Dates ---
    const dateMatch = clean.match(/IPO date[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i);
    if (dateMatch) {
      const dateStr = dateMatch[1].replace(/<[^>]+>/g, '').trim();
      // Parse "10th – 12th Jun 2026" format
      const datesFound = [...dateStr.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:–|-)\s*(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/g)];
      if (datesFound.length > 0) {
        const m = datesFound[0];
        ipo.openDate = `${m[3]} ${m[1].padStart(2, '0')}, ${m[4]}`;
        ipo.closeDate = `${m[3]} ${m[2].padStart(2, '0')}, ${m[4]}`;
      } else {
        ipo.openDate = dateStr;
      }
    }
    
    // --- Listing Date ---
    const listingMatch = clean.match(/Listing date[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i);
    if (listingMatch) {
      ipo.listingDate = listingMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    // --- Price Range ---
    const priceMatch = clean.match(/Price range[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i);
    if (priceMatch) {
      const priceStr = priceMatch[1].replace(/<[^>]+>/g, '').trim();
      const prices = [...priceStr.matchAll(/₹?(\d[\d,]*)/g)];
      if (prices.length >= 2) {
        ipo.priceRange = `${prices[0][1].replace(/,/g, '')}-${prices[1][1].replace(/,/g, '')}`;
        ipo.priceMax = parseInt(prices[1][1].replace(/,/g, ''));
      } else if (prices.length === 1) {
        ipo.priceRange = prices[0][1].replace(/,/g, '');
        ipo.priceMax = parseInt(prices[0][1].replace(/,/g, ''));
      }
    }
    
    // --- Lot Size ---
    const lotMatch = clean.match(/Lot size[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i);
    if (lotMatch) {
      const lotStr = lotMatch[1].replace(/<[^>]+>/g, '').trim();
      const lotNum = lotStr.match(/(\d[\d,]*)/);
      if (lotNum) ipo.lotSize = parseInt(lotNum[1].replace(/,/g, ''));
    }
    
    // --- Issue Size ---
    const issueSizeMatch = clean.match(/Issue size[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i);
    if (issueSizeMatch) {
      const sizeStr = issueSizeMatch[1].replace(/<[^>]+>/g, '').trim();
      ipo.issueSize = sizeStr.includes('cr') ? `₹${sizeStr}` : sizeStr;
    }
    
    // --- About / Description ---
    const aboutMatch = clean.match(/About\s+[\w\s]+<\/h2>\s*([\s\S]*?)(?=<h2|<div class="row ipo-meta|$)/i);
    if (aboutMatch) {
      const desc = aboutMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (desc.length > 30) ipo.description = desc;
    }
    
    // --- Purpose / Objects of Issue ---
    const purposeRows = [...clean.matchAll(/Utilisation[\s\S]*?<table[\s\S]*?<\/table>/gi)];
    if (purposeRows.length > 0) {
      const tableHtml = purposeRows[0][0];
      const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      const purposes = [];
      for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
        if (cells.length >= 2) {
          const purpose = cells[0][1].replace(/<[^>]+>/g, '').trim();
          const amount = cells[1][1].replace(/<[^>]+>/g, '').trim();
          if (purpose && !purpose.toLowerCase().includes('purpose') && purpose.length > 5) {
            purposes.push(`${purpose} (${amount})`);
          }
        }
      }
      if (purposes.length > 0) ipo.purpose = purposes.join('; ');
    }
    
    // --- Strengths (highlights) ---
    const strengthsMatch = clean.match(/Strengths[\s\S]*?(<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>)/i);
    if (!strengthsMatch) {
      // Try paragraph-based strengths
      const strSection = clean.match(/Strengths<\/h[23]>([\s\S]*?)(?=<h[23]|Risks|$)/i);
      if (strSection) {
        const items = strSection[1].replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(s => s.length > 20);
        ipo.highlights = items.slice(0, 5);
      }
    } else {
      const items = [...strengthsMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      ipo.highlights = items.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(s => s.length > 10).slice(0, 5);
    }
    
    // --- Risks ---
    const risksMatch = clean.match(/Risks[\s\S]*?(<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>)/i);
    if (!risksMatch) {
      const riskSection = clean.match(/Risks<\/h[23]>([\s\S]*?)(?=<h[23]|<div class="signup|$)/i);
      if (riskSection) {
        const items = riskSection[1].replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(s => s.length > 20);
        ipo.risks = items.slice(0, 5);
      }
    } else {
      const items = [...risksMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      ipo.risks = items.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(s => s.length > 10).slice(0, 5);
    }
    
    // --- Prospectus URL ---
    const prospectusMatch = clean.match(/href="([^"]*)"[^>]*>[\s\S]*?(?:prospectus|DRHP|RHP)/i);
    if (prospectusMatch) {
      ipo.drhpUrl = prospectusMatch[1].startsWith('http') ? prospectusMatch[1] : `https://zerodha.com${prospectusMatch[1]}`;
    }
    
    // --- Risk score based on number of risks ---
    if (ipo.risks && ipo.risks.length > 0) {
      ipo.riskScore = Math.min(10, 4 + ipo.risks.length);
    }
    
    // Clean up detailUrl (not needed in output)
    delete ipo.detailUrl;
    
    console.log(`      ✅ ${ipo.name}: desc=${ipo.description ? 'yes' : 'no'} lot=${ipo.lotSize} highlights=${ipo.highlights.length} risks=${(ipo.risks || []).length}`);
  } catch (error) {
    console.log(`      ⚠️ ${ipo.name}: detail fetch failed (${error.message})`);
    delete ipo.detailUrl;
  }
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
    // Validate before writing
    const { valid: validMFs, rejected: rejectedMFs } = validateBatch(merged, MF_SCHEMA);
    if (rejectedMFs.length > 0) {
      console.log(`    ⚠️ Rejected ${rejectedMFs.length} mutual fund records:`);
      rejectedMFs.forEach(r => console.log(`      - ${r.record.name || 'unknown'}: ${r.reasons.join(', ')}`));
    }
    writeData('mutual-funds.json', validMFs);
    
  } catch (error) {
    console.log(`    ⚠️ AMFI NAV fetch failed: ${error.message}`);
    console.log('    Keeping existing mutual-funds.json');
    await sendAlert({
      title: 'Mutual Fund Fetch Failed',
      message: `Source: AMFI India | Error: ${error.message} | Time: ${new Date().toISOString()}`,
      severity: 'error',
      source: 'fetchAMFINAVs',
    });
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
  
  // Keep only top 200 — prefer funds with higher NAV (more established)
  // But only keep funds that have NAV > 10 (filter out debt/liquid with very low NAV noise)
  const top200 = unique.filter(f => f.nav > 10).slice(0, 200);
  console.log(`    Filtered to ${top200.length} equity funds`);
  
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
  
  // Only keep funds that have at least 1Y returns (remove incomplete data)
  const completeData = funds.filter(f => f.returns1y !== null || f.schemeCode);
  writeData('mutual-funds.json', completeData);
  console.log(`    ✅ Returns calculated for ${updated} funds (${failed} failed). Saved ${completeData.length} funds with data.`);
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
// SANITIZE IPO RECORDS — Remove fabricated data before writing
// Nullifies GMP, AI placeholders, and subscription when no real
// NSE data was fetched. Adds lastUpdated timestamp to each record.
// ═══════════════════════════════════════════════════════════════

/**
 * Sanitize IPO records before writing to ipos.json.
 * @param {Array} records - Array of IPO record objects
 * @param {Array} nseSubscriptionData - Real NSE subscription data (from fetchNSESubscription)
 * @returns {Array} Sanitized records with timestamps
 */
function sanitizeIPORecords(records, nseSubscriptionData = []) {
  const now = new Date().toISOString();
  const nseNames = new Set(nseSubscriptionData.map(d => d.name?.toLowerCase().trim()).filter(Boolean));

  return records.map(record => {
    // 1. GMP: preserve manually set values (updated via scripts/update-gmp.mjs)
    // Only null out GMP for newly created records (where gmp was never set)
    if (record.gmp === undefined) {
      record.gmp = null;
    }

    // 2. AI placeholders: always null (no AI scoring in pipeline)
    record.aiScore = null;
    record.aiSummary = null;
    record.verdict = null;

    // 3. Subscription: null unless real NSE data populated it
    const hasRealNSEData = nseNames.has(record.name?.toLowerCase().trim());
    if (!hasRealNSEData) {
      record.subscription = null;
    }

    // 4. Add lastUpdated ISO 8601 timestamp
    record.lastUpdated = now;

    return record;
  });
}

// ═══════════════════════════════════════════════════════════════
// MERGE & UPDATE LOGIC
// ═══════════════════════════════════════════════════════════════

function mergeIPOData(existing, bseIPOs, nseData, sebiFilings) {
  // Only replace if scraper provides MORE data than existing
  if (bseIPOs.length <= existing.filter(i => i.status === 'live').length) {
    console.log(`    Scraper returned ${bseIPOs.length} IPOs, existing has ${existing.filter(i => i.status === 'live').length} live. Keeping existing.`);
    return existing;
  }
  
  // Scraper has more data — replace live entries
  let result = existing.filter(ipo => ipo.status !== 'live');
  
  for (const bseIPO of bseIPOs) {
    if (!bseIPO.name || bseIPO.name.length < 3) continue;
    
    result.push({
      ...bseIPO,
      issueSize: bseIPO.issueSize || '',
      aiSummary: '',
      highlights: [],
      riskScore: 5,
      verdict: 'neutral',
      aiScore: null,
      gmp: bseIPO.gmp || null,
      subscription: bseIPO.subscription || null,
      founders: '',
      headquarters: '',
      founded: '',
      description: '',
      purpose: '',
      drhpUrl: bseIPO.drhpUrl || 'https://www.sebi.gov.in/filings/public-issues.html',
      registrar: bseIPO.registrar || '',
    });
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
// DATE-BASED STATUS TRANSITIONS
// Automatically moves IPOs: live → closed → listed based on dates
// ═══════════════════════════════════════════════════════════════

function updateIPOStatuses() {
  console.log('\n  📅 Updating IPO statuses based on dates...');
  
  const ipos = readExisting('ipos.json');
  if (!ipos || ipos.length === 0) return;
  
  const now = new Date();
  // Set to start of today IST for consistent comparison
  const todayIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  todayIST.setHours(0, 0, 0, 0);
  
  let changes = 0;
  
  for (const ipo of ipos) {
    const oldStatus = ipo.status;
    
    // Skip if already in a terminal state we don't want to change
    if (oldStatus === 'upcoming' || oldStatus === 'drhp-filed') continue;
    
    const closeDate = parseIPODate(ipo.closeDate);
    const listingDate = parseIPODate(ipo.listingDate);
    const openDate = parseIPODate(ipo.openDate);
    
    if (listingDate && todayIST >= listingDate) {
      ipo.status = 'listed';
    } else if (closeDate && todayIST > closeDate) {
      ipo.status = 'closed';
    } else if (openDate && closeDate && todayIST >= openDate && todayIST <= closeDate) {
      ipo.status = 'live';
    }
    
    if (ipo.status !== oldStatus) {
      console.log(`    ${ipo.name}: ${oldStatus} → ${ipo.status}`);
      changes++;
    }
  }
  
  if (changes > 0) {
    writeData('ipos.json', ipos);
    console.log(`    ✅ Updated ${changes} IPO status(es)`);
  } else {
    console.log('    No status changes needed');
  }
}

/**
 * Parse IPO date strings like "Jun 09, 2026", "Jun 08, 2026", 
 * "10th Jun 2026", "2026-06-10", etc.
 */
function parseIPODate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  // Try standard Date parse first (handles "Jun 09, 2026" format)
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  
  // Handle "10th Jun 2026", "04th – 08th Jun 2026" (take last date)
  const ordinalPattern = /(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})/g;
  const matches = [...dateStr.matchAll(ordinalPattern)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    d = new Date(`${last[1]} ${last[2]} ${last[3]}`);
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  
  // Handle "DD-MM-YYYY" or "DD/MM/YYYY"
  const dmyPattern = /(\d{2})[-\/](\d{2})[-\/](\d{4})/;
  const dmyMatch = dateStr.match(dmyPattern);
  if (dmyMatch) {
    d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  
  return null;
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
// STALENESS CHECKS — Run after all writes complete
// ═══════════════════════════════════════════════════════════════

async function runStalenessChecks() {
  console.log('\n  🕐 Running staleness checks...');

  const ipos = readExisting('ipos.json');
  const mfData = readExisting('mutual-funds.json');

  const ipoReport = checkStaleness(ipos, { maxAgeHours: 24, dataType: 'IPO' });
  const mfReport = checkStaleness(mfData, { maxAgeHours: 48, dataType: 'MF' });

  if (ipoReport.staleCount > 0) {
    console.log(`    ⚠️ ${ipoReport.staleCount} stale IPO record(s) detected (>24h)`);
    await sendAlert({
      title: 'Stale Data Detected',
      message: `${ipoReport.staleCount} IPO record(s) have not been updated in over 24 hours.`,
      severity: 'warning',
      source: 'Staleness Monitor (IPO)',
    });
  } else {
    console.log('    ✅ IPO data is fresh (within 24h)');
  }

  if (mfReport.staleCount > 0) {
    console.log(`    ⚠️ ${mfReport.staleCount} stale MF record(s) detected (>48h)`);
    await sendAlert({
      title: 'Stale Data Detected',
      message: `${mfReport.staleCount} MF record(s) have not been updated in over 48 hours.`,
      severity: 'warning',
      source: 'Staleness Monitor (MF)',
    });
  } else {
    console.log('    ✅ MF data is fresh (within 48h)');
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const mfOnly = args.includes('--mf-only');
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  IPOfins — Automated Data Refresh');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  
  if (mfOnly) {
    console.log('  Mode: MF-ONLY (GitHub Actions — skipping IPO fetch)');
    console.log('  Sources: AMFI (NAVs) + mfapi.in (Returns)');
  } else {
    console.log('  Mode: FULL (Local — IPO + Mutual Funds)');
    console.log('  Sources: Zerodha (IPO) | AMFI + mfapi.in (MF)');
  }
  
  if (!mfOnly) {
    // 1. Fetch from all IPO sources
    const bseIPOs = await fetchBSEIPOs();
    const nseData = await fetchNSESubscription();
    const sebiFilings = await fetchSEBIDRHP();
    
    // 2. Merge IPO data — ONLY if scraper returns more than existing
    const existingIPOs = readExisting('ipos.json');
    const liveExisting = existingIPOs.filter(i => i.status === 'live').length;
    
    if (bseIPOs.length > liveExisting) {
      const mergedIPOs = mergeIPOData(existingIPOs, bseIPOs, nseData, sebiFilings);
      const sanitizedIPOs = sanitizeIPORecords(mergedIPOs, nseData);
      // Validate before writing
      const { valid: validIPOs, rejected: rejectedIPOs } = validateBatch(sanitizedIPOs, IPO_SCHEMA);
      if (rejectedIPOs.length > 0) {
        console.log(`    ⚠️ Rejected ${rejectedIPOs.length} IPO records:`);
        rejectedIPOs.forEach(r => console.log(`      - ${r.record.name || 'unknown'}: ${r.reasons.join(', ')}`));
      }

      // Diff detection: count threshold check against existing data
      const diffResult = checkCountThreshold(existingIPOs, validIPOs);
      if (!diffResult.allowed) {
        console.log(`    ⚠️ [Diff] Write rejected: ${diffResult.reason}`);
        await sendAlert({
          title: 'IPO Data Write Rejected',
          message: diffResult.reason,
          severity: 'warning',
          source: 'Diff Detector (ipos.json)',
        });
        console.log('    ℹ️ Retaining existing ipos.json unchanged.');
      } else {
        // Apply field protection to prevent degradation of populated fields
        const protectedIPOs = protectFields(existingIPOs, validIPOs);
        // Apply timestamp preservation for unchanged records
        const finalIPOs = preserveTimestamps(existingIPOs, protectedIPOs);
        writeData('ipos.json', finalIPOs);
      }
    } else {
      console.log(`\n  ℹ️ Scraper returned ${bseIPOs.length} live IPOs, existing has ${liveExisting}. Keeping existing ipos.json.`);
      // Still sanitize existing data to ensure AI/GMP fields are null and timestamps are present
      const sanitizedExisting = sanitizeIPORecords(existingIPOs, nseData);
      // Validate before writing
      const { valid: validExistingIPOs, rejected: rejectedExistingIPOs } = validateBatch(sanitizedExisting, IPO_SCHEMA);
      if (rejectedExistingIPOs.length > 0) {
        console.log(`    ⚠️ Rejected ${rejectedExistingIPOs.length} IPO records:`);
        rejectedExistingIPOs.forEach(r => console.log(`      - ${r.record.name || 'unknown'}: ${r.reasons.join(', ')}`));
      }

      // Diff detection: count threshold check against existing data
      const diffResultExisting = checkCountThreshold(existingIPOs, validExistingIPOs);
      if (!diffResultExisting.allowed) {
        console.log(`    ⚠️ [Diff] Write rejected: ${diffResultExisting.reason}`);
        await sendAlert({
          title: 'IPO Data Write Rejected',
          message: diffResultExisting.reason,
          severity: 'warning',
          source: 'Diff Detector (ipos.json)',
        });
        console.log('    ℹ️ Retaining existing ipos.json unchanged.');
      } else {
        // Apply field protection to prevent degradation of populated fields
        const protectedExistingIPOs = protectFields(existingIPOs, validExistingIPOs);
        // Apply timestamp preservation for unchanged records
        const finalExistingIPOs = preserveTimestamps(existingIPOs, protectedExistingIPOs);
        writeData('ipos.json', finalExistingIPOs);
      }
    }
    
    // 3. Merge upcoming IPO data
    const existingUpcoming = readExisting('upcoming-ipos.json');
    const mergedUpcoming = mergeUpcomingData(existingUpcoming, sebiFilings);
    // Validate before writing
    const { valid: validUpcoming, rejected: rejectedUpcoming } = validateBatch(mergedUpcoming, UPCOMING_IPO_SCHEMA);
    if (rejectedUpcoming.length > 0) {
      console.log(`    ⚠️ Rejected ${rejectedUpcoming.length} upcoming IPO records:`);
      rejectedUpcoming.forEach(r => console.log(`      - ${r.record.name || 'unknown'}: ${r.reasons.join(', ')}`));
    }
    writeData('upcoming-ipos.json', validUpcoming);
    
    // 4. Update IPO statuses based on dates (live → closed → listed)
    updateIPOStatuses();
  }
  
  // 4. Fetch mutual fund NAVs from AMFI
  await fetchAMFINAVs();
  
  // 5. Calculate returns from historical NAV (mfapi.in)
  await fetchFundReturns();
  
  if (!mfOnly) {
    // 6. Fetch fund holdings via AMFI portfolio disclosure (Puppeteer)
    await fetchFundHoldings();
  }
  
  // 7. Ensure static data is intact
  ensureStaticData();
  
  // Close browser if opened
  await closeBrowser();
  
  // 8. Run staleness checks on written data
  await runStalenessChecks();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  ✅ Data refresh complete. Ready for build.');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(0); // Don't fail build — keep existing data
});
