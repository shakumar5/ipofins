/** Postgres listing identity — ISIN first (NSE/BSE are the same company). */
export function stockListingKeySql(alias = 's') {
  return `COALESCE(NULLIF(UPPER(TRIM(${alias}.isin)), ''), NULLIF(UPPER(TRIM(${alias}.nse_symbol)), ''), NULLIF(TRIM(${alias}.bse_code), ''), ${alias}.slug)`;
}