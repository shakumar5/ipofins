/**
 * AIF / SIF holdings fetchers.
 *
 * PRIMARY DATA PATH for AIFs is the SAST cross-reference in pipeline 07 itself
 * (lines that promote preliminary SAST filings to confirmed entity_holdings).
 * Most AIFs (Cat II/III) holding >2% of a company MUST file SAST within 2
 * trading days — so SAST is where their positions reliably surface.
 *
 * This module is the SECONDARY path: voluntary provider disclosures for funds
 * that publish factsheets/portfolios publicly. Few do, and those that do change
 * formats often. Each fetcher is therefore defensive (HTML → PDF → []), and
 * quarters where a fund doesn't disclose are covered by:
 *   1. The SAST cross-reference (primary), and
 *   2. JSON overrides in src/data/si-overrides/altfunds-{quarter}.json.
 *
 * Row shape: { stockName, nseSymbol, shares, pctOfCompany, sourceUrl }
 *
 * VERIFICATION STATUS noted per fund. "Unverified" = best-known public page;
 * validate with --dry-run + override before relying on it.
 */

import { sleep } from './ipo-utils.mjs';
import { parseHoldingsTable, parsePdf, fetchText, fetchBuffer } from './pms-sources.mjs';

// ─── Per-fund fetchers ─────────────────────────────────────

/** Westbridge — occasional public factsheet. (STATUS: unverified) */
async function fetchWestbridgeHoldings(entity, quarter) {
  const url = 'https://www.westbridgecap.com/portfolio';
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

/** Nalanda Capital — limited public disclosure. (STATUS: unverified) */
async function fetchNalandaHoldings(entity, quarter) {
  const url = 'https://www.nalanda-india.com/portfolio';
  try {
    const html = await fetchText(url);
    return parseHoldingsTable(html).map((r) => ({ ...r, sourceUrl: url }));
  } catch {
    return [];
  }
}

/** ChrysCapital — primarily PE; relies on SAST. (STATUS: no public holdings page) */
async function fetchChrysCapHoldings(entity, quarter) {
  return []; // ChrysCap does not publish a public equity holdings page — SAST-only.
}

/** Abakkus (Sunil Singhania) — occasional factsheet. (STATUS: unverified) */
async function fetchAbakkusHoldings(entity, quarter) {
  const url = 'https://www.abakkus.co/portfolio';
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

/** Malabar Investments — Singapore-based; relies on SAST. (STATUS: unverified) */
async function fetchMalabarHoldings(entity, quarter) {
  const url = 'https://www.malabarinvestments.com/portfolio';
  try {
    const html = await fetchText(url);
    return parseHoldingsTable(html).map((r) => ({ ...r, sourceUrl: url }));
  } catch {
    return [];
  }
}

/** Stealview — no website on file; SAST-only. */
async function fetchStealviewHoldings(entity, quarter) {
  return [];
}

/** Schweitzer — no website on file; SAST-only. */
async function fetchSchweitzerHoldings(entity, quarter) {
  return [];
}

/** UTI SIF — AMC factsheet. (STATUS: unverified) */
async function fetchUTISIFHoldings(entity, quarter) {
  const url = 'https://www.utimf.com/portfolio';
  try {
    const html = await fetchText(url);
    return parseHoldingsTable(html, { tableHint: /sif|specialized|multi\s*cap/i }).map((r) => ({
      ...r,
      sourceUrl: url,
    }));
  } catch {
    return [];
  }
}

/** HDFC SIF — AMC factsheet. (STATUS: unverified) */
async function fetchHDFCSIFHoldings(entity, quarter) {
  const url = 'https://www.hdfcfund.com/portfolio';
  try {
    const html = await fetchText(url);
    return parseHoldingsTable(html, { tableHint: /sif|specialized|innovation/i }).map((r) => ({
      ...r,
      sourceUrl: url,
    }));
  } catch {
    return [];
  }
}

// ─── Dispatcher ────────────────────────────────────────────

const FETCHERS = {
  // Keyed by tracked_entity slug — matches seed-super-investors.mjs slugify().
  'westbridge-capital': fetchWestbridgeHoldings,
  'nalanda-capital': fetchNalandaHoldings,
  'chryscapital': fetchChrysCapHoldings,
  'abakkus-asset-manager': fetchAbakkusHoldings,
  'malabar-investments': fetchMalabarHoldings,
  'stealview-india-growth-fund': fetchStealviewHoldings,
  'schweitzer-international': fetchSchweitzerHoldings,
  'uti-amc-sif-strategies': fetchUTISIFHoldings,
  'hdfc-amc-sif-strategies': fetchHDFCSIFHoldings,
};

/**
 * Fetch voluntary disclosures for one AIF/SIF entity.
 * Returns [] when the fund has no public page (SAST cross-reference covers it).
 *
 * @param {Object} entity — tracked_entities row (uses .slug to dispatch)
 * @param {string} quarter
 * @returns {Array<{ stockName, nseSymbol, shares, pctOfCompany, sourceUrl }>}
 */
export async function fetchAIFDisclosures(entity, quarter) {
  const fetcher = FETCHERS[entity?.slug];
  if (!fetcher) {
    // Many AIFs have no public page — SAST cross-reference is their data path.
    return [];
  }
  try {
    const rows = await fetcher(entity, quarter);
    await sleep(800);
    return rows;
  } catch (err) {
    console.log(`    ⚠️ ${entity.slug} disclosure fetch failed: ${err.message}`);
    return [];
  }
}

// ─── SEBI AIF database (validation, not holdings) ──────────

/**
 * Fetch the SEBI registered-AIF list. Contains registration metadata only
 * (name, category, manager) — NO holdings. Useful to validate that a tracked
 * entity is still a registered AIF and to detect newly registered funds.
 *
 * Returns array of { name, registrationId, category, manager }.
 * (STATUS: unverified endpoint — SEBI reshuffles its listing pages often.)
 */
export async function fetchSEBIAIFRegistry() {
  const url = 'https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&recognisedFpiType=16';
  try {
    const html = await fetchText(url);
    const funds = [];
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const cells = [];
      const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(match[1])) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      }
      if (cells.length >= 3 && /INAIF/i.test(cells.join(' '))) {
        funds.push({
          name: cells[0],
          registrationId: cells.find((c) => /INAIF/i.test(c)) || null,
          category: cells.find((c) => /Cat/i.test(c)) || null,
          manager: cells[1] || null,
        });
      }
    }
    return funds;
  } catch {
    return [];
  }
}
