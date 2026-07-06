/** Stock name normalization & quality scoring for deduplication. */

import { isExcludedPlanName } from './canonical-fund-filter.mjs';
import { hasListingCode } from './listing-codes.mjs';

/** Indian equity ISIN (INE…) or alternate IN0… prefix from AMFI disclosures. */
export function isValidEquityIsin(isin) {
  const s = String(isin || '').trim().toUpperCase();
  return s.startsWith('INE') || s.startsWith('IN0');
}

/** Twelve-character ISIN from AMC disclosure (Indian or foreign listed equity). */
export function normalizeDisclosureIsin(isin) {
  const s = String(isin || '').trim().toUpperCase();
  return /^[A-Z0-9]{12}$/.test(s) ? s : '';
}

export function normalizeStockName(name) {
  return String(name)
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
export function repairTruncatedStockName(name) {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  if (/\s+L\.?$/i.test(raw) && !/\b(LTD|LIMITED)\b/i.test(raw)) {
    return raw.replace(/\s+L\.?$/i, ' Ltd');
  }
  return raw;
}

/** AMC vs index spelling variants (abbreviations, Pvt noise, &/and). */
export function expandStockNameTextVariants(name) {
  const raw = String(name || '').trim();
  if (!raw) return [];
  const variants = new Set([raw]);
  const repaired = repairTruncatedStockName(raw);
  if (repaired !== raw) variants.add(repaired);

  const transforms = [
    (s) => s.replace(/\bpetrochem\b/gi, 'petro'),
    (s) => s.replace(/\bpetrochemicals\b/gi, 'petro'),
    (s) => s.replace(/\bcorporation\b/gi, 'corp'),
    (s) => s.replace(/\s+&\s+/g, ' and '),
    (s) => s.replace(/\band\b/gi, '').replace(/\s+/g, ' ').trim(),
    (s) => s.replace(/\s+(pvt|private)\.?\b/gi, '').replace(/\s+/g, ' ').trim(),
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
export function stockNameLookupKeys(name) {
  const raw = String(name || '').trim();
  if (!raw) return [];
  const textVariants = new Set(expandStockNameTextVariants(raw));

  const withoutParen = raw.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (withoutParen && withoutParen !== raw) {
    for (const v of expandStockNameTextVariants(withoutParen)) textVariants.add(v);
  }

  const keys = new Set();
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

export function isValidEquitySector(sector) {
  const s = String(sector || '').trim();
  if (!s || s === 'Unknown') return true;

  const upper = s.toUpperCase().replace(/\s+/g, ' ');
  if (NON_EQUITY_SECTOR_LABELS.has(upper)) return false;

  if (/^[\d.]+\s*%?$/.test(s)) return false;
  if (/^\[?(CRISIL|ICRA|FITCH|CARE|BWR|Brickwork)/i.test(s)) return false;
  if (/^IND\s/i.test(s)) return false;
  if (
    /^(Sovereign|Floating|Fixed|Treasury|Money Market|Certificate|Commercial Paper|Corporate Bond|Government|G\.?\s*Sec|Call|Term|Cash|Debt|Bond|Mutual Fund|Foreign|Overseas|Stock Future|Index Future|Exchange Traded|Derivative|Option|Future|Preference|Unlisted)/i.test(
      s,
    )
  ) {
    return false;
  }
  if (!/[a-zA-Z]/.test(s)) return false;

  return true;
}

/** Normalize sector for display — hides numeric junk and non-equity labels. */
export function formatStockSector(sector) {
  const s = String(sector ?? '').trim();
  if (!s || s === 'Unknown') return '';
  return isValidEquitySector(s) ? s : '';
}

/** Strip junk before persisting sector names from AMC disclosures. */
export function sanitizeSectorName(sectorName) {
  const sector = String(sectorName || '').trim();
  if (!sector) return '';
  if (!isValidEquitySector(sector)) return '';
  return sector;
}

export function filterTrackerSectorOptions(sectors) {
  const filtered = sectors.filter((s) => s === 'All' || isValidEquitySector(s));
  const rest = filtered.filter((s) => s !== 'All').sort((a, b) => a.localeCompare(b));
  return filtered.includes('All') ? ['All', ...rest] : rest;
}

export function isDebtInstrument(name, sector = '') {
  const s = String(sector || '').trim();
  if (/^\[?(CRISIL|ICRA|FITCH|CARE|BWR|IND|Brickwork)/i.test(s)) return true;
  if (/^(CRISIL|ICRA|FITCH|CARE|IND|BWR)\s/i.test(s)) return true;
  if (/^(Sovereign|Floating|Fixed|Treasury|Money Market|Certificate|Mutual Fund)/i.test(s)) return true;
  if (/^\d+\.?\d*\s*%\s/.test(name)) return true;
  if (/\(\d{2}\/\d{2}\/\d{4}\)/.test(name)) return true;
  if (/\d{2}\/\d{2}\/\d{4}\s*$/.test(name)) return true;
  if (/\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2,4}/i.test(name)) return true;
  if (/T-BILL|TBILL|GOI|G\.?SEC|DAYS?\s+\d/i.test(name)) return true;
  if (/\bNCD\b/i.test(name)) return true;
  return false;
}

/** MF scheme/plan rows misclassified as equity in AMFI portfolio disclosures. */
export function isMutualFundSchemeHolding(name, sector = '') {
  const n = String(name || '').trim();
  if (!n) return false;

  const s = String(sector || '').trim();
  if (/^(Mutual Fund|Foreign Mutual Fund|Overseas Mutual Fund|Exchange Traded Fund|ETF)/i.test(s)) {
    return true;
  }

  if (isExcludedPlanName(name)) return true;

  if (/^(REGULAR|DIRECT)\s+PLAN(\s+(GROWTH|IDCW|DIVIDEND|BONUS|PAYOUT|OPTION))?$/i.test(n)) {
    return true;
  }
  if (/^(GROWTH|DIVIDEND)\s+OPTION$/i.test(n)) return true;

  if (/\b(REGULAR|DIRECT)\s+PLAN\b/i.test(n)) {
    if (/\bFUND\b/i.test(n) && !/\b(LIMITED|LTD)\b/i.test(n)) return true;
    if (/\bSCHEME\b/i.test(n)) return true;
    if (/\b(GROWTH|IDCW|DIVIDEND|OPTION|PAYOUT)\b/i.test(n)) return true;
    if (/\b-\s*DIRECT\s+PL\b/i.test(n)) return true;
  }

  if (/\b-\s*DIRECT\s+PL(?:AN)?(?:\s*-\s*)?(?:GR(?:OWTH)?|IDCW|DIV)?\b/i.test(n)) return true;
  if (/\b-\s*REGULAR\s+PL(?:AN)?/i.test(n)) return true;

  return false;
}

export function stockQualityScore(stock, sectorName = '') {
  let score = 0;
  if (stock.isin) score += 100;
  if (sectorName && isValidEquitySector(sectorName)) score += 40;
  if (!/\d{2}\/\d{2}\/\d{4}/.test(stock.name)) score += 30;
  if (/\bLimited\b/i.test(stock.name)) score += 5;
  if (/\bLtd\.?\b/i.test(stock.name)) score += 3;
  score -= Math.min(stock.name.length, 120) / 50;
  return score;
}

/** Resolve holdings stock names to DB stock ids (ISIN → NSE → BSE → name → slug). */
export function buildStockIdResolver(stockRows, slugifyFn) {
  const stockIdBySlug = Object.fromEntries(stockRows.map((r) => [r.slug, r.id]));
  const stockIdByIsin = {};
  const stockIdByNse = {};
  const stockIdByBse = {};
  const stockIdByNormName = {};
  for (const r of stockRows) {
    if (r.isin) stockIdByIsin[String(r.isin).trim().toUpperCase()] = r.id;
    if (r.nse_symbol) stockIdByNse[String(r.nse_symbol).trim().toUpperCase()] = r.id;
    if (r.bse_code) stockIdByBse[String(r.bse_code).trim()] = r.id;
    const norm = normalizeStockName(r.name);
    if (norm && stockIdByNormName[norm] === undefined) stockIdByNormName[norm] = r.id;
  }
  return function resolveStockId(holding) {
    const isin = holding.isin && String(holding.isin).trim();
    if (isin) {
      const byIsin = stockIdByIsin[isin.toUpperCase()];
      if (byIsin) return byIsin;
    }
    const nse = holding.nse_symbol && String(holding.nse_symbol).trim();
    if (nse) {
      const byNse = stockIdByNse[nse.toUpperCase()];
      if (byNse) return byNse;
    }
    const bse = holding.bse_code && String(holding.bse_code).trim();
    if (bse) {
      const byBse = stockIdByBse[bse];
      if (byBse) return byBse;
    }
    const norm = normalizeStockName(holding.name);
    if (norm && stockIdByNormName[norm]) return stockIdByNormName[norm];
    if (holding.name && slugifyFn) {
      const bySlug = stockIdBySlug[slugifyFn(holding.name)];
      if (bySlug) return bySlug;
    }
    return null;
  };
}

export function stockGroupKey(stock) {
  if (stock.isin && String(stock.isin).trim()) return String(stock.isin).trim().toUpperCase();
  return `name:${normalizeStockName(stock.name)}`;
}

export function hasListingIdentity(listing) {
  return hasListingCode(listing || {});
}

/**
 * Resolve listing identifiers for a holdings row: ISIN → NSE → BSE from disclosure,
 * then backfill missing fields from the NSE/BSE master in `stocks`.
 */
export function buildListingLookup(stockRows, slugifyFn) {
  const byNormName = new Map();
  const bySlug = new Map();

  for (const row of stockRows) {
    const listing = {
      isin: isValidEquityIsin(row.isin) ? String(row.isin).trim().toUpperCase() : null,
      nse_symbol: row.nse_symbol ? String(row.nse_symbol).trim().toUpperCase() : null,
      bse_code: row.bse_code ? String(row.bse_code).trim() : null,
    };
    if (!hasListingIdentity(listing)) continue;

    const norm = normalizeStockName(row.name);
    if (norm && !byNormName.has(norm)) byNormName.set(norm, listing);

    if (row.slug && !bySlug.has(row.slug)) bySlug.set(row.slug, listing);

    if (slugifyFn && row.name) {
      const slug = slugifyFn(row.name);
      if (slug && !bySlug.has(slug)) bySlug.set(slug, listing);
    }
  }

  return function resolveListing(holding) {
    const listing = {
      isin: isValidEquityIsin(holding?.isin) ? String(holding.isin).trim().toUpperCase() : null,
      nse_symbol: holding?.nse_symbol ? String(holding.nse_symbol).trim().toUpperCase() : null,
      bse_code: holding?.bse_code ? String(holding.bse_code).trim() : null,
      name: holding?.name || null,
    };

    if (!holding?.name) return listing;

    const norm = normalizeStockName(holding.name);
    const master =
      (norm && byNormName.get(norm)) ||
      (slugifyFn && bySlug.get(slugifyFn(holding.name))) ||
      null;

    if (master) {
      if (!listing.isin) listing.isin = master.isin;
      if (!listing.nse_symbol) listing.nse_symbol = master.nse_symbol;
      if (!listing.bse_code) listing.bse_code = master.bse_code;
    }

    return listing;
  };
}

/** @deprecated Use buildListingLookup */
export function buildIsinLookup(stockRows, slugifyFn) {
  const resolveListing = buildListingLookup(stockRows, slugifyFn);
  return function resolveIsin(holding) {
    return resolveListing(holding).isin;
  };
}
