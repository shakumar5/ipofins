/**
 * Super Investor + SAST data sources — BSE (primary) + NSE (Puppeteer fallback).
 *
 * NSE and BSE expose NO documented public API for Shareholding Pattern or SAST
 * filings. The endpoints used here are undocumented/hidden and may change without
 * notice. To absorb that fragility this module is layered:
 *
 *   1. NSE XBRL      — corporate-share-holdings-master API + XBRL parse (fast, complete).
 *   2. BSE HTML      — plain fetch + regex HTML parse (fallback).
 *   3. NSE Puppeteer — legacy table scrape (last resort).
 *   3. JSON override (si-overrides.mjs) — hand-curated rows when both fail.
 *   4. Last-known-good — quality gate in the pipeline aborts but leaves the prior
 *      quarter's data intact, so the site keeps serving.
 *
 * All fetchers return normalized row shapes consumed directly by the pipeline
 * scripts. HTTP layer mirrors authorized-sources.mjs (Chrome UA, sleep cadence).
 */

import { existsSync } from 'fs';
import { sleep } from './ipo-utils.mjs';
import { parseShareholdingXbrl } from './shp-xbrl-parser.mjs';
import { nseQuarterEndLabel } from './si-quarters.mjs';

// ─── HTTP layer (mirrors authorized-sources.mjs) ────────────

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** ms between per-stock requests (matches the existing Zerodha cadence). */
let fetchThrottleMs = 800;

/** Skip Puppeteer fallback (parallel backfill — one browser cannot serve 80 workers). */
let skipPuppeteerFallback = false;

/** Per-request HTTP timeout; 0 = no limit. */
let fetchTimeoutMs = 20_000;

/** Reduce/remove throttle when running parallel fetches (pipeline sets this). */
export function setSiFetchThrottle(ms) {
  fetchThrottleMs = Math.max(0, ms);
}

/** Tune fetch behaviour for bulk backfill vs single-quarter runs. */
export function setSiFetchOptions({ throttle, skipPuppeteer, timeoutMs } = {}) {
  if (throttle !== undefined) fetchThrottleMs = Math.max(0, throttle);
  if (skipPuppeteer !== undefined) skipPuppeteerFallback = skipPuppeteer;
  if (timeoutMs !== undefined) fetchTimeoutMs = Math.max(0, timeoutMs);
}

async function fetchTimed(url, init = {}) {
  const opts = { ...init, headers: { ...HEADERS, ...init.headers } };
  if (fetchTimeoutMs > 0) {
    opts.signal = AbortSignal.timeout(fetchTimeoutMs);
  }
  return fetch(url, opts);
}

async function fetchText(url, extraHeaders = {}) {
  const response = await fetchTimed(url, { headers: extraHeaders });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

async function fetchBuffer(url, extraHeaders = {}) {
  const response = await fetchTimed(url, { headers: extraHeaders });
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

  const direct = String(stock.bse_code || '').trim();
  if (direct) return direct;

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

// ─── NSE XBRL Shareholding Pattern (primary) ─────────────────

function filingMatchesQuarter(filing, quarter) {
  const label = nseQuarterEndLabel(quarter);
  if (!label) return false;
  return String(filing?.date || '').trim().toUpperCase() === label;
}

/**
 * Fetch SHP via NSE filing index + XBRL download. No Puppeteer required.
 */
export async function fetchNSEShareholdingViaXbrl(stock, quarter) {
  if (!stock?.nse_symbol) return [];

  const api = `https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(stock.nse_symbol)}`;
  let filings;
  try {
    const res = await fetchTimed(api, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    filings = await res.json();
  } catch {
    return [];
  }
  if (!Array.isArray(filings) || !filings.length) return [];

  const match = filings.find((f) => filingMatchesQuarter(f, quarter) && f.xbrl) || null;
  if (!match?.xbrl) return [];

  try {
    const xbrlRes = await fetchTimed(match.xbrl);
    if (!xbrlRes.ok) return [];
    const xml = await xbrlRes.text();
    const rows = parseShareholdingXbrl(xml, match.xbrl);
    if (rows.length && fetchThrottleMs) await sleep(fetchThrottleMs);
    return rows;
  } catch {
    return [];
  }
}

// ─── BSE Shareholding Pattern (JSON API — BSE-only listings) ─

const BSE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Map pipeline quarter start → BSE declaration label e.g. "March 2026". */
function bseQuarterEndLabel(quarter) {
  const d = new Date(quarter);
  if (Number.isNaN(d.getTime())) return '';
  const endMonthIdx = d.getMonth() + 2;
  const year = d.getFullYear() + (endMonthIdx > 11 ? 1 : 0);
  return `${BSE_MONTHS[endMonthIdx % 12]} ${year}`;
}

function holderTypeFromBseRow(row) {
  const blob = `${row.FLd_ShareholderType || row.Fld_ShareholderType || ''} ${row.Fld_SubCategory || ''} ${row.Fld_Level || ''}`.toLowerCase();
  if (/promoter/.test(blob)) return 'promoter';
  if (/foreign|fii|fpi/.test(blob)) return 'fii';
  if (/mutual|insurance|bank|institution|dii|venture|alternate investment/.test(blob)) return 'dii';
  if (/individual|huf|resident/.test(blob)) return 'individual';
  return 'public';
}

function parseBseShpNgJson(json, sourceUrl) {
  const rows = [];
  for (const table of Object.values(json || {})) {
    if (!Array.isArray(table)) continue;
    for (const row of table) {
      const name = String(row.Fld_ShareHolderName || '').trim();
      if (!name) continue;
      const pct = parseFloat(row.Fld_TotalPercentageOf_A_B_C2);
      if (!Number.isFinite(pct) || pct <= 0) continue;
      const shares = parseInt(row.Fld_TotalNoOfShares, 10);
      rows.push({
        holderName: name,
        holderType: holderTypeFromBseRow(row),
        shares: Number.isFinite(shares) ? shares : null,
        pctOfCompany: pct,
        sourceUrl,
      });
    }
  }
  return rows;
}

async function fetchBseShpNgEndpoint(endpoint, scripCode, qtrCode) {
  const qtr = qtrCode.includes('.') ? qtrCode : `${qtrCode}.00`;
  const url = `https://api.bseindia.com/BseIndiaAPI/api/${endpoint}/w?SCRIPCODE=${encodeURIComponent(scripCode)}&QtrCode=${encodeURIComponent(qtr)}`;
  const res = await fetchTimed(url, { headers: { Accept: 'application/json', Referer: 'https://www.bseindia.com/' } });
  if (!res.ok) return [];
  const json = await res.json();
  return parseBseShpNgJson(json, url);
}

/**
 * Fetch SHP for BSE-only (or BSE fallback) listings via Corp_shp*_ng JSON APIs.
 * Requires a BSE scrip code on the stock row (stocks.bse_code).
 */
export async function fetchBSEShareholdingViaApi(stock, quarter) {
  const scripCode = await resolveBseCode(stock);
  if (!scripCode) return [];

  let declarations = [];
  try {
    const res = await fetchTimed(
      `https://api.bseindia.com/BseIndiaAPI/api/shpDecleraction/w?scripcode=${encodeURIComponent(scripCode)}&qtrid=`,
      { headers: { Accept: 'application/json', Referer: 'https://www.bseindia.com/' } },
    );
    if (res.ok) declarations = await res.json();
  } catch {
    return [];
  }
  if (!Array.isArray(declarations) || !declarations.length) return [];

  const targetLabel = bseQuarterEndLabel(quarter).toLowerCase();
  const decl =
    declarations.find((d) => String(d.qtr_name || '').toLowerCase() === targetLabel)
    || declarations[0];
  const qtrCode = String(decl.qtr_id || '').trim();
  if (!qtrCode) return [];

  const endpoints = ['Corp_shpPromoterNGroup_ng', 'Corp_shpSec_SHPPubShold_ng'];
  const rows = [];
  for (const ep of endpoints) {
    try {
      rows.push(...(await fetchBseShpNgEndpoint(ep, scripCode, qtrCode)));
      if (fetchThrottleMs) await sleep(Math.ceil(fetchThrottleMs / 2));
    } catch {
      // try next section
    }
  }
  if (rows.length && fetchThrottleMs) await sleep(fetchThrottleMs);
  return rows;
}

// ─── BSE Shareholding Pattern (legacy HTML) ─────────────────

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
    if (rows.length && fetchThrottleMs) await sleep(fetchThrottleMs);
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
      stock.nse_symbol,
    )}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('table td', { timeout: 20000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 8000));

    const rows = await page.evaluate((sym) => {
      const out = [];
      const parseNum = (s) => {
        const n = parseFloat(String(s || '').replace(/[%,\s]/g, ''));
        return Number.isFinite(n) ? n : null;
      };

      for (const tr of document.querySelectorAll('table tr')) {
        const cells = [...tr.querySelectorAll('td')].map((c) =>
          c.textContent.replace(/\s+/g, ' ').trim(),
        );
        if (cells.length < 8) continue;

        const category = cells[0] || '';
        const name = cells[1] || '';
        if (!name || /category of shareholder|\(II\)|^total$/i.test(name)) continue;

        const shares = parseNum(cells[6]) ?? parseNum(cells[3]);
        const pct = parseNum(cells[7]) ?? parseNum(cells[8]);
        if (pct == null || pct <= 0) continue;

        let holderType = 'unknown';
        const cat = category.toLowerCase();
        if (/promoter/.test(cat) || /promoter/.test(name.toLowerCase())) holderType = 'promoter';
        else if (/foreign|fii|fpi/.test(cat)) holderType = 'fii';
        else if (/mutual|insurance|dii|bank|financial instit/.test(cat)) holderType = 'dii';
        else if (/individual|huf|director|key managerial/.test(cat)) holderType = 'individual';
        else if (/public|body corporate|corporate|llp|trust|others/.test(cat)) holderType = 'public';

        out.push({
          holderName: name,
          holderType,
          shares: shares != null && shares >= 100 ? Math.round(shares) : null,
          pctOfCompany: pct,
          sourceUrl: `https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${sym}`,
        });
      }
      return out;
    }, stock.nse_symbol);

    if (fetchThrottleMs) await sleep(fetchThrottleMs);
    return rows;
  } catch {
    return [];
  } finally {
    await page.close();
  }
}

// ─── Orchestrator: Shareholding Pattern ────────────────────

const TASK_TIMEOUT_MS = 30_000;

/**
 * Fetch shareholding pattern for one stock. NSE XBRL first, then BSE API/HTML.
 * Puppeteer is last resort (disabled during parallel backfill).
 */
async function fetchShareholdingPatternInner(stock, quarter) {
  if (stock.nse_symbol) {
    try {
      const xbrlRows = await fetchNSEShareholdingViaXbrl(stock, quarter);
      const valid = xbrlRows.filter((r) => r.pctOfCompany != null && r.pctOfCompany > 0);
      if (valid.length > 0) return valid;
    } catch {
      // fall through
    }
  }

  try {
    const bseApiRows = await fetchBSEShareholdingViaApi(stock, quarter);
    const validApi = bseApiRows.filter((r) => r.pctOfCompany != null && r.pctOfCompany > 0);
    if (validApi.length > 0) return validApi;
  } catch {
    // fall through
  }

  try {
    const bseRows = await fetchBSEShareholdingPattern(stock, quarter);
    const valid = bseRows.filter((r) => r.pctOfCompany != null && r.pctOfCompany > 0);
    if (valid.length > 0) return valid;
  } catch {
    // fall through
  }

  if (stock.nse_symbol && !skipPuppeteerFallback) {
    try {
      return await fetchNSEShareholdingPatternPuppeteer(stock, quarter);
    } catch {
      return [];
    }
  }

  return [];
}

export async function fetchShareholdingPattern(stock, quarter) {
  const budget = fetchTimeoutMs > 0 ? Math.max(fetchTimeoutMs + 10_000, TASK_TIMEOUT_MS) : TASK_TIMEOUT_MS;
  let timer;
  try {
    return await Promise.race([
      fetchShareholdingPatternInner(stock, quarter),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve([]), budget);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
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
