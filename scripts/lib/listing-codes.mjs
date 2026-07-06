/**
 * Canonical ISIN / NSE / BSE rules for Indian listed equities.
 * Used by parse → seed → export → client read paths. Keep in sync with src/lib/listing-codes.ts.
 */
import { isValidEquityIsin, isMutualFundSchemeHolding, isDebtInstrument } from './stock-utils.mjs';

/** @typedef {{ isin: string, nseSymbol: string, bseCode: string }} ListingCodes */
/** @typedef {{ fundSlug?: string, fundName?: string, category?: string, internationalFund?: boolean }} FundListingContext */

const INTERNATIONAL_FUND_PATTERN =
  /\b(taiwan|japan|japanese|china|chinese|korea|korean|asian|asia[\s-]?pacific|international|global|world|us[\s-]?bluechip|us[\s-]?equity|u\.s\.|europe|european|emerging[\s-]?markets|overseas|foreign[\s-]?equity|latin[\s-]?america|hang[\s-]?seng|asean)\b/i;

export function isInternationalEquityFund(fundSlug = '', fundName = '', category = '') {
  const text = `${fundSlug} ${fundName} ${category}`.trim();
  if (!text) return false;
  return INTERNATIONAL_FUND_PATTERN.test(text);
}

function fundContextInternational(fundContext) {
  if (!fundContext) return false;
  if (fundContext.internationalFund === true) return true;
  return isInternationalEquityFund(
    fundContext.fundSlug || '',
    fundContext.fundName || '',
    fundContext.category || '',
  );
}

/**
 * Foreign / overseas holdings (Taiwan fund, global equity) — listing codes optional.
 */
export function isInternationalHolding(row, fundContext) {
  if (fundContextInternational(fundContext)) return true;

  const sector = String(row?.sector || '').trim().toUpperCase();
  if (/FOREIGN|OVERSEAS/.test(sector)) return true;

  const isin = String(row?.isin || '').trim().toUpperCase();
  if (isin.length === 12 && !isin.startsWith('INE') && !isin.startsWith('IN0')) return true;

  return false;
}

/** Normalize listing fields from any row shape. */
export function sanitizeListingCodes(row) {
  let isin = String(row?.isin || '').trim().toUpperCase();
  const nseSymbol = String(row?.nseSymbol || row?.nse_symbol || '').trim().toUpperCase();
  const bseCode = String(row?.bseCode || row?.bse_code || '').trim();

  if (isin && !/^[A-Z0-9]{12}$/.test(isin)) isin = '';
  if (isin && !isValidEquityIsin(isin) && isin.length === 12) {
    // Non-Indian ISIN (e.g. US listing) — keep for international rows.
  } else if (isin && !isValidEquityIsin(isin)) {
    isin = '';
  }

  return { isin, nseSymbol, bseCode };
}

/** At least one of ISIN / NSE / BSE is present after sanitize. */
export function hasListingCode(row) {
  const { isin, nseSymbol, bseCode } = sanitizeListingCodes(row);
  return Boolean(isin || nseSymbol || bseCode);
}

/** Indian listed equity rows must have a listing code; international rows are exempt. */
export function listingCodeRequired(row, fundContext) {
  return !isInternationalHolding(row, fundContext);
}

export function meetsListingCodePolicy(row, fundContext) {
  if (!listingCodeRequired(row, fundContext)) return true;
  return hasListingCode(row);
}

/**
 * Apply listing code policy to a holdings row.
 * @param {object} row
 * @param {{ slugToListing?: Map<string, ListingCodes>, enrichFromSlug?: boolean, fundContext?: FundListingContext }} [opts]
 * @returns {object|null} Normalized row, or null when row should be dropped.
 */
export function normalizeEquityHoldingRow(row, opts = {}) {
  const fundContext = opts.fundContext;
  if (!row?.name) return null;
  if (isDebtInstrument(row.name, row.sector) || isMutualFundSchemeHolding(row.name, row.sector)) {
    return null;
  }

  let codes = sanitizeListingCodes(row);

  if (!hasListingCode({ ...codes }) && opts.enrichFromSlug !== false && opts.slugToListing) {
    const slug = String(row.stockSlug || row.stock_slug || '').trim();
    if (slug) {
      const hit = opts.slugToListing.get(slug);
      if (hit) {
        codes = sanitizeListingCodes({
          isin: codes.isin || hit.isin,
          nseSymbol: codes.nseSymbol || hit.nseSymbol,
          bseCode: codes.bseCode || hit.bseCode,
        });
      }
    }
  }

  if (!meetsListingCodePolicy({ ...row, ...codes }, fundContext)) return null;

  return {
    ...row,
    isin: codes.isin,
    nseSymbol: codes.nseSymbol,
    nse_symbol: codes.nseSymbol,
    bseCode: codes.bseCode,
    bse_code: codes.bseCode,
    international: isInternationalHolding({ ...row, ...codes }, fundContext),
  };
}

/** Stocks table rows from holdings seed — must carry listing identity (Indian listings only). */
export function normalizeStockListingRow(row, fundContext) {
  if (isInternationalHolding(row, fundContext)) return null;
  const codes = sanitizeListingCodes(row);
  if (!hasListingCode(codes)) return null;
  return {
    ...row,
    isin: codes.isin || null,
    nse_symbol: codes.nseSymbol || null,
    bse_code: codes.bseCode || null,
  };
}
