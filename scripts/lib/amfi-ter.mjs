/**
 * AMFI official TER (Total Expense Ratio) — https://www.amfiindia.com/ter-of-mf-schemes
 *
 * API endpoints:
 *   GET /api/populate-mf
 *   GET /api/populate-ter-month?year=YYYY-YYYY
 *   GET /api/populate-te-rdata-revised?MF_ID={id}&Month=MM-YYYY&strCat=-1&strType=-1
 */
const AMFI_BASE = 'https://www.amfiindia.com';
const TER_REFERER = `${AMFI_BASE}/ter-of-mf-schemes`;
/** Daily AMFI TER export mirrored from https://www.amfiindia.com/ter-of-mf-schemes */
const TER_CSV_URL =
  'https://raw.githubusercontent.com/captn3m0/india-mutual-fund-ter-tracker/main/data.csv';

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

export async function fetchAMFIMfList() {
  const data = await amfiGet('/api/populate-mf');
  return Array.isArray(data) ? data : [];
}

function parseTerNumber(raw) {
  const n = parseFloat(String(raw ?? '').replace(/%/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function rowTerDate(row) {
  const raw = row.TER_Date || row.ter_date;
  const t = raw ? Date.parse(String(raw)) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Latest direct/regular TER per scheme from AMFI daily rows (D_TER / R_TER). */
export function dedupeTerRecordsByScheme(records) {
  const byKey = new Map();

  for (const row of records) {
    const schemeName = String(row.Scheme_Name || row.scheme_name || '').trim();
    if (!schemeName) continue;

    const key = String(row.NSDLSchemeCode || row.nsdl_scheme_code || schemeName).trim();
    const directTer = parseTerNumber(row.D_TER ?? row.d_ter);
    const regularTer = parseTerNumber(row.R_TER ?? row.r_ter);
    const legacyTer = parseTerNumber(row.TER_total ?? row.TER ?? row.ter_total ?? row.ter);
    const when = rowTerDate(row);

    const prev = byKey.get(key);
    if (!prev || when >= prev.when) {
      byKey.set(key, {
        schemeName,
        when,
        directTer: directTer ?? legacyTer ?? prev?.directTer ?? null,
        regularTer: regularTer ?? prev?.regularTer ?? null,
      });
    } else if (prev) {
      if (prev.directTer == null && directTer != null) prev.directTer = directTer;
      if (prev.regularTer == null && regularTer != null) prev.regularTer = regularTer;
      if (prev.directTer == null && legacyTer != null) prev.directTer = legacyTer;
    }
  }

  return [...byKey.values()].map(({ schemeName, directTer, regularTer }) => ({
    Scheme_Name: schemeName,
    D_TER: directTer,
    R_TER: regularTer,
  }));
}

/** Fetch TER rows for one AMC/month. */
export async function fetchAMFITERRecordsForAmc(mfId, month, year) {
  const fy = year || financialYearForDate();
  const data = await amfiGet('/api/populate-te-rdata-revised', {
    MF_ID: String(mfId),
    Month: month,
    strCat: '-1',
    strType: '-1',
  });
  const records = Array.isArray(data) ? data : data?.data ?? [];
  if (!Array.isArray(records)) {
    throw new Error('Unexpected AMFI TER response shape');
  }
  return { month, financialYear: fy, records };
}

/** Fetch all scheme TER rows for a month (loops AMC list — AMFI caps rows per AMC). */
export async function fetchAMFITERRecords(month, year) {
  const fy = year || financialYearForDate();
  let targetMonth = month;
  if (!targetMonth) {
    const months = await fetchAMFITERMonths(fy);
    targetMonth = months[0].MonthNumber;
  }

  const mfs = await fetchAMFIMfList();
  const merged = [];
  for (const mf of mfs) {
    const mfId = mf.mfId ?? mf.MF_ID;
    if (!mfId) continue;
    try {
      const { records } = await fetchAMFITERRecordsForAmc(mfId, targetMonth, fy);
      merged.push(...records);
    } catch {
      // skip AMC on transient failure
    }
  }

  return { month: targetMonth, financialYear: fy, records: dedupeTerRecordsByScheme(merged) };
}

/** Parse one CSV line with quoted fields (AMFI TER export). */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Official AMFI TER CSV (one row per scheme; direct + regular totals).
 * Used when populate-te-rdata-revised returns incomplete/duplicate rows.
 */
export function parseTerCsv(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const records = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const schemeName = String(cols[0] || '').trim();
    if (!schemeName) continue;
    const regularTer = parseTerNumber(cols[5]);
    const directTer = parseTerNumber(cols[10]);
    if (directTer == null && regularTer == null) continue;
    records.push({
      Scheme_Name: schemeName,
      D_TER: directTer,
      R_TER: regularTer,
    });
  }
  return records;
}

export async function fetchTerFromOfficialCsv() {
  const response = await fetch(TER_CSV_URL, { headers: amfiHeaders() });
  if (!response.ok) throw new Error(`TER CSV HTTP ${response.status}`);
  const text = await response.text();
  return parseTerCsv(text);
}

/** Merge API rows with CSV fallback (CSV wins on duplicate scheme keys). */
export async function fetchAMFITERRecordsWithFallback(month, year) {
  const fy = year || financialYearForDate();
  let apiRecords = [];
  let monthLabel = month;

  try {
    const api = await fetchAMFITERRecords(month, fy);
    apiRecords = api.records;
    monthLabel = api.month;
  } catch {
    // API month list can fail early in a new FY
  }

  const csvRecords = await fetchTerFromOfficialCsv();
  const apiDeduped = dedupeTerRecordsByScheme(apiRecords);
  const csvDeduped = dedupeTerRecordsByScheme(csvRecords);
  const byName = new Map();
  for (const row of apiDeduped) {
    const key = normalizeTerSchemeName(row.Scheme_Name);
    if (key) byName.set(key, row);
  }
  for (const row of csvDeduped) {
    const key = normalizeTerSchemeName(row.Scheme_Name);
    if (key) byName.set(key, row);
  }
  const merged = [...byName.values()];
  return {
    month: monthLabel || 'csv',
    financialYear: fy,
    records: merged,
    apiRecords: apiDeduped.length,
    csvRecords: csvDeduped.length,
  };
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

    const key = normalizeTerSchemeName(schemeName);
    if (!key) continue;

    const directTer = parseTerNumber(row.D_TER ?? row.d_ter);
    const regularTer = parseTerNumber(row.R_TER ?? row.r_ter);
    const legacyTer = parseTerNumber(row.TER_total ?? row.TER ?? row.ter_total ?? row.ter);

    const isin = String(row.ISIN || row.isin || '').trim().toUpperCase();
    if (isin && directTer != null) isinByTer.set(isin, directTer);

    if (isDirectPlan(schemeName)) {
      if (directTer != null) directByName.set(key, directTer);
      else if (legacyTer != null) directByName.set(key, legacyTer);
    } else if (isRegularPlan(schemeName)) {
      if (regularTer != null) regularByName.set(key, regularTer);
      else if (legacyTer != null) regularByName.set(key, legacyTer);
    } else {
      if (directTer != null) directByName.set(key, directTer);
      else if (legacyTer != null) directByName.set(key, legacyTer);
      if (regularTer != null) regularByName.set(key, regularTer);
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

/** Regular-plan TER for pairing with a direct-plan fund row. */
export function regularTerForDbFund(fund, indexes) {
  const key = normalizeTerSchemeName(fund.name);
  return indexes.regularByName.get(key) ?? null;
}
