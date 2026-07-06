/**
 * Canonical ISIN / NSE / BSE rules for Indian listed equities.
 * Keep in sync with scripts/lib/listing-codes.mjs.
 */
import { isDebtHolding, isValidEquitySector } from './holdings-utils';

export interface ListingCodes {
  isin: string;
  nseSymbol: string;
  bseCode: string;
}

export interface FundListingContext {
  fundSlug?: string;
  fundName?: string;
  category?: string;
  internationalFund?: boolean;
}

export interface HoldingListingRow {
  name?: string | null;
  sector?: string | null;
  isin?: string | null;
  nseSymbol?: string | null;
  nse_symbol?: string | null;
  bseCode?: string | null;
  bse_code?: string | null;
  stockSlug?: string | null;
  stock_slug?: string | null;
  international?: boolean;
  [key: string]: unknown;
}

const INTERNATIONAL_FUND_PATTERN =
  /\b(taiwan|japan|japanese|china|chinese|korea|korean|asian|asia[\s-]?pacific|international|global|world|us[\s-]?bluechip|us[\s-]?equity|u\.s\.|europe|european|emerging[\s-]?markets|overseas|foreign[\s-]?equity|latin[\s-]?america|hang[\s-]?seng|asean)\b/i;

function isValidIndianEquityIsin(isin: string): boolean {
  return isin.startsWith('INE') || isin.startsWith('IN0');
}

export function isInternationalEquityFund(
  fundSlug = '',
  fundName = '',
  category = '',
): boolean {
  const text = `${fundSlug} ${fundName} ${category}`.trim();
  if (!text) return false;
  return INTERNATIONAL_FUND_PATTERN.test(text);
}

function fundContextInternational(fundContext?: FundListingContext): boolean {
  if (!fundContext) return false;
  if (fundContext.internationalFund === true) return true;
  return isInternationalEquityFund(
    fundContext.fundSlug || '',
    fundContext.fundName || '',
    fundContext.category || '',
  );
}

/** Foreign / overseas holdings — listing codes optional. */
export function isInternationalHolding(
  row: HoldingListingRow,
  fundContext?: FundListingContext,
): boolean {
  if (fundContextInternational(fundContext)) return true;

  const sector = String(row.sector || '').trim().toUpperCase();
  if (/FOREIGN|OVERSEAS/.test(sector)) return true;

  const isin = String(row.isin || '').trim().toUpperCase();
  if (isin.length === 12 && !isValidIndianEquityIsin(isin)) return true;

  return false;
}

export function sanitizeListingCodes(row: HoldingListingRow): ListingCodes {
  let isin = String(row.isin || '').trim().toUpperCase();
  const nseSymbol = String(row.nseSymbol || row.nse_symbol || '').trim().toUpperCase();
  const bseCode = String(row.bseCode || row.bse_code || '').trim();

  if (isin && !/^[A-Z0-9]{12}$/.test(isin)) isin = '';
  if (isin && !isValidIndianEquityIsin(isin) && isin.length !== 12) isin = '';
  if (isin && !isValidIndianEquityIsin(isin) && isin.length === 12) {
    // Non-Indian ISIN — keep for international rows.
  } else if (isin && !isValidIndianEquityIsin(isin)) {
    isin = '';
  }

  return { isin, nseSymbol, bseCode };
}

export function hasListingCode(row: HoldingListingRow): boolean {
  const { isin, nseSymbol, bseCode } = sanitizeListingCodes(row);
  return Boolean(isin || nseSymbol || bseCode);
}

export function listingCodeRequired(
  row: HoldingListingRow,
  fundContext?: FundListingContext,
): boolean {
  return !isInternationalHolding(row, fundContext);
}

export function meetsListingCodePolicy(
  row: HoldingListingRow,
  fundContext?: FundListingContext,
): boolean {
  if (!listingCodeRequired(row, fundContext)) return true;
  return hasListingCode(row);
}

function isEquityHoldingRow(row: HoldingListingRow): boolean {
  const name = String(row.name || '');
  const sector = String(row.sector || '');
  if (!isValidEquitySector(sector)) return false;
  if (isDebtHolding(name, sector)) return false;
  if (/^\d+\.?\d*%\s/.test(name)) return false;
  return Boolean(name);
}

export function normalizeEquityHoldingRow(
  row: HoldingListingRow,
  opts: {
    slugToListing?: Map<string, ListingCodes>;
    enrichFromSlug?: boolean;
    fundContext?: FundListingContext;
  } = {},
): HoldingListingRow | null {
  const fundContext = opts.fundContext;
  if (!isEquityHoldingRow(row)) return null;

  let codes = sanitizeListingCodes(row);

  if (!hasListingCode(codes) && opts.enrichFromSlug !== false && opts.slugToListing) {
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
