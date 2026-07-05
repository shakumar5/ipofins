/**
 * Unofficial IPO GMP sources (grey market — not SEBI/NSE/BSE regulated).
 *
 * Primary: InvestorGain JSON API (same data as their live GMP report page).
 * Label clearly in DB source_url for audit.
 */

const INVESTOR_GAIN_API = 'https://webnodejs.investorgain.com/cloud/v2';
const INVESTOR_GAIN_PAGE = 'https://www.investorgain.com/report/live-ipo-gmp/331/';
export const GMP_SOURCE_INVESTOR_GAIN = 'investorgain.com (unofficial grey market)';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.investorgain.com/',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Indian financial year string e.g. 2026-27 (April–March). */
export function currentIndianFinancialYear(date = new Date()) {
  const y = date.getFullYear();
  const fyStart = date.getMonth() >= 3 ? y : y - 1;
  const fyEnd = String((fyStart + 1) % 100).padStart(2, '0');
  return { calYear: y, fy: `${fyStart}-${fyEnd}` };
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse ₹ amount from InvestorGain GMP HTML cell (supports negative GMP). */
export function parseGmpFromInvestorgainCell(gmpHtml) {
  if (!gmpHtml || String(gmpHtml).includes('--')) return null;
  const text = String(gmpHtml)
    .replace(/&#8377;/g, '₹')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const match = text.match(/₹\s*(-?[\d.]+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

/**
 * @returns {Promise<Array<{ name: string, gmp: number, sourceUrl: string }>>}
 */
export async function fetchInvestorgainGMP() {
  console.log('\n  📈 [InvestorGain] Fetching live IPO GMP (unofficial)...');
  const { calYear, fy } = currentIndianFinancialYear();
  const reportUrl = `${INVESTOR_GAIN_API}/report/data-read/331/1/7/${calYear}/${fy}/0/all?search=`;

  const data = await fetchJson(reportUrl);
  const rows = Array.isArray(data.reportTableData) ? data.reportTableData : [];

  const byName = new Map();
  for (const row of rows) {
    const name = (row['~ipo_name'] || stripHtml(row.Name)).trim();
    const gmp = parseGmpFromInvestorgainCell(row.GMP);
    if (!name || gmp == null) continue;
    byName.set(name.toLowerCase(), { name, gmp, sourceUrl: INVESTOR_GAIN_PAGE });
  }

  // Compact index — fills any active GMP missing from the main report page.
  try {
    const index = await fetchJson(`${INVESTOR_GAIN_API}/index/gmp-price-read`);
    for (const item of index.gmpList ?? []) {
      const name = String(item.company_short_name || '').trim();
      const gmp = item.gmp != null ? Number(item.gmp) : null;
      if (!name || gmp == null || !Number.isFinite(gmp)) continue;
      const key = name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, { name, gmp, sourceUrl: INVESTOR_GAIN_PAGE });
      }
    }
  } catch (err) {
    console.warn(`    ⚠️ InvestorGain GMP index fallback skipped: ${err.message}`);
  }

  const results = [...byName.values()];
  console.log(`    ✅ Parsed ${results.length} IPO GMP values`);
  return results;
}
