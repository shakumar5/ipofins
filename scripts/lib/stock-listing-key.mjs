/** Postgres listing identity — ISIN first (NSE/BSE are the same company). */
export function stockListingKeySql(alias = 's') {
  return `COALESCE(NULLIF(UPPER(TRIM(${alias}.isin)), ''), NULLIF(UPPER(TRIM(${alias}.nse_symbol)), ''), NULLIF(TRIM(${alias}.bse_code), ''), ${alias}.slug)`;
}

export function holderFilingKeySql(holderExpr) {
  return `upper(regexp_replace(regexp_replace(trim(${holderExpr}), '\\.+$', ''), '\\s+', ' ', 'g'))`;
}

export function canonicalStockRankOrderSql(alias = 's') {
  return `(EXISTS (SELECT 1 FROM stock_shp_summary ss WHERE ss.stock_id = ${alias}.id)) DESC, ${alias}.id ASC`;
}

export function canonicalStockRankOrderByStockIdSql(stockIdExpr = 'stock_id') {
  return `(EXISTS (SELECT 1 FROM stock_shp_summary ss WHERE ss.stock_id = ${stockIdExpr})) DESC, ${stockIdExpr} ASC`;
}