/**
 * Listed-stock identity for holdings dedupe.
 * Uses exchange codes (NSE/BSE/ISIN) - never company display name.
 */
export interface StockListingIdentity {
  nseSymbol?: string | null;
  isin?: string | null;
  bseCode?: string | null;
  stockSlug: string;
}

/** Client/JS dedupe key - NSE ticker first, then ISIN, BSE code, slug. */
export function stockListingKey(parts: StockListingIdentity): string {
  const nse = String(parts.nseSymbol ?? '').trim().toUpperCase();
  if (nse) return `nse:${nse}`;
  const isin = String(parts.isin ?? '').trim().toUpperCase();
  if (isin) return `isin:${isin}`;
  const bse = String(parts.bseCode ?? '').trim();
  if (bse) return `bse:${bse}`;
  return `slug:${parts.stockSlug}`;
}

/** Postgres expression for GROUP BY - `alias` = stocks table alias. */
export function stockListingKeySql(alias = 's'): string {
  return `COALESCE(NULLIF(UPPER(TRIM(${alias}.nse_symbol)), ''), NULLIF(TRIM(${alias}.isin), ''), NULLIF(TRIM(${alias}.bse_code), ''), ${alias}.slug)`;
}