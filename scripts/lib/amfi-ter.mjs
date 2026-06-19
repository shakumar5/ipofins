/**
 * AMFI official TER (Total Expense Ratio) — https://www.amfiindia.com/ter-of-mf-schemes
 *
 * API endpoints (documented by AMFI web app):
 *   GET /api/populate-ter-month?year=YYYY-YYYY
 *   GET /api/populate-te-rdata-revised?MF_ID=All&Month=MM-YYYY&strCat=-1&strType=-1
 */

const AMFI_BASE = 'https://www.amfiindia.com';
const TER_REFERER = `${AMFI_BASE}/ter-of-mf-schemes`;

function amfiHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    Referer: TER_REFERER,
  };
}

/** Indian financial year string for a date (April–March). */
export function financialYearForDate(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  if (m >= 4) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

async function amfiGet(path, params = {}) {
  const qs = new URLSearchParams(params);
  const url = `${AMFI_BASE}${path}?${qs}`;
  const response = await fetch(url, { headers: amfiHeaders() });
  if (!response.ok) throw new Error(`AMFI TER HTTP ${response.status} from ${path}`);
  return response.json();
}

/** List available TER months for a financial year. */
export async function fetchAMFITERMonths(year) {
  const fy = year || financialYearForDate();
  const months = await amfiGet('/api/populate-ter-month', { year: fy });
  if (!Array.isArray(months) || months.length === 0) {
    throw new Error(`No TER months available for FY ${fy}`);
  }
  return months;
}

/** Fetch all scheme TER rows for a month (official AMFI JSON). */
export async function fetchAMFITERRecords(month, year) {
  const fy = year || financialYearForDate();
  let targetMonth = month;
  if (!targetMonth) {
    const months = await fetchAMFITERMonths(fy);
    targetMonth = months[0].MonthNumber;
  }

  const data = await amfiGet('/api/populate-te-rdata-revised', {
    MF_ID: 'All',
    Month: targetMonth,
    strCat: '-1',
    strType: '-1',
  });

  const records = Array.isArray(data) ? data : data?.data ?? [];
  if (!Array.isArray(records)) {
    throw new Error('Unexpected AMFI TER response shape');
  }

  return { month: targetMonth, financialYear: fy, records };
}

/** Normalize AMFI TER scheme name for matching against funds.name. */
export function normalizeTerSchemeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\s*-\s*direct\s+plan.*$/i, '')
    .replace(/\s*-\s*regular\s+plan.*$/i, '')
    .replace(/\s*-\s*growth\s+option.*$/i, '')
    .replace(/\s*-\s*growth\s*$/i, '')
    .replace(/\s*\(direct plan\)/gi, '')
    .replace(/\s*\(regular plan\)/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTerValue(row) {
  const raw = row.TER_total ?? row.TER ?? row.ter_total ?? row.ter;
  const n = parseFloat(String(raw ?? '').replace(/%/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function isDirectPlan(name) {
  return /\bdirect\b/i.test(String(name));
}

function isRegularPlan(name) {
  return /\bregular\b/i.test(String(name));
}

/**
 * Build lookup maps from AMFI TER records.
 * Returns { directByName, regularByName, isinByTer } keyed by normalized scheme name.
 */
export function indexTerRecords(records) {
  const directByName = new Map();
  const regularByName = new Map();
  const isinByTer = new Map();

  for (const row of records) {
    const schemeName = String(row.Scheme_Name || row.scheme_name || '').trim();
    if (!schemeName) continue;

    const ter = parseTerValue(row);
    if (ter == null) continue;

    const key = normalizeTerSchemeName(schemeName);
    if (!key) continue;

    const isin = String(row.ISIN || row.isin || '').trim().toUpperCase();
    if (isin) isinByTer.set(isin, ter);

    if (isDirectPlan(schemeName)) {
      directByName.set(key, ter);
    } else if (isRegularPlan(schemeName)) {
      regularByName.set(key, ter);
    } else {
      directByName.set(key, ter);
    }
  }

  return { directByName, regularByName, isinByTer };
}

/** Match a DB fund row to TER using normalized name and plan type. */
export function terForDbFund(fund, indexes) {
  const key = normalizeTerSchemeName(fund.name);
  const isDirect = String(fund.slug || '').endsWith('-direct-plan');
  if (isDirect) return indexes.directByName.get(key) ?? null;
  return indexes.regularByName.get(key) ?? null;
}
