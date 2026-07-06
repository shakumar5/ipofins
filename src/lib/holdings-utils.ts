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

/** Repair AMC/DB names truncated before "td" — e.g. "INTERNATIONAL L" → "INTERNATIONAL Ltd". */
export function repairTruncatedStockName(name: string): string {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  if (/\s+L\.?$/i.test(raw) && !/\b(LTD|LIMITED)\b/i.test(raw)) {
    return raw.replace(/\s+L\.?$/i, ' Ltd');
  }
  return raw;
}

/** AMC vs index spelling variants (abbreviations, Pvt noise, &/and). */
export function expandStockNameTextVariants(name: string): string[] {
  const raw = String(name || '').trim();
  if (!raw) return [];
  const variants = new Set([raw]);
  const repaired = repairTruncatedStockName(raw);
  if (repaired !== raw) variants.add(repaired);

  const transforms = [
    (s: string) => s.replace(/\bpetrochem\b/gi, 'petro'),
    (s: string) => s.replace(/\bpetrochemicals\b/gi, 'petro'),
    (s: string) => s.replace(/\bcorporation\b/gi, 'corp'),
    (s: string) => s.replace(/\s+&\s+/g, ' and '),
    (s: string) => s.replace(/\band\b/gi, '').replace(/\s+/g, ' ').trim(),
    (s: string) => s.replace(/\s+(pvt|private)\.?\b/gi, '').replace(/\s+/g, ' ').trim(),
  ];

  for (const fn of transforms) {
    for (const v of [...variants]) {
      const t = fn(v);
      if (t && t !== v) variants.add(t);
    }
  }
  return [...variants];
}

/** Keys for name→slug lookup (AMC labels often include tickers in parentheses). */
export function stockNameLookupKeys(name: string): string[] {
  const raw = String(name || '').trim();
  if (!raw) return [];
  const textVariants = new Set(expandStockNameTextVariants(raw));

  const withoutParen = raw.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (withoutParen && withoutParen !== raw) {
    for (const v of expandStockNameTextVariants(withoutParen)) textVariants.add(v);
  }

  const keys = new Set<string>();
  for (const variant of textVariants) {
    keys.add(normalizeStockName(variant));
    keys.add(variant.toLowerCase().replace(/\s+/g, ' ').trim());
  }

  const paren = raw.match(/\(([^)]+)\)\s*$/);
  if (paren) {
    const ticker = paren[1].trim();
    if (ticker) {
      for (const suffix of [' Limited', ' Ltd', ' Ltd.', '']) {
        keys.add(normalizeStockName(`${ticker}${suffix}`));
      }
      keys.add(ticker.toLowerCase());
    }
  }

  return [...keys].filter(Boolean);
}

/** AMC sector labels that are not equity industry names (debt, F&O, offshore, placeholders). */
const NON_EQUITY_SECTOR_LABELS = new Set(
  [
    'N.A.',
    'N.A',
    'NA',
    'N/A',
    'NOT APPLICABLE',
    'NOT AVAILABLE',
    'SOV',
    'SOVEREIGN',
    'SOVEREIGN SECURITIES',
    'STOCK FUTURE',
    'STOCK FUTURES',
    'INDEX FUTURE',
    'INDEX FUTURES',
    'FOREIGN SECURITY',
    'FOREIGN SECURITIES',
    'FOREIGN MUTUAL FUND',
    'FOREIGN MUTUAL FUNDS',
    'OVERSEAS MUTUAL FUND',
    'OVERSEAS MUTUAL FUNDS',
    'MUTUAL FUND',
    'MUTUAL FUNDS',
    'EXCHANGE TRADED FUND',
    'ETF',
    'CASH',
    'CASH & CASH EQUIVALENT',
    'CASH AND CASH EQUIVALENT',
    'TREASURY BILL',
    'T-BILL',
    'TBILL',
    'GOVERNMENT SECURITIES',
    'GOVT SECURITIES',
    'GOVT. SECURITIES',
    'CORPORATE BOND',
    'CORPORATE BONDS',
    'DEBT',
    'BONDS',
    'COMMERCIAL PAPER',
    'CERTIFICATE OF DEPOSIT',
    'MONEY MARKET',
    'FLOATING',
    'FIXED INCOME',
    'DERIVATIVES',
    'DERIVATIVE',
    'UNLISTED',
    'PREFERENCE SHARE',
    'PREFERENCE SHARES',
  ].map((s) => s.toUpperCase()),
);

/** True when sector is a real equity industry label (not debt, F&O, offshore, or numeric junk). */
export function isValidEquitySector(sector: string): boolean {
  const s = sector.trim();
  if (!s || s === 'Unknown') return true;

  const upper = s.toUpperCase().replace(/\s+/g, ' ');
  if (NON_EQUITY_SECTOR_LABELS.has(upper)) return false;

  // Portfolio weights / numeric codes mis-filed as sector (0.1413, 12.5%, etc.)
  if (/^[\d.]+\s*%?$/.test(s)) return false;

  // Credit rating agency prefixes (IND only when followed by space — not "Industrial …")
  if (/^\[?(CRISIL|ICRA|FITCH|CARE|BWR|Brickwork)/i.test(s)) return false;
  if (/^IND\s/i.test(s)) return false;

  // Debt / money-market / offshore instrument buckets from AMC filings
  if (
    /^(Sovereign|Floating|Fixed|Treasury|Money Market|Certificate|Commercial Paper|Corporate Bond|Government|G\.?\s*Sec|Call|Term|Cash|Debt|Bond|Mutual Fund|Foreign|Overseas|Stock Future|Index Future|Exchange Traded|Derivative|Option|Future|Preference|Unlisted)/i.test(
      s,
    )
  ) {
    return false;
  }

  // Must contain at least one letter (blocks pure numeric codes)
  if (!/[a-zA-Z]/.test(s)) return false;

  return true;
}

/** Normalize sector for display — hides numeric junk and non-equity labels. */
export function formatStockSector(sector: string | null | undefined): string {
  const s = String(sector ?? '').trim();
  if (!s || s === 'Unknown') return '';
  return isValidEquitySector(s) ? s : '';
}

/** Sector filter dropdown options — excludes internal AMC classification codes. */
export function filterTrackerSectorOptions(sectors: readonly string[]): string[] {
  const filtered = sectors.filter((s) => s === 'All' || isValidEquitySector(s));
  const rest = filtered.filter((s) => s !== 'All').sort((a, b) => a.localeCompare(b));
  return filtered.includes('All') ? ['All', ...rest] : rest;
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

export interface SectorStockMoveSummary {
  stockName: string;
  stockSlug: string;
  fundCount: number;
  weightTotal: number;
}

export interface SectorStockMovesByType {
  mostBought: SectorStockMoveSummary[];
  increased: SectorStockMoveSummary[];
  fresh: SectorStockMoveSummary[];
  decreased: SectorStockMoveSummary[];
  exits: SectorStockMoveSummary[];
}

type SectorMoveRow = {
  stockName: string;
  stockSlug: string;
  sector: string;
  fundCount: number;
  weightTotal: number;
};

function topSectorStocks(
  rows: SectorMoveRow[],
  sector: string,
  limit: number,
  sort: 'fundCount' | 'weightTotal',
): SectorStockMoveSummary[] {
  return rows
    .filter((r) => r.sector === sector)
    .sort((a, b) => (sort === 'fundCount' ? b.fundCount - a.fundCount : b.weightTotal - a.weightTotal))
    .slice(0, limit)
    .map((r) => ({
      stockName: r.stockName,
      stockSlug: r.stockSlug,
      fundCount: r.fundCount,
      weightTotal: r.weightTotal,
    }));
}

/** Top stock movers within one sector (from smart-money tracker month payload). */
export function buildSectorStockMoves(
  sector: string,
  monthData: {
    increased: SectorMoveRow[];
    decreased: SectorMoveRow[];
    fresh_entry: SectorMoveRow[];
    complete_exit: SectorMoveRow[];
  },
  limit = 5,
): SectorStockMovesByType {
  return {
    mostBought: topSectorStocks(monthData.increased, sector, limit, 'weightTotal'),
    increased: topSectorStocks(monthData.increased, sector, limit, 'fundCount'),
    fresh: topSectorStocks(monthData.fresh_entry, sector, limit, 'fundCount'),
    decreased: topSectorStocks(monthData.decreased, sector, limit, 'weightTotal'),
    exits: topSectorStocks(monthData.complete_exit, sector, limit, 'fundCount'),
  };
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
