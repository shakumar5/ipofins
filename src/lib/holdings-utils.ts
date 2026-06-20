/** Shared helpers for holdings / smart-money analytics. */

export const TRACKER_CATEGORIES = [
  'All',
  'Large Cap',
  'Large & Mid Cap',
  'Mid Cap',
  'Multi Cap',
  'Flexi Cap',
  'Small Cap',
  'Others',
] as const;

/** Equity fund categories in the curated DB universe (holdings-gated). */
export const LISTABLE_EQUITY_CATEGORIES = [
  'Large Cap',
  'Large & Mid Cap',
  'Mid Cap',
  'Multi Cap',
  'Flexi Cap',
  'Small Cap',
  'Value',
  'Focused',
  'Sectoral/Thematic',
  'Sectoral',
  'Contra',
] as const;

/** Equity fund categories included in smart-money analytics. */
export const EQUITY_FUND_CATEGORIES = new Set<string>([
  ...LISTABLE_EQUITY_CATEGORIES,
]);

const CAP_CATEGORIES = new Set([
  'Large Cap',
  'Large & Mid Cap',
  'Mid Cap',
  'Multi Cap',
  'Flexi Cap',
  'Small Cap',
]);

export function mapFundCategory(category: string): string {
  return CAP_CATEGORIES.has(category) ? category : 'Others';
}

export function isEquityFundCategory(category: string): boolean {
  return EQUITY_FUND_CATEGORIES.has(category);
}

/** Detect debt / money-market instruments misclassified as equity holdings. */
export function isDebtHolding(name: string, sector = ''): boolean {
  const s = sector.trim();
  if (s && /^\[?(CRISIL|ICRA|FITCH|CARE|IND|BWR|Brickwork)/i.test(s)) return true;
  if (sector && /^(CRISIL|ICRA|FITCH|CARE|IND|BWR)\s/i.test(sector)) return true;
  if (sector && /^(Sovereign|Floating|Fixed|Treasury|Money Market|Certificate|Mutual Fund)/i.test(sector)) {
    return true;
  }
  if (/^\d+\.?\d*\s*%\s/.test(name)) return true;
  if (/\(\d{2}\/\d{2}\/\d{4}\)/.test(name)) return true;
  if (/\d{2}\/\d{2}\/\d{4}\s*$/.test(name)) return true;
  if (/\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2,4}/i.test(name)) return true;
  if (/T-BILL|TBILL|GOI|G\.?SEC|DAYS?\s+\d/i.test(name)) return true;
  if (/\bNCD\b/i.test(name)) return true;
  if (/\(ZCB\)/i.test(name)) return true;
  if (/securitisation trust/i.test(name)) return true;
  if (/\bREIT\b|\bInvIT\b/i.test(name)) return true;
  if (/\bPTC\b/i.test(name)) return true;
  if (/commercial paper/i.test(name)) return true;
  if (/\bfund\b.*\b(direct|growth|plan)\b/i.test(name)) return true;
  return false;
}

/** Normalize stock name for deduplication (Ltd/Limited, strip dates). */
export function normalizeStockName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+\d{2}\/\d{2}\/\d{4}\s*$/g, '')
    .replace(/\blimited\b/g, 'ltd')
    .replace(/\bltd\.?\b/g, 'ltd')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bltd\s*$/g, '')
    .trim();
}

export function isValidEquitySector(sector: string): boolean {
  const s = sector.trim();
  if (!s || s === 'Unknown') return true;
  if (/^\d+$/.test(s)) return false;
  if (/^\[?(CRISIL|ICRA|FITCH|CARE|BWR|IND|Brickwork)/i.test(s)) return false;
  return true;
}

export function stockGroupKey(isin: string, stockName: string): string {
  const code = isin.trim().toUpperCase();
  if (code) return code;
  return `name:${normalizeStockName(stockName)}`;
}

function isBetterDisplayName(candidate: string, current: string): boolean {
  if (/\d{2}\/\d{2}\/\d{4}/.test(current) && !/\d{2}\/\d{2}\/\d{4}/.test(candidate)) return true;
  if (/\d{2}\/\d{2}\/\d{4}/.test(candidate) && !/\d{2}\/\d{2}\/\d{4}/.test(current)) return false;
  return candidate.length >= current.length;
}

export function pickBetterStockMeta(
  current: { stockName: string; stockSlug: string; sector: string },
  candidate: { stockName: string; stockSlug: string; sector: string }
): { stockName: string; stockSlug: string; sector: string } {
  return {
    stockName: isBetterDisplayName(candidate.stockName, current.stockName)
      ? candidate.stockName
      : current.stockName,
    stockSlug: isBetterDisplayName(candidate.stockName, current.stockName)
      ? candidate.stockSlug
      : current.stockSlug,
    sector:
      !isValidEquitySector(current.sector) && isValidEquitySector(candidate.sector)
        ? candidate.sector
        : current.sector,
  };
}

export function roundPct(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Minimum portfolio weight move (percentage points) to count as bought/sold. */
export const WEIGHT_CHANGE_THRESHOLD = 0.01;

export type WeightChangeKind = 'increased' | 'decreased' | 'unchanged';

export function classifyWeightChange(prevPct: number, newPct: number): WeightChangeKind {
  const delta = newPct - prevPct;
  if (delta > WEIGHT_CHANGE_THRESHOLD) return 'increased';
  if (delta < -WEIGHT_CHANGE_THRESHOLD) return 'decreased';
  return 'unchanged';
}

interface FundWeightChangeLike {
  prevPct: number;
  newPct: number;
  pctChange: number;
}

export function computeTrackerStockWeights(
  funds: FundWeightChangeLike[],
  changeType: 'increased' | 'decreased' | 'fresh_entry' | 'complete_exit',
): { weightAvg: number; weightTotal: number } {
  if (funds.length === 0) return { weightAvg: 0, weightTotal: 0 };

  if (changeType === 'increased') {
    const sum = funds.reduce((s, f) => s + f.pctChange, 0);
    return { weightTotal: roundPct(sum), weightAvg: roundPct(sum / funds.length) };
  }
  if (changeType === 'decreased') {
    const sum = funds.reduce((s, f) => s + (f.prevPct - f.newPct), 0);
    return { weightTotal: roundPct(sum), weightAvg: roundPct(sum / funds.length) };
  }
  if (changeType === 'fresh_entry') {
    const sum = funds.reduce((s, f) => s + f.newPct, 0);
    return { weightTotal: roundPct(sum), weightAvg: roundPct(sum / funds.length) };
  }
  const sum = funds.reduce((s, f) => s + f.prevPct, 0);
  return { weightTotal: roundPct(sum), weightAvg: roundPct(sum / funds.length) };
}

/** Normalize fund slug to a comparable base (strip plan/growth suffixes). */
export function fundBaseSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option|-income-distribution.*)?$/i, '')
    .replace(/-growth-option$/, '')
    .replace(/-growth$/, '');
}

/** Parse PostgreSQL text[] values returned by Neon into a string list. */
export function parsePgTextArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const raw = String(value).trim();
  if (!raw || raw === '{}') return [];
  if (raw.startsWith('{') && raw.endsWith('}')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
