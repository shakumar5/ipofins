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

/** Equity fund categories shown in All Funds / Best Funds listings. */
export const LISTABLE_EQUITY_CATEGORIES = [
  'Large Cap',
  'Large & Mid Cap',
  'Mid Cap',
  'Multi Cap',
  'Flexi Cap',
  'Small Cap',
  'Value',
  'Focused',
  'ELSS',
  'Sectoral/Thematic',
  'Sectoral',
  'Contra',
  'Dividend Yield',
  'Index',
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

/** Normalize fund slug to a comparable base (strip plan/growth suffixes). */
export function fundBaseSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option|-income-distribution.*)?$/i, '')
    .replace(/-growth-option$/, '')
    .replace(/-growth$/, '');
}
