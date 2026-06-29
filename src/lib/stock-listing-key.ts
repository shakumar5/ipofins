/**
 * Listed-stock identity for holdings dedupe.
 * ISIN is primary so the same company is never counted once on NSE and again on BSE.
 */
export interface StockListingIdentity {
  nseSymbol?: string | null;
  isin?: string | null;
  bseCode?: string | null;
  stockSlug: string;
}

/** Client dedupe key: ISIN, then NSE, then BSE, then slug. */
export function stockListingKey(parts: StockListingIdentity): string {
  const isin = String(parts.isin ?? '').trim().toUpperCase();
  if (isin) return `isin:${isin}`;
  const nse = String(parts.nseSymbol ?? '').trim().toUpperCase();
  if (nse) return `nse:${nse}`;
  const bse = String(parts.bseCode ?? '').trim();
  if (bse) return `bse:${bse}`;
  return `slug:${parts.stockSlug}`;
}

/** Postgres GROUP BY / join expression for stocks table alias. */
export function stockListingKeySql(alias = 's'): string {
  return `COALESCE(NULLIF(UPPER(TRIM(${alias}.isin)), ''), NULLIF(UPPER(TRIM(${alias}.nse_symbol)), ''), NULLIF(TRIM(${alias}.bse_code), ''), ${alias}.slug)`;
}

/** Normalize SHP holder_name for dedupe across NSE/BSE duplicate stock rows. */
export function holderFilingKeySql(holderExpr: string): string {
  return `upper(regexp_replace(regexp_replace(trim(${holderExpr}), '\\.+$', ''), '\\s+', ' ', 'g'))`;
}

/** Pick one slug per listing key: summary present, then lowest stocks.id. */
export function canonicalStockRankOrderSql(alias = 's'): string {
  return `(EXISTS (SELECT 1 FROM stock_shp_summary ss WHERE ss.stock_id = ${alias}.id)) DESC, ${alias}.id ASC`;
}