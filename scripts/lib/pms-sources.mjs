/**
 * PMS provider holdings fetchers — one per provider (6 providers).
 *
 * Each PMS publishes strategy-level holdings on its own site in a DIFFERENT
 * format (HTML table, PDF factsheet, Excel). There is no SEBI-mandated public
 * holdings feed for PMS — providers disclose voluntarily within ~15 days of
 * quarter-end. Because each site changes independently, every fetcher is built
 * defensively:
 *
 *   try HTML table → fallback to PDF (pdf-parse) → return [] on failure.
 *
 * Coverage is incremental. Each fetcher carries a verification comment so it's
 * clear which providers' formats are field-tested vs best-effort. When a
 * provider's format breaks, drop a `pms-{quarter}.json` override
 * (see si-overrides.mjs / DATA_PIPELINE.md).
 *
 * Row shape returned by every fetcher:
 *   { stockName, nseSymbol, shares, pctOfCompany, sourceUrl }
 */

import { sleep, parseDateToISO } from './ipo-utils.mjs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/pdf,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

export async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// ─── Shared HTML table parser ──────────────────────────────

/**
 * Extract holdings rows from an HTML table.
 * Looks for rows whose cells contain a recognizable percentage (0–100) or a
 * large share count. Returns normalized rows. Provider parsers pick the right
 * table by passing a `tableSelector` predicate on the surrounding text.
 */
export function parseHoldingsTable(html, { tableHint = /portfolio|holdings|top\s+holdings|stocks/i } = {}) {
  const rows = [];
  // Split into tables; keep the one whose preceding text matches the hint.
  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  let bestTable = null;
  while ((tableMatch = tablePattern.exec(html)) !== null) {
    const start = tableMatch.index;
    const preceding = html.slice(Math.max(0, start - 400), start);
    if (tableHint.test(preceding) || tableHint.test(tableMatch[1])) {
      bestTable = tableMatch[1];
      break; // first matching table wins
    }
    if (!bestTable) bestTable = tableMatch[1];
  }
  if (!bestTable) return rows;

  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trPattern.exec(bestTable)) !== null) {
    const cells = [];
    const tdPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;
    while ((tdMatch = tdPattern.exec(trMatch)) !== null) {
      cells.push(
        tdMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;|&nbsp;|&#\d+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
    }
    if (cells.length < 2) continue;

    // First non-numeric cell is the stock name; collect numbers afterwards.
    const nameIdx = cells.findIndex((c) => /[A-Za-z]/.test(c) && !/^(qty|shares|%|weight|sector|industry)$/i.test(c));
    if (nameIdx < 0) continue;
    const name = cells[nameIdx];
    // Skip obvious headers / totals.
    if (/^(total|grand\s*total|cash|sector|industry)$/i.test(name)) continue;

    const nums = cells.slice(nameIdx + 1).map((c) => parseFloat(c.replace(/[%,\s]/g, ''))).filter((n) => !Number.isNaN(n));
    // Heuristic: a value < 100 is a percentage; a large integer is a share count.
    let pct = nums.find((n) => n > 0 && n < 100) ?? null;
    let shares = nums.find((n) => n >= 1000 && Number.isInteger(n)) ?? null;
    if (pct === null && shares === null) continue;

    rows.push({ stockName: name, nseSymbol: null, shares, pctOfCompany: pct });
  }
  return rows;
}

// ─── Shared PDF parser (pdf-parse) ─────────────────────────

let pdfParseFn = null;
export async function parsePdf(buffer) {
  if (!pdfParseFn) {
    try {
      const mod = await import('pdf-parse');
      pdfParseFn = mod.default || mod;
    } catch {
      pdfParseFn = null;
      return [];
    }
  }
  if (!pdfParseFn) return [];
  try {
    const data = await pdfParseFn(buffer);
    return extractHoldingsFromPdfText(data.text);
  } catch {
    return [];
  }
}

/**
 * Extract holdings from PDF body text. Looks for "Stock .... shares ... %" lines.
 * Tolerant of columnar layouts that collapse to spaces in text extraction.
 */
function extractHoldingsFromPdfText(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    // A line with a name, then 1–3 numbers, one of which may be a percentage.
    const m = line.match(/([A-Z][A-Za-z0-9&.'\- ]{2,40}?)\s+([\d,]+(?:\.\d+)?)\s+([\d,.]+%?)/);
    if (!m) continue;
    const name = m[1].trim();
    if (/^(total|sector|industry|cash|page|as\s+on|date)/i.test(name)) continue;
    const a = parseFloat(m[2].replace(/,/g, ''));
    const bRaw = m[3].replace(/%/g, '');
    const b = parseFloat(bRaw);
    let shares = null;
    let pct = null;
    if (a >= 1000 && Number.isInteger(a)) shares = a;
    if (b > 0 && b < 100) pct = b;
    if (shares === null && a > 0 && a < 100) pct = a;
    if (pct === null && shares === null) continue;
    rows.push({ stockName: name, nseSymbol: null, shares, pctOfCompany: pct });
  }
  return rows;
}

// ─── Per-provider fetchers ─────────────────────────────────
//
// Each follows the same shape: (strategy, quarter) → holdings[].
// `strategy` is a strategy row (name/slug) from tracked_entities; `quarter` is
// YYYY-MM-DD. Returns [] on any failure so the pipeline keeps going.
//
// VERIFICATION STATUS is noted per provider. "Unverified" means the URL/format
// is the best-known public disclosure page but hasn't been field-tested against
// a live fetch — use --dry-run + an override file to validate a quarter.

/** Marcellus — HTML factsheet pages per strategy. (STATUS: unverified) */
async function fetchMarcellusHoldings(strategy, quarter) {
  const slugMap = {
    'Consistent Compounders': 'consistent-compounders',
    'Little Champs': 'little-champs',
    'Kings of Capital': 'kings-of-capital',
    'Rising Giants': 'rising-giants',
  };
  const s = slugMap[strategy?.strategy_name] || '';
  if (!s) return [];
  const url = `https://marcellus.in/strategies/${s}/`;
  try {
    const html = await fetchText(url);
    return parseHoldingsTable(html).map((r) => ({ ...r, sourceUrl: url }));
  } catch {
    return [];
  }
}

/** ASK — disclosure page; HTML or PDF factsheet. (STATUS: unverified) */
async function fetchASKHoldings(strategy, quarter) {
  const url = 'https://www.askgroup.in/our-strategies/';
  try {
    const html = await fetchText(url);
    const htmlRows = parseHoldingsTable(html);
    if (htmlRows.length) return htmlRows.map((r) => ({ ...r, sourceUrl: url }));

    // Fallback: look for a linked PDF factsheet.
    const pdfLink = html.match(/href="([^"]+\.pdf[^"]*)"/i);
    if (pdfLink) {
      const pdfUrl = pdfLink[1].startsWith('http') ? pdfLink[1] : new URL(pdfLink[1], url).href;
      const buf = await fetchBuffer(pdfUrl);
      return (await parsePdf(buf)).map((r) => ({ ...r, sourceUrl: pdfUrl }));
    }
    return [];
  } catch {
    return [];
  }
}

/** Motilal Oswal — PMS disclosure page, HTML table. (STATUS: unverified) */
async function fetchMotilalOswalHoldings(strategy, quarter) {
  const url = 'https://www.motilaloswalmf.com/pms/portfolio';
  try {
    const html = await fetchText(url);
    return parseHoldingsTable(html).map((r) => ({ ...r, sourceUrl: url }));
  } catch {
    return [];
  }
}

/** Helios Capital — factsheet, usually PDF. (STATUS: unverified) */
async function fetchHeliosHoldings(strategy, quarter) {
  const url = 'https://www.helioscapital.in/portfolio';
  try {
    const html = await fetchText(url);
    const htmlRows = parseHoldingsTable(html);
    if (htmlRows.length) return htmlRows.map((r) => ({ ...r, sourceUrl: url }));

    const pdfLink = html.match(/href="([^"]+\.pdf[^"]*)"/i);
    if (pdfLink) {
      const pdfUrl = pdfLink[1].startsWith('http') ? pdfLink[1] : new URL(pdfLink[1], url).href;
      const buf = await fetchBuffer(pdfUrl);
      return (await parsePdf(buf)).map((r) => ({ ...r, sourceUrl: pdfUrl }));
    }
    return [];
  } catch {
    return [];
  }
}

/** Equity Intelligence (Porinju) — HTML or PDF. (STATUS: unverified) */
async function fetchEquityIntelligenceHoldings(strategy, quarter) {
  const url = 'https://www.eqintelligence.com/portfolio/';
  try {
    const html = await fetchText(url);
    const htmlRows = parseHoldingsTable(html);
    if (htmlRows.length) return htmlRows.map((r) => ({ ...r, sourceUrl: url }));

    const pdfLink = html.match(/href="([^"]+\.pdf[^"]*)"/i);
    if (pdfLink) {
      const pdfUrl = pdfLink[1].startsWith('http') ? pdfLink[1] : new URL(pdfLink[1], url).href;
      const buf = await fetchBuffer(pdfUrl);
      return (await parsePdf(buf)).map((r) => ({ ...r, sourceUrl: pdfUrl }));
    }
    return [];
  } catch {
    return [];
  }
}

/** WhiteOak Capital — HTML disclosure page. (STATUS: unverified) */
async function fetchWhiteOakHoldings(strategy, quarter) {
  const url = 'https://www.whiteoaksmf.com/pms/portfolio';
  try {
    const html = await fetchText(url);
    return parseHoldingsTable(html).map((r) => ({ ...r, sourceUrl: url }));
  } catch {
    return [];
  }
}

// ─── Dispatcher ────────────────────────────────────────────

const FETCHERS = {
  // Keyed by tracked_entity slug — matches seed-super-investors.mjs slugify().
  'marcellus-investment-managers': fetchMarcellusHoldings,
  'ask-investment-managers': fetchASKHoldings,
  'motilal-oswal-asset-management': fetchMotilalOswalHoldings,
  'helios-capital': fetchHeliosHoldings,
  'equity-intelligence-india': fetchEquityIntelligenceHoldings,
  'whiteoak-capital-management': fetchWhiteOakHoldings,
};

/**
 * Fetch PMS holdings for a provider + strategy.
 *
 * @param {Object} provider — tracked_entities row (uses .slug to dispatch)
 * @param {Object} strategy — strategy row (name/slug passed to the fetcher)
 * @param {string} quarter
 * @returns {Array<{ stockName, nseSymbol, shares, pctOfCompany, sourceUrl }>}
 */
export async function fetchPMSHoldings(provider, strategy, quarter) {
  const fetcher = FETCHERS[provider?.slug];
  if (!fetcher) {
    console.log(`    ⚠️ No PMS fetcher registered for "${provider?.slug}" — skipping`);
    return [];
  }
  try {
    const rows = await fetcher(strategy, quarter);
    await sleep(800); // gentle cadence between providers
    return rows;
  } catch (err) {
    console.log(`    ⚠️ ${provider.slug} fetcher failed: ${err.message}`);
    return [];
  }
}
