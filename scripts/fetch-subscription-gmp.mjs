#!/usr/bin/env node
/**
 * IPOfins — Subscription, GMP & Financial Data Fetcher (Local Only)
 *
 * Sources & Data Ownership:
 * ──────────────────────────────────────────────────────────────
 * Groww /ipo/subscription
 *   → subscription (overall x-times)
 *   → subscriptionDetails: retail, nii, qib, employee
 *   → subscriptionUpdatedAt
 *
 * Groww /ipo/{slug}-ipo  (individual detail page)
 *   → drhpUrl   ← SOLE AUTHORITATIVE SOURCE
 *                  Direct company/SEBI-hosted RHP PDF link.
 *                  Zerodha links its own domain — never used here.
 *   → registrar
 *   → founders (Managing Director), founded (year)
 *   → sector
 *   → description (About company)
 *   → financials: revenue, profit, total_assets (year-wise)
 *   → kpis: roe, roce, ebitdaMargin, patMargin, debtEquity, eps, nav, ronw
 *   → highlights (pros), risks (cons)  — overwrite Zerodha's
 *   → listingPrice (fallback if Zerodha missed it)
 *
 * IPOWatch.in  (Puppeteer)
 *   → gmp, gmpUpdatedAt
 *
 * InvestorGain.com  (Puppeteer — GMP fallback)
 *   → gmp, gmpUpdatedAt
 *
 * USAGE:
 *   node scripts/fetch-subscription-gmp.mjs           # Full fetch
 *   node scripts/fetch-subscription-gmp.mjs --sub-only  # Subscription only
 *   node scripts/fetch-subscription-gmp.mjs --gmp-only  # GMP only
 *
 * Run locally, push results to GitHub. No API keys needed.
 * Schedule via Windows Task Scheduler every 2-3 hours during market days.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');
const IPOS_PATH = join(DATA_DIR, 'ipos.json');

const args = process.argv.slice(2);
const SUB_ONLY = args.includes('--sub-only');
const GMP_ONLY = args.includes('--gmp-only');

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function loadIPOs() {
  if (!existsSync(IPOS_PATH)) return [];
  let content = readFileSync(IPOS_PATH, 'utf-8');
  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  return JSON.parse(content);
}

function saveIPOs(data) {
  writeFileSync(IPOS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function fuzzyMatch(name1, name2) {
  const normalize = (s) => s.toLowerCase()
    .replace(/\s*(limited|ltd|ipo|india|pvt|private|company|technologies|industries)\s*/gi, '')
    .replace(/[^a-z0-9]/g, '');
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  if (n1.length >= 6 && n2.length >= 6 && n1.slice(0, 6) === n2.slice(0, 6)) return true;
  return false;
}

async function fetchHTML(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// ═══════════════════════════════════════════════════════════════
// PUPPETEER (for GMP pages — JS-rendered)
// ═══════════════════════════════════════════════════════════════

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  try {
    // Try puppeteer first, fallback to puppeteer-core with system Chrome
    let puppeteer;
    try {
      puppeteer = await import('puppeteer');
    } catch {
      puppeteer = await import('puppeteer-core');
    }
    
    // Find Chrome on Windows
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ];
    const executablePath = chromePaths.find(p => existsSync(p));
    
    const launchOpts = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    if (executablePath) launchOpts.executablePath = executablePath;
    
    browserInstance = await puppeteer.default.launch(launchOpts);
    return browserInstance;
  } catch (e) {
    console.log(`  ⚠️ Puppeteer not available: ${e.message}`);
    return null;
  }
}

async function closeBrowser() {
  if (browserInstance) { await browserInstance.close(); browserInstance = null; }
}

// ═══════════════════════════════════════════════════════════════
// 1. GROWW — Subscription Page (category-wise: Retail, NII, QIB)
// Source: https://groww.in/ipo/subscription
// Server-rendered HTML — no Puppeteer needed
// ═══════════════════════════════════════════════════════════════

async function fetchGrowwSubscription() {
  console.log('\n  👥 [Groww] Fetching subscription data...');
  try {
    const html = await fetchHTML('https://groww.in/ipo/subscription');
    if (html.length < 5000) throw new Error('Page too small — may be blocked');

    // Groww uses Next.js — subscription data is in __NEXT_DATA__ JSON
    const nextDataMatch = html.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) throw new Error('Could not find __NEXT_DATA__ in page');
    
    const nextData = JSON.parse(nextDataMatch[1]);
    const dataList = nextData?.props?.pageProps?.dataList;
    if (!dataList || !Array.isArray(dataList)) throw new Error('No dataList in page data');
    
    const results = [];
    
    for (const ipo of dataList) {
      if (!ipo.companyName || !ipo.searchId) continue;
      
      const entry = {
        name: ipo.companyName,
        growwSlug: ipo.searchId,
        symbol: ipo.symbol,
        isSme: ipo.isSme,
        issueSize: ipo.issueSize, // in rupees
        overallSubscription: ipo.overallSubscription,
        subscriptionUpdatedAt: ipo.subscriptionUpdatedAt,
        retail: null,
        nii: null,
        qib: null,
        employee: null,
        total: ipo.overallSubscription || null,
      };
      
      // Extract category-wise subscription
      if (ipo.subscriptionRates && ipo.subscriptionRates.length > 0) {
        for (const rate of ipo.subscriptionRates) {
          const val = Math.round(rate.subscriptionRate * 100) / 100;
          switch (rate.category) {
            case 'RETAIL': entry.retail = val; break;
            case 'NII': entry.nii = val; break;
            case 'QIB': entry.qib = val; break;
            case 'EMPLOYEE': entry.employee = val; break;
            case 'TOTAL': entry.total = val; break;
          }
        }
      }
      
      // Only include if there's any subscription data
      if (entry.total > 0 || entry.retail || entry.nii || entry.qib) {
        results.push(entry);
      }
    }
    
    console.log(`    ✅ Found subscription for ${results.length} IPOs`);
    return results;
  } catch (error) {
    console.log(`    ⚠️ Groww subscription failed: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. GROWW — Individual IPO Detail (Financials, KPIs, RHP, etc.)
// Source: https://groww.in/ipo/{slug}-ipo
// Server-rendered — no Puppeteer needed
// ═══════════════════════════════════════════════════════════════

async function fetchGrowwIPODetail(growwSlug, ipoName) {
  try {
    // Groww slug generation: strip common suffixes Groww drops from company names.
    // E.g. Zerodha slug "clay-craft-india" → Groww uses "clay-craft-ipo" (drops "-india")
    // Build a list of candidate slugs to try in order.
    const base = growwSlug.endsWith('-ipo') ? growwSlug.slice(0, -4) : growwSlug;
    
    // Suffixes Groww commonly strips from company names in slugs
    const stripSuffixes = ['-india', '-limited', '-ltd', '-pvt', '-private', '-industries', '-india-limited', '-india-ltd'];
    
    const candidates = [];
    // 1. Direct: base + -ipo (most common)
    candidates.push(`${base}-ipo`);
    // 2. Strip known suffixes then add -ipo
    for (const suffix of stripSuffixes) {
      if (base.endsWith(suffix)) {
        candidates.push(`${base.slice(0, -suffix.length)}-ipo`);
        break; // only strip one suffix at a time
      }
    }
    // 3. Deduplicate while preserving order
    const seen = new Set();
    const uniqueCandidates = candidates.filter(c => seen.has(c) ? false : (seen.add(c), true));

    let html = null;
    let usedUrl = null;
    for (const slug of uniqueCandidates) {
      const url = `https://groww.in/ipo/${slug}`;
      try {
        const response = await fetchHTML(url);
        // Check for not-found page (Groww returns 200 with _notFoundPage in __NEXT_DATA__)
        if (response.length >= 3000 && !response.includes('"_notFoundPage"')) {
          html = response;
          usedUrl = url;
          break;
        }
      } catch {
        // try next candidate
      }
    }
    
    if (!html) return null;
    
    // Extract structured data from __NEXT_DATA__ (much more reliable than regex on HTML)
    const nextDataMatch = html.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) return null;
    
    const nextData = JSON.parse(nextDataMatch[1]);
    const ipo = nextData?.props?.pageProps?.ipoData;
    if (!ipo) return null;
    
    const detail = {};
    
    // --- RHP/DRHP Document URL (proper regulatory link) ---
    if (ipo.documentUrl) {
      detail.rhpUrl = ipo.documentUrl;
    }
    
    // --- Registrar (from registrar data if available) ---
    if (ipo.registrar) {
      detail.registrar = ipo.registrar.name || ipo.registrar;
    }
    
    // --- About Company ---
    if (ipo.aboutCompany) {
      detail.description = ipo.aboutCompany.aboutCompany?.slice(0, 500) || null;
      detail.founders = ipo.aboutCompany.managingDirector || null;
      detail.founded = ipo.aboutCompany.yearFounded || null;
      // headquarters: prefer city + state from Groww's registered address / about data
      const city = ipo.aboutCompany.city || ipo.aboutCompany.headquarterCity || null;
      const state = ipo.aboutCompany.state || ipo.aboutCompany.headquarterState || null;
      if (city && state) {
        detail.headquarters = `${city}, ${state}`;
      } else if (city) {
        detail.headquarters = city;
      } else if (ipo.aboutCompany.registeredAddress) {
        // Fall back to a short parse of registered address
        const addr = ipo.aboutCompany.registeredAddress;
        const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
        // Take last two meaningful parts (city, state) if available
        detail.headquarters = parts.slice(-2).join(', ') || null;
      }
    }
    
    // --- Financials (Revenue, Total Assets, Profit — year-wise) ---
    if (ipo.financials && Array.isArray(ipo.financials)) {
      detail.financials = {};
      for (const item of ipo.financials) {
        const key = item.title?.toLowerCase().replace(/\s+/g, '_');
        if (key && item.yearly) {
          detail.financials[key] = item.yearly;
        }
      }
    }
    
    // --- Strengths & Risks ---
    if (ipo.pros && ipo.pros.length > 0) {
      detail.highlights = ipo.pros.map(p => p.slice(0, 200)).slice(0, 5);
    }
    if (ipo.cons && ipo.cons.length > 0) {
      detail.risks = ipo.cons.map(c => c.slice(0, 200)).slice(0, 5);
    }
    
    // --- Listing Performance ---
    if (ipo.listing?.listingPrice) {
      detail.listingPrice = ipo.listing.listingPrice;
    }
    
    // --- Sector ---
    if (ipo.sector) {
      detail.sector = ipo.sector;
    }
    
    // --- Issue details ---
    detail.issuePrice = ipo.issuePrice || null;
    detail.issueSize = ipo.issueSize || null;
    detail.lotSize = ipo.lotSize || null;
    // Price range: use minPrice/maxPrice when available (more accurate than issuePrice alone)
    if (ipo.minPrice && ipo.maxPrice && ipo.minPrice !== ipo.maxPrice) {
      detail.priceMin = ipo.minPrice;
      detail.priceMax = ipo.maxPrice;
    } else if (ipo.maxPrice) {
      detail.priceMin = ipo.maxPrice;
      detail.priceMax = ipo.maxPrice;
    } else if (ipo.issuePrice) {
      detail.priceMin = ipo.issuePrice;
      detail.priceMax = ipo.issuePrice;
    }
    
    // --- Dates ---
    if (ipo.startDate) detail.openDate = ipo.startDate;
    if (ipo.endDate) detail.closeDate = ipo.endDate;
    
    // --- KPIs from page (look in kpiList if available) ---
    if (ipo.kpiList && Array.isArray(ipo.kpiList)) {
      detail.kpis = {};
      for (const kpi of ipo.kpiList) {
        const name = kpi.name?.toLowerCase().replace(/[^a-z]/g, '');
        const val = parseFloat(kpi.value);
        if (!isNaN(val) && name) {
          if (name.includes('roe')) detail.kpis.roe = val;
          else if (name.includes('roce')) detail.kpis.roce = val;
          else if (name.includes('ebitda')) detail.kpis.ebitdaMargin = val;
          else if (name.includes('pat') && name.includes('margin')) detail.kpis.patMargin = val;
          else if (name.includes('debt') && name.includes('equity')) detail.kpis.debtEquity = val;
          else if (name.includes('eps')) detail.kpis.eps = val;
          else if (name.includes('nav')) detail.kpis.nav = val;
          else if (name.includes('ronw')) detail.kpis.ronw = val;
        }
      }
    }
    
    return detail;
  } catch (error) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. GMP — IPOWatch.in (Puppeteer — JS-rendered)
// ═══════════════════════════════════════════════════════════════

async function fetchGMPFromIPOWatch() {
  console.log('\n  📊 [IPOWatch] Fetching GMP data...');
  const browser = await getBrowser();
  if (!browser) { console.log('    ⚠️ No Puppeteer, skipping GMP'); return []; }
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.goto('https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/', {
      waitUntil: 'networkidle2', timeout: 30000,
    });
    await page.waitForSelector('table', { timeout: 15000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 3000));
    
    const gmpData = await page.evaluate(() => {
      const results = [];
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        // Detect column positions from header row first
        const headerRow = table.querySelector('tr');
        if (!headerRow) continue;
        const headers = Array.from(headerRow.querySelectorAll('th,td')).map(h => h.textContent.trim().toLowerCase());
        
        // Find GMP column index — look for "gmp" or "grey market" header
        let gmpColIdx = headers.findIndex(h => h.includes('gmp') || h.includes('grey'));
        // Fallback: IPOWatch standard layout is col 2 (0=name, 1=price, 2=gmp, 3=est listing)
        if (gmpColIdx === -1) gmpColIdx = 2;

        const rows = table.querySelectorAll('tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) continue;
          const name = (cells[0].querySelector('a') || cells[0])?.textContent?.trim();
          if (!name || name.length < 3 || /^(IPO|company|name|sr|#)/i.test(name)) continue;
          
          // Read GMP from detected column
          const gmpCell = cells[gmpColIdx] || cells[2];
          const text = gmpCell?.textContent?.trim() || '';
          // Match signed number, e.g. "+50", "-10", "50", "₹50"
          const m = text.match(/[₹\s]*([+-]?\d+)/);
          if (!m) continue;
          const gmp = parseInt(m[1]);
          // Sanity: GMP range -500 to 2000; skip zeros from header rows
          if (gmp >= -500 && gmp <= 2000) {
            results.push({ name, gmp });
          }
        }
      }
      // Deduplicate by name (keep first occurrence)
      const seen = new Set();
      return results.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; });
    });
    
    await page.close();
    console.log(`    ✅ Found GMP for ${gmpData.length} IPOs`);
    return gmpData;
  } catch (error) {
    console.log(`    ⚠️ IPOWatch failed: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 3b. GMP FALLBACK — InvestorGain.com (Puppeteer)
// ═══════════════════════════════════════════════════════════════

async function fetchGMPFromInvestorGain() {
  console.log('\n  📊 [InvestorGain] Fetching GMP (fallback)...');
  const browser = await getBrowser();
  if (!browser) return [];
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.goto('https://www.investorgain.com/report/live-ipo-gmp/331/', {
      waitUntil: 'networkidle2', timeout: 30000,
    });
    await page.waitForSelector('table tbody tr', { timeout: 15000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 4000));
    
    const gmpData = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('table tbody tr, table tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) continue;
        const name = (cells[0].querySelector('a') || cells[0])?.textContent?.trim();
        if (!name || name.length < 3) continue;
        let gmp = null;
        for (let i = 1; i < Math.min(cells.length, 6); i++) {
          const m = cells[i].textContent.trim().match(/₹?\s*([+-]?\d+)/);
          if (m) { const v = parseInt(m[1]); if (v >= -200 && v <= 2000) { gmp = v; break; } }
        }
        if (gmp !== null) results.push({ name, gmp });
      }
      return results;
    });
    
    await page.close();
    console.log(`    ✅ Found GMP for ${gmpData.length} IPOs (InvestorGain)`);
    return gmpData;
  } catch (error) {
    console.log(`    ⚠️ InvestorGain failed: ${error.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. MERGE ALL DATA INTO ipos.json
//
// DATA OWNERSHIP (source of truth per field):
// ─────────────────────────────────────────────
// Zerodha (fetch-all-data.mjs):
//   name, slug, type, status, priceRange, priceMax, lotSize,
//   issueSize, openDate, closeDate, allotmentDate, refundDate,
//   creditDate, listingDate, listingPrice, description, purpose,
//   highlights, risks
//
// Groww /subscription (this file):
//   subscription, subscriptionDetails (retail/nii/qib/employee),
//   subscriptionUpdatedAt
//
// Groww /ipo/{slug}-ipo (this file):
//   drhpUrl  ← AUTHORITATIVE (direct company/SEBI-hosted PDF, not Zerodha link)
//   registrar, founders, founded, sector, headquarters,
//   financials, kpis, listingPrice (if Zerodha missed it)
//   lotSize, issuePrice→priceRange, issueSize (fallback if Zerodha parser missed them)
//   highlights, risks (Groww's are richer — overwrite Zerodha's)
//
// IPOWatch / InvestorGain (this file):
//   gmp, gmpUpdatedAt
//
// Manual (update-gmp.mjs):
//   gmp overrides
// ═══════════════════════════════════════════════════════════════

function mergeSubscription(ipos, subData) {
  let updated = 0;
  for (const entry of subData) {
    const match = ipos.find(ipo => fuzzyMatch(ipo.name, entry.name));
    if (match) {
      match.subscription = entry.total;
      match.subscriptionDetails = {
        retail: entry.retail,
        nii: entry.nii,
        qib: entry.qib,
        employee: entry.employee,
      };
      match.subscriptionUpdatedAt = new Date().toISOString();
      updated++;
      console.log(`    ✓ ${match.name}: ${entry.total}x (R:${entry.retail ?? '—'} N:${entry.nii ?? '—'} Q:${entry.qib ?? '—'})`);
    }
  }
  return updated;
}

function mergeGMP(ipos, gmpData) {
  let updated = 0;
  for (const entry of gmpData) {
    // Only update GMP for active IPOs (live, open, closed, allotment, upcoming)
    // GMP is irrelevant once listed — null it out for listed IPOs
    const match = ipos.find(ipo => fuzzyMatch(ipo.name, entry.name));
    if (match) {
      const activeStatuses = ['live', 'open', 'closed', 'allotment', 'upcoming'];
      if (!activeStatuses.includes(match.status)) {
        // Already listed/failed/withdrawn — GMP not relevant, skip
        continue;
      }
      const old = match.gmp;
      // Sanity check: GMP should not equal the issue price (that means wrong column was picked)
      const issuePrice = match.priceMax || parseInt((match.priceRange || '0').split('-').pop());
      if (issuePrice && entry.gmp === issuePrice) {
        console.log(`    ⚠️ ${match.name}: GMP ${entry.gmp} == issue price ${issuePrice} — likely wrong column, skipping`);
        continue;
      }
      match.gmp = entry.gmp;
      match.gmpUpdatedAt = new Date().toISOString();
      if (old !== entry.gmp) {
        updated++;
        console.log(`    ✓ ${match.name}: GMP ${old ?? '—'} → ₹${entry.gmp}`);
      }
    }
  }
  // Null out GMP for all listed IPOs (stale pre-listing GMP should not show on listed pages)
  for (const ipo of ipos) {
    if (ipo.status === 'listed' && ipo.gmp !== null && ipo.gmp !== undefined) {
      ipo.gmp = null;
      delete ipo.gmpUpdatedAt;
    }
  }
  return updated;
}

function mergeDetails(ipos, detailsMap) {
  let updated = 0;
  for (const [name, detail] of detailsMap) {
    const match = ipos.find(ipo => fuzzyMatch(ipo.name, name));
    if (!match || !detail) continue;
    
    let changed = false;
    
    // ── drhpUrl ──────────────────────────────────────────────────
    // Groww is the SOLE authoritative source for drhpUrl.
    // It links directly to the company-hosted or SEBI-hosted PDF.
    // Zerodha links to its own domain — those are never used.
    // Always overwrite with Groww's value when available.
    if (detail.rhpUrl) {
      match.drhpUrl = detail.rhpUrl;
      changed = true;
    } else if (!match.drhpUrl) {
      // No Groww URL yet — fall back to SEBI generic filings page
      // The [slug].astro page only renders the Documents section when drhpUrl is truthy,
      // so leaving it empty is safer than showing a misleading fallback link.
      // Do NOT set a generic fallback here.
      changed = false; // no change needed
    }
    
    // ── Registrar ────────────────────────────────────────────────
    if (detail.registrar && !match.registrar) {
      match.registrar = detail.registrar;
      changed = true;
    }
    
    // ── Description ──────────────────────────────────────────────
    // Only update if Groww has a longer/better one
    if (detail.description && (!match.description || match.description.length < detail.description.length)) {
      match.description = detail.description;
      changed = true;
    }
    
    // ── Founders / MD ────────────────────────────────────────────
    if (detail.founders && !match.founders) {
      match.founders = detail.founders;
      changed = true;
    }
    
    // ── Founded year ─────────────────────────────────────────────
    if (detail.founded && !match.founded) {
      match.founded = detail.founded;
      changed = true;
    }
    
    // ── Headquarters ─────────────────────────────────────────────
    if (detail.headquarters && !match.headquarters) {
      match.headquarters = detail.headquarters;
      changed = true;
    }
    
    // ── Sector ───────────────────────────────────────────────────
    if (detail.sector && (!match.sector || match.sector === 'Others')) {
      match.sector = detail.sector;
      changed = true;
    }
    
    // ── Financials (Revenue, Profit, Total Assets year-wise) ─────
    if (detail.financials && Object.keys(detail.financials).length > 0) {
      match.financials = detail.financials;
      changed = true;
    }
    
    // ── KPIs (ROE, ROCE, EPS, etc.) ──────────────────────────────
    if (detail.kpis && Object.keys(detail.kpis).length > 0) {
      match.kpis = detail.kpis;
      changed = true;
    }
    
    // ── Listing price ────────────────────────────────────────────
    // Groww fills this when Zerodha detail page missed it
    if (detail.listingPrice && !match.listingPrice) {
      match.listingPrice = detail.listingPrice;
      changed = true;
    }

    // ── Price range / lot size / issue size (Groww fallback) ─────
    // Zerodha's detail page parser can miss these (e.g. nested HTML structure).
    // Groww's __NEXT_DATA__ is structured JSON — much more reliable as a fallback.
    if (detail.lotSize && (!match.lotSize || match.lotSize === 0)) {
      match.lotSize = detail.lotSize;
      changed = true;
    }
    if (detail.priceMax && (!match.priceRange || match.priceRange === '' || match.priceRange === '0')) {
      // Use min-max range if available, otherwise single price
      match.priceRange = detail.priceMin !== detail.priceMax
        ? `${detail.priceMin}-${detail.priceMax}`
        : String(detail.priceMax);
      match.priceMax = detail.priceMax;
      changed = true;
    }
    if (detail.issueSize && (!match.issueSize || match.issueSize === '')) {
      // Groww returns issueSize in raw rupees (e.g. 360200000 = ₹36.02 Cr)
      // Convert to crores rounded to 2 decimal places
      const crores = Math.round(detail.issueSize / 10000000 * 100) / 100;
      match.issueSize = `₹${crores} Cr`;
      changed = true;
    }
    
    // ── Highlights / Strengths ───────────────────────────────────
    // Groww's pros are more detailed — always prefer over Zerodha's
    if (detail.highlights && detail.highlights.length > 0) {
      match.highlights = detail.highlights;
      changed = true;
    }
    
    // ── Risks ────────────────────────────────────────────────────
    // Groww's cons are more detailed — always prefer over Zerodha's
    if (detail.risks && detail.risks.length > 0) {
      match.risks = detail.risks;
      changed = true;
    }
    
    if (changed) updated++;
  }
  return updated;
}

// ═══════════════════════════════════════════════════════════════
// 5. CLEAN LEGACY DRHP URLs
// Removes any stale Zerodha-domain links that may be in existing
// ipos.json data (from before this pipeline change).
// Groww will re-populate them with the correct PDF URL on next run.
// ═══════════════════════════════════════════════════════════════

function fixDRHPUrls(ipos) {
  let fixed = 0;
  for (const ipo of ipos) {
    // Strip any Zerodha-domain links — they are not authoritative
    if (ipo.drhpUrl && ipo.drhpUrl.includes('zerodha.com')) {
      // Reset to empty so Groww fills the real PDF link on next run
      ipo.drhpUrl = '';
      fixed++;
    }
  }
  if (fixed > 0) console.log(`    ✓ Cleared ${fixed} legacy Zerodha DRHP URLs (Groww will repopulate)`);
  return fixed;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  IPOfins — Subscription, GMP & Financials (Local)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  if (SUB_ONLY) console.log('  Mode: Subscription only');
  if (GMP_ONLY) console.log('  Mode: GMP only');
  console.log('');
  
  const ipos = loadIPOs();
  if (ipos.length === 0) {
    console.log('  ❌ No IPO data. Run fetch-all-data.mjs first.');
    process.exit(0);
  }
  
  let subUpdated = 0, gmpUpdated = 0, detailsUpdated = 0;
  
  // ─── FIX: Remove all Zerodha DRHP URLs ───
  fixDRHPUrls(ipos);
  
  // ─── SUBSCRIPTION + DETAILS (from Groww) ───
  if (!GMP_ONLY) {
    // 1. Category-wise subscription
    const subData = await fetchGrowwSubscription();
    if (subData.length > 0) {
      console.log('\n  🔄 Merging subscription...');
      subUpdated = mergeSubscription(ipos, subData);
    }
    
    // 2. Fetch detail pages for active IPOs (financials, RHP, registrar)
    const activeIPOs = ipos.filter(i => ['live', 'open', 'closed', 'allotment', 'upcoming'].includes(i.status));
    if (activeIPOs.length > 0 && subData.length > 0) {
      console.log(`\n  📄 [Groww] Fetching detail pages for ${activeIPOs.length} active IPOs...`);
      const detailsMap = new Map();
      
      for (const ipo of activeIPOs) {
        // Use Groww slug from subscription data if available, otherwise generate
        const subEntry = subData.find(s => fuzzyMatch(s.name, ipo.name));
        const growwSlug = subEntry?.growwSlug || slugify(ipo.name);
        
        const detail = await fetchGrowwIPODetail(growwSlug, ipo.name);
        if (detail) {
          detailsMap.set(ipo.name, detail);
          const rhp = detail.rhpUrl ? 'yes' : 'no';
          const fin = detail.financials ? Object.keys(detail.financials).length : 0;
          const kpis = detail.kpis ? Object.keys(detail.kpis).length : 0;
          const lot = detail.lotSize ? detail.lotSize : '—';
          const price = detail.priceMax ? (detail.priceMin !== detail.priceMax ? `${detail.priceMin}-${detail.priceMax}` : String(detail.priceMax)) : '—';
          console.log(`    ✅ ${ipo.name}: RHP=${rhp} Financials=${fin} KPIs=${kpis} lot=${lot} price=${price}`);
        } else {
          console.log(`    ⚠️ ${ipo.name}: No detail page found on Groww`);
        }
        // Respectful delay
        await new Promise(r => setTimeout(r, 1500));
      }
      
      if (detailsMap.size > 0) {
        console.log('\n  🔄 Merging financial details...');
        detailsUpdated = mergeDetails(ipos, detailsMap);
      }
    }
  }
  
  // ─── GMP ───
  if (!SUB_ONLY) {
    let gmpData = await fetchGMPFromIPOWatch();
    if (gmpData.length === 0) {
      gmpData = await fetchGMPFromInvestorGain();
    }
    if (gmpData.length > 0) {
      console.log('\n  🔄 Merging GMP...');
      gmpUpdated = mergeGMP(ipos, gmpData);
    } else {
      console.log('\n  ⚠️ No GMP data from any source');
    }
  }
  
  // ─── SAVE ───
  const totalChanges = subUpdated + gmpUpdated + detailsUpdated;
  if (totalChanges > 0) {
    saveIPOs(ipos);
    console.log(`\n  ✅ Saved: ${subUpdated} sub + ${gmpUpdated} GMP + ${detailsUpdated} details`);
  } else {
    // Still save if DRHP URLs were fixed
    saveIPOs(ipos);
    console.log('\n  ℹ️ DRHP URLs fixed. No other data changes.');
  }
  
  await closeBrowser();
  
  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  Done. Run local-sub-gmp-push.bat to commit & push.');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  closeBrowser().catch(() => {});
  process.exit(0);
});
