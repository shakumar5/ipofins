/**
 * Authorized data sources only: NSE, BSE, SEBI, AMFI.
 * No broker portals, grey-market sites, or third-party aggregators.
 */

import { existsSync } from 'fs';

// ─── Utilities ───────────────────────────────────────────────

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
}

async function fetchWithHeaders(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response;
}

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
  try {
    let puppeteer;
    try {
      puppeteer = await import('puppeteer');
    } catch {
      puppeteer = await import('puppeteer-core');
    }
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ];
    const executablePath = chromePaths.find((p) => existsSync(p));
    const launchOpts = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
    if (executablePath) launchOpts.executablePath = executablePath;
    browserInstance = await puppeteer.default.launch(launchOpts);
    return browserInstance;
  } catch (e) {
    console.log(`    ⚠️ Puppeteer not available: ${e.message}`);
    return null;
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// ─── AMFI NAV ────────────────────────────────────────────────

export async function fetchAMFINAVs() {
  console.log('\n  💰 [AMFI] Fetching NAVAll.txt...');
  const response = await fetchWithHeaders('https://www.amfiindia.com/spages/NAVAll.txt');
  const text = await response.text();
  const funds = parseAMFIFunds(text);
  console.log(`    ✅ Parsed ${funds.length} equity growth funds`);
  return funds;
}

function parseAMFIFunds(text) {
  const funds = [];
  const lines = text.split('\n');
  let currentCategory = '';
  let currentAmc = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('Open Ended Schemes')) {
      const catMatch = trimmed.match(/Open Ended Schemes\((.+)\)/);
      if (catMatch) currentCategory = catMatch[1];
      continue;
    }

    const parts = trimmed.split(';');
    if (parts.length < 5 || !parts[4] || isNaN(parseFloat(parts[4]))) {
      if (
        !trimmed.startsWith('Open Ended') &&
        !trimmed.startsWith('Close Ended') &&
        trimmed.length > 2 &&
        !/^\d/.test(trimmed)
      ) {
        currentAmc = trimmed.replace(/\s+Mutual Fund$/i, '').trim();
      }
      continue;
    }

    const schemeName = parts[3]?.trim() || '';
    const nav = parseFloat(parts[4]);
    const schemeCode = parts[0]?.trim();
    if (!schemeName || !schemeCode || nav <= 0) continue;

    const lower = schemeName.toLowerCase();
    // Direct-Growth only — matches site policy and avoids Regular/Direct slug collisions
    if (!lower.includes('direct') || !lower.includes('growth')) continue;
    if (lower.includes('dividend') || lower.includes('idcw')) continue;
    // Exclude bonus/institutional/segregated variants (wrong NAV vs standard growth)
    if (lower.includes('bonus')) continue;
    if (lower.includes('institutional')) continue;
    if (lower.includes('segregated')) continue;
    if (lower.includes('workplace')) continue;

    const catLower = currentCategory.toLowerCase();
    const includeCategory =
      catLower.includes('equity') ||
      catLower.includes('children') ||
      catLower.includes('solution oriented');
    if (!includeCategory) continue;

    const category = simplifyCategory(currentCategory);
    const cleanName = schemeName
      .replace(/\s*-\s*Growth\s+Option.*$/i, '')
      .replace(/\s*-\s*Growth\s+Plan.*$/i, '')
      .replace(/\s*-\s*Growth.*$/i, '')
      .replace(/\s*-\s*Direct\s*Plan.*$/i, '')
      .replace(/\s*\(direct plan\)/i, '')
      .trim();
    funds.push({
      schemeCode,
      name: cleanName,
      slug: slugify(cleanName),
      amc: currentAmc,
      category,
      nav,
      navDate: parts[5]?.trim() || null,
    });
  }

  // One AMFI row per slug (avoid bonus/duplicate scheme collisions)
  const bySlug = new Map();
  for (const f of funds) {
    if (!bySlug.has(f.slug)) bySlug.set(f.slug, f);
  }
  return [...bySlug.values()];
}

function simplifyCategory(raw) {
  const map = [
    ['Large Cap', 'Large Cap'],
    ['Mid Cap', 'Mid Cap'],
    ['Small Cap', 'Small Cap'],
    ['Flexi Cap', 'Flexi Cap'],
    ['Children', 'Flexi Cap'],
    ['Child', 'Flexi Cap'],
    ['Multi Cap', 'Multi Cap'],
    ['ELSS', 'ELSS'],
    ['Contra', 'Contra'],
    ['Value', 'Value'],
    ['Focused', 'Focused'],
    ['Sectoral', 'Sectoral'],
    ['Thematic', 'Thematic'],
    ['Dividend Yield', 'Dividend Yield'],
  ];
  for (const [key, val] of map) {
    if (raw.includes(key)) return val;
  }
  return raw.split('-').pop()?.trim() || 'Equity';
}

// ─── SEBI DRHP ───────────────────────────────────────────────

export async function fetchSEBIDRHP() {
  console.log('\n  📋 [SEBI] Fetching DRHP filings...');
  const url =
    'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=10';
  const response = await fetchWithHeaders(url);
  const html = await response.text();
  const filings = parseSEBIFilings(html);
  console.log(`    ✅ Found ${filings.length} DRHP filings`);
  return filings;
}

function parseSEBIFilings(html) {
  const filings = [];
  const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const datePattern = /(\d{2}\s+\w+\s+\d{4})/;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    if (
      text.length > 10 &&
      href.includes('/filings/') &&
      !text.includes('SEBI') &&
      !text.includes('Click')
    ) {
      const dateMatch = text.match(datePattern);
      const name = text.replace(datePattern, '').replace(/[-–]/g, '').trim();
      filings.push({
        name,
        slug: slugify(name),
        drhpDate: dateMatch ? dateMatch[1] : '',
        drhpUrl: href.startsWith('http') ? href : `https://www.sebi.gov.in${href}`,
        status: 'drhp-filed',
        type: 'mainboard',
      });
    }
  }

  return filings.slice(0, 30);
}

// ─── NSE IPO listing + subscription ──────────────────────────

export async function fetchNSEIPOs() {
  console.log('\n  📈 [NSE] Fetching IPO listings...');
  const browser = await getBrowser();
  if (!browser) {
    console.log('    ⚠️ No browser — skipping NSE (run locally with Chrome)');
    return [];
  }

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto('https://www.nseindia.com/market-data/all-upcoming-issues-ipo', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    const loaded = await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(() => null);
    if (!loaded) {
      console.log('    ⚠️ NSE table did not load (bot protection)');
      await page.close();
      return [];
    }

    await new Promise((r) => setTimeout(r, 2000));

    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const results = [];
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 4) return;
        const name = cells[0]?.textContent?.trim() || '';
        const issueType = cells[1]?.textContent?.trim() || '';
        const priceRange = cells[2]?.textContent?.trim() || '';
        const openDate = cells[3]?.textContent?.trim() || '';
        const closeDate = cells[4]?.textContent?.trim() || '';
        const subscriptionText = cells[cells.length - 1]?.textContent?.trim() || '';
        const subscription = parseFloat(subscriptionText) || null;
        if (!name) return;
        results.push({ name, issueType, priceRange, openDate, closeDate, subscription });
      });
      return results;
    });

    await page.close();
    console.log(`    ✅ Found ${data.length} IPOs from NSE`);

    return data.map((row) => ({
      name: row.name.replace(/\s*(Limited|Ltd)\.?$/i, '').trim(),
      slug: slugify(row.name),
      type: row.issueType?.toLowerCase().includes('sme') ? 'sme' : 'mainboard',
      status: inferIPOStatus(row.openDate, row.closeDate),
      priceRange: row.priceRange || '',
      openDate: row.openDate || null,
      closeDate: row.closeDate || null,
      subscription: row.subscription,
      source: 'nse',
    }));
  } catch (error) {
    console.log(`    ⚠️ NSE failed: ${error.message.split('\n')[0]}`);
    return [];
  }
}

function inferIPOStatus(openDate, closeDate) {
  const now = new Date();
  const parse = (d) => {
    if (!d) return null;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  };
  const open = parse(openDate);
  const close = parse(closeDate);
  if (open && now < open) return 'upcoming';
  if (open && close && now >= open && now <= close) return 'live';
  if (close && now > close) return 'closed';
  return 'upcoming';
}

// ─── BSE IPO listing ─────────────────────────────────────────

export async function fetchBSEIPOs() {
  console.log('\n  📊 [BSE] Fetching public issues...');
  try {
    const response = await fetchWithHeaders(
      'https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx?id=1&Type=P'
    );
    const html = await response.text();
    const ipos = parseBSEIPOs(html);
    console.log(`    ✅ Found ${ipos.length} IPOs from BSE`);
    return ipos;
  } catch (error) {
    console.log(`    ⚠️ BSE failed: ${error.message}`);
    return [];
  }
}

function parseBSEIPOs(html) {
  const ipos = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = rowPattern.exec(html)) !== null) {
    const row = match[1];
    if (!row.includes('td')) continue;
    const cells = [];
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(row)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length < 4) continue;
    const name = cells[0]?.replace(/NSE|BSE|SME/gi, '').trim();
    if (!name || name.length < 3 || name === 'Company Name') continue;

    ipos.push({
      name,
      slug: slugify(name),
      type: name.toLowerCase().includes('sme') ? 'sme' : 'mainboard',
      status: 'upcoming',
      priceRange: cells[1] || '',
      openDate: cells[2] || null,
      closeDate: cells[3] || null,
      source: 'bse',
    });
  }

  return ipos;
}
