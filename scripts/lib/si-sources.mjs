/**
 * Super Investor + SAST data sources — BSE (primary) + NSE (Puppeteer fallback).
 *
 * NSE and BSE expose NO documented public API for Shareholding Pattern or SAST
 * filings. The endpoints used here are undocumented/hidden and may change without
 * notice. To absorb that fragility this module is layered:
 *
 *   1. BSE primary  — plain fetch + regex HTML parse (BSE is less bot-protected).
 *   2. NSE fallback — Puppeteer with cookie warm-up (like fetchNSEIPOs).
 *   3. JSON override (si-overrides.mjs) — hand-curated rows when both fail.
 *   4. Last-known-good — quality gate in the pipeline aborts but leaves the prior
 *      quarter's data intact, so the site keeps serving.
 *
 * All fetchers return normalized row shapes consumed directly by the pipeline
 * scripts. HTTP layer mirrors authorized-sources.mjs (Chrome UA, sleep cadence).
 */

import { existsSync } from 'fs';
import { sleep } from './ipo-utils.mjs';

// ─── HTTP layer (mirrors authorized-sources.mjs) ────────────

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** ms between per-stock requests (matches the existing Zerodha cadence). */
const RATE_LIMIT_MS = 800;

async function fetchText(url, extraHeaders = {}) {
  const response = await fetch(url, { headers: { ...HEADERS, ...extraHeaders } });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

async function fetchBuffer(url, extraHeaders = {}) {
  const response = await fetch(url, { headers: { ...HEADERS, ...extraHeaders } });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// ─── Puppeteer (NSE fallback) ───────────────────────────────

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) return browserInstance;
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
    // Linux (GitHub Actions / WSL)
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const executablePath = chromePaths.find((p) => p && existsSync(p));
  const launchOpts = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  if (executablePath) launchOpts.executablePath = executablePath;
  browserInstance = await puppeteer.default.launch(launchOpts);
  return browserInstance;
}

export async function closeSIBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/** Warm up an NSE session — visit the homepage to collect anti-bot cookies. */
async function nseSession(page) {
  await page.setUserAgent(UA);
  await page.goto('https://www.nseindia.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Let the anti-bot cookies settle.
  await new Promise((r) => setTimeout(r, 2500));
}

// ─── BSE scrip-code resolution ─────────────────────────────

/**
 * Map a stock (nse_symbol / isin / name) → BSE scrip code.
 * Uses BSE's quote-search suggest endpoint. Result is cached per process.
 */
const bseCodeCache = new Map();

export async function resolveBseCode(stock) {
  if (!stock) return null;

  const key = stock.isin || stock.nse_symbol || stock.name;
  if (!key) return null;
  if (bseCodeCache.has(key)) return bseCodeCache.get(key);

  let code = null;
  try {
    // BSE's symbol-autocomplete endpoint. JSON array of suggestions.
    const url = `https://api.bseindia.com/Msource/1D/getQouteSearch.aspx?Type=EQ&text=${encodeURIComponent(
      stock.nse_symbol || stock.name
    )}&flag=site`;
    const html = await fetchText(url);
    // Response is JSON-ish; scrip code is the leading numeric field of each row.
    const m = html.match(/"scrip_cd"\s*:\s*"?(\d{4,8})"?/i) || html.match(/(\d{6})/);
    if (m) code = m[1];
  } catch {
    // fallthrough — try ISIN-based lookup below
  }

  bseCodeCache.set(key, code);
  return code;
}

// ─── BSE Shareholding Pattern ──────────────────────────────

/**
 * Parse a BSE shareholding-pattern HTML payload into holder rows.
 * BSE renders the holder list inside repeated <tr> rows; holder name, shares
 * and percentage appear in successive <td> cells. We keep every row and let the
 * pipeline filter ≥1%.
 */
function parseBSEShareholdingHTML(html, sourceUrl) {
  const rows = [];
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  let inPromoter = false;
  let inPublic = false;

  while ((trMatch = trPattern.exec(html)) !== null) {
    const tr = trMatch[1];
    const cells = [];
    const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdPattern.exec(tr)) !== null) {
      const txt = tdMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;|&nbsp;|&#\d+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(txt);
    }
    if (cells.length < 2) continue;

    const header = cells[0].toLowerCase();
    if (header.includes('promoter')) {
      inPromoter = true;
      inPublic = false;
      // The row itself may be a section header without numbers.
      continue;
    }
    if (header.includes('public') && cells.length <= 2) {
      inPublic = true;
      inPromoter = false;
      continue;
    }

    // Expected layout: [name, shares, percentage] (sometimes [name, percentage, shares]).
    let name = cells[0];
    let shares = null;
    let pct = null;
    for (const c of cells.slice(1)) {
      const asPct = parseFloat(c.replace(/[%,]/g, ''));
      if (Number.isNaN(asPct)) continue;
      // Percentages are < 100, share counts are large integers.
      if (asPct < 100 && pct === null) pct = asPct;
      else if (asPct >= 100 && shares === null) shares = asPct;
    }
    if (!name || pct === null) continue;

    let holderType = 'unknown';
    if (inPromoter) holderType = 'promoter';
    else if (inPublic) holderType = 'public';
    else if (/foreign|fii|fiis/i.test(name)) holderType = 'fii';
    else if (/mutual fund|mf|insurance|lic|dii/i.test(name)) holderType = 'dii';

    rows.push({
      holderName: name,
      holderType,
      shares,
      pctOfCompany: pct,
      sourceUrl,
    });
  }
  return rows;
}

/**
 * Fetch the BSE shareholding pattern for one stock + quarter.
 * BSE's shareholding endpoint takes a scrip code + quarter key (format YYMM).
 */
export async function fetchBSEShareholdingPattern(stock, quarter) {
  const code = await resolveBseCode(stock);
  if (!code) return [];

  // Quarter → BSE quarter key: "2026-04-01" → "2603" (Mar of that FY end) etc.
  // BSE quarters are indexed as the prior month-end. We try the canonical mapping.
  const qkey = bseQuarterKey(quarter);
  const sourceUrl = `https://www.bseindia.com/corporates/shp.aspx?qtr=${qkey}&pcode=${code}`;

  try {
    const html = await fetchText(sourceUrl);
    const rows = parseBSEShareholdingHTML(html, sourceUrl);
    if (rows.length) await sleep(RATE_LIMIT_MS);
    return rows;
  } catch {
    return [];
  }
}

/** "2026-04-01" → "2603" (BSE uses FY-end Mar as the quarter index). */
function bseQuarterKey(quarter) {
  const d = new Date(quarter);
  if (isNaN(d.getTime())) return '';
  const yy = String(d.getFullYear()).slice(-2);
  const month = d.getMonth(); // 0-indexed; Q starting month → quarter-end month
  // Map quarter start → its end month (Jan→Mar, Apr→Jun, Jul→Sep, Oct→Dec).
  const endMonth = month + 2; // 0-indexed
  const dd = String(endMonth + 1).padStart(2, '0');
  return `${yy}${dd}`;
}

// ─── NSE Shareholding Pattern (Puppeteer) ──────────────────

/**
 * NSE shareholding page is JS-rendered and bot-protected. We drive a real
 * browser (cookies warmed on the homepage), navigate to the shareholding URL
 * for the symbol, and read the rendered table from the DOM.
 */
export async function fetchNSEShareholdingPatternPuppeteer(stock, quarter) {
  if (!stock.nse_symbol) return [];
  let browser;
  try {
    browser = await getBrowser();
  } catch {
    return [];
  }

  const page = await browser.newPage();
  try {
    await nseSession(page);
    const url = `https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${encodeURIComponent(
      stock.nse_symbol
    )}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page
      .waitForSelector('table tbody tr', { timeout: 15000 })
      .catch(() => null);
    await new Promise((r) => setTimeout(r, 1500));

    const rows = await page.evaluate((sym) => {
      const out = [];
      const trs = document.querySelectorAll('table tbody tr');
      trs.forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')).map((c) =>
          c.textContent.replace(/\s+/g, ' ').trim()
        );
        if (cells.length < 3) return;
        // Layout: [name, noOfShareholders, totalShares, percentage]
        const name = cells[0];
        const shares = parseInt((cells[2] || '').replace(/[,\s]/g, ''), 10) || null;
        const pct = parseFloat((cells[3] || '').replace(/[%,]/g, '')) || null;
        if (!name) return;
        out.push({
          holderName: name,
          holderType: 'unknown',
          shares: Number.isFinite(shares) ? shares : null,
          pctOfCompany: Number.isFinite(pct) ? pct : null,
          sourceUrl: `https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${sym}`,
        });
      });
      return out;
    }, stock.nse_symbol);

    await sleep(RATE_LIMIT_MS);
    return rows;
  } catch {
    return [];
  } finally {
    await page.close();
  }
}

// ─── Orchestrator: Shareholding Pattern ────────────────────

/**
 * Fetch shareholding pattern for one stock. BSE first (cheap, plain HTTP),
 * NSE Puppeteer fallback only when BSE yields nothing.
 */
export async function fetchShareholdingPattern(stock, quarter) {
  let rows = [];
  try {
    rows = await fetchBSEShareholdingPattern(stock, quarter);
  } catch {
    rows = [];
  }
  if (rows.length > 0) return rows;

  // Fallback to NSE only when BSE is empty.
  try {
    return await fetchNSEShareholdingPatternPuppeteer(stock, quarter);
  } catch {
    return [];
  }
}

// ─── BSE SAST / corporate announcements ────────────────────

const SAST_SUBJECT = /substantial\s+acquisition|SAST|takeover|shareholding\s+disclosure/i;

/**
 * Parse BSE corporate-announcement feed rows into SAST filings.
 */
function parseBSESASTHTML(html) {
  const filings = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const row = match[1];
    if (!row.includes('td')) continue;
    const cells = [];
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(row)) !== null) {
      cells.push(
        cellMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;|&nbsp;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
    }
    if (cells.length < 4) continue;
    const subject = cells.find((c) => SAST_SUBJECT.test(c));
    if (!subject) continue;

    // BSE announcement feed: [ticker, name, date, subject, category, pdf link, ...]
    const filingDate = cells.find((c) => /\d{2}[-/]\d{2}[-/]\d{4}/.test(c)) || null;
    const sourceUrlMatch = row.match(/href="([^"]*\.(?:pdf|html)[^"]*)"/i);
    filings.push({
      stockName: cells[1] || cells[0],
      nseSymbol: null, // resolved by caller via stockBySymbol later; we leave the ticker in stockName
      filingDate,
      subject,
      sourceUrl: sourceUrlMatch
        ? sourceUrlMatch[1].startsWith('http')
          ? sourceUrlMatch[1]
          : `https://www.bseindia.com${sourceUrlMatch[1]}`
        : null,
      raw: cells,
    });
  }
  return filings;
}

/**
 * Fetch recent SAST-type corporate announcements from BSE.
 * BSE exposes a corporate-announcement listing by date range + category filter.
 */
export async function fetchBSESASTFilings(daysBack) {
  const today = new Date();
  const from = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const fmt = (d) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(
      2,
      '0'
    )}/${d.getFullYear()}`;

  const url = `https://www.bseindia.com/corporates/anndetails_new.aspx?annsegment=AN&qtr=From%20${encodeURIComponent(
    fmt(from)
  )}%20to%20${encodeURIComponent(fmt(today))}&CategoryId=21`; // 21 ≈ SAST / Insider
  try {
    const html = await fetchText(url);
    return parseBSESASTHTML(html);
  } catch {
    return [];
  }
}

// ─── NSE SAST (Puppeteer) ──────────────────────────────────

/**
 * NSE corporate-announcements JSON (undocumented). Driven through Puppeteer so
 * NSE's anti-bot cookies are present. Filtered to SAST subjects.
 */
export async function fetchNSESASTFilingsPuppeteer(daysBack) {
  let browser;
  try {
    browser = await getBrowser();
  } catch {
    return [];
  }
  const page = await browser.newPage();
  try {
    await nseSession(page);
    const to = new Date();
    const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const api = `https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=${encodeURIComponent(
      fmt(from)
    )}&to_date=${encodeURIComponent(fmt(to))}`;

    const json = await page.evaluate(async (u) => {
      const r = await fetch(u);
      return r.text();
    }, api);

    let parsed = [];
    try {
      parsed = JSON.parse(json);
    } catch {
      parsed = [];
    }
    const arr = Array.isArray(parsed) ? parsed : parsed?.data || [];

    const filings = [];
    for (const a of arr) {
      const subject = a.sm_subject || a.subject || '';
      if (!SAST_SUBJECT.test(subject)) continue;
      filings.push({
        stockName: a.sm_name || a.symbol_name || '',
        nseSymbol: a.sm_symbol || a.symbol || '',
        filingDate: a.an_dt || a.rec_dt || null,
        subject,
        sourceUrl: a.att || a.sm_attachment || null,
        raw: a,
      });
    }
    return filings;
  } catch {
    return [];
  } finally {
    await page.close();
  }
}

// ─── Orchestrator: SAST filings ────────────────────────────

/**
 * Fetch SAST filings from both exchanges, dedupe by (symbol, date, subject).
 * Each row is enriched with filer/percent detail extracted from the subject
 * where possible (many SAST subject lines embed "from X% to Y%").
 */
export async function fetchSASTFilings(daysBack) {
  const [bseRaw, nseRaw] = await Promise.allSettled([
    fetchBSESASTFilings(daysBack),
    fetchNSESASTFilingsPuppeteer(daysBack),
  ]);

  const bse = bseRaw.status === 'fulfilled' ? bseRaw.value : [];
  const nse = nseRaw.status === 'fulfilled' ? nseRaw.value : [];

  const filings = [];
  const seen = new Set();

  for (const f of [...bse, ...nse]) {
    const key = `${(f.nseSymbol || '').toUpperCase()}|${f.filingDate}|${(f.subject || '').slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Try to recover filer + pre/post % from the subject line.
    // Patterns: "...acquired by <NAME> from 1.2% to 3.4%" or "<NAME> (2.1% to 4.3%)".
    const filerMatch = f.subject.match(/(?:by|of)\s+([A-Z][A-Za-z'&.\s]{3,}?)(?:\s+\(|\s+from|\s+\d)/);
    const pctMatch = f.subject.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*%?/);

    filings.push({
      stockName: f.stockName,
      nseSymbol: f.nseSymbol,
      filingDate: normalizeDate(f.filingDate),
      filerName: filerMatch ? filerMatch[1].trim() : f.subject.slice(0, 80),
      filerType: 'unknown',
      prePct: pctMatch ? parseFloat(pctMatch[1]) : null,
      postPct: pctMatch ? parseFloat(pctMatch[2]) : null,
      postShares: null, // detail-page fetch would populate; left null at feed level
      transactionNature: /acqui/i.test(f.subject) ? 'acquisition' : /dispos|sell/i.test(f.subject) ? 'disposal' : 'other',
      sourceUrl: f.sourceUrl,
    });
  }

  return filings;
}

/** Normalize assorted date strings → YYYY-MM-DD (delegates to parseDateToISO shape). */
function normalizeDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = String(s).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}
