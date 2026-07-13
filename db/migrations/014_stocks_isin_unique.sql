-- Stock listing identity (tiered natural keys):
--   1. ISIN when present
--   2. NSE symbol when no ISIN
--   3. BSE code when no ISIN and no NSE
-- Empty strings are stored as NULL.

UPDATE stocks
SET isin = NULLIF(UPPER(TRIM(isin)), '')
WHERE isin IS DISTINCT FROM NULLIF(UPPER(TRIM(isin)), '');

UPDATE stocks
SET nse_symbol = NULLIF(UPPER(TRIM(nse_symbol)), '')
WHERE nse_symbol IS DISTINCT FROM NULLIF(UPPER(TRIM(nse_symbol)), '');

UPDATE stocks
SET bse_code = NULLIF(TRIM(bse_code), '')
WHERE bse_code IS DISTINCT FROM NULLIF(TRIM(bse_code), '');

DROP INDEX IF EXISTS idx_stocks_isin_nonunique;
DROP INDEX IF EXISTS idx_stocks_isin;

CREATE UNIQUE INDEX IF NOT EXISTS stocks_isin_unique
  ON stocks (isin)
  WHERE isin IS NOT NULL;

-- One row per NSE among stocks that have no ISIN yet.
CREATE UNIQUE INDEX IF NOT EXISTS stocks_nse_unique_no_isin
  ON stocks (nse_symbol)
  WHERE isin IS NULL AND nse_symbol IS NOT NULL;

-- One row per BSE among stocks with neither ISIN nor NSE.
CREATE UNIQUE INDEX IF NOT EXISTS stocks_bse_unique_no_isin_nse
  ON stocks (bse_code)
  WHERE isin IS NULL AND nse_symbol IS NULL AND bse_code IS NOT NULL;
