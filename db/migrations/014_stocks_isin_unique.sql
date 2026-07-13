-- ISIN is the canonical equity identity. One stock row per ISIN.
-- Empty / whitespace ISINs are stored as NULL (multiple NULLs allowed).

UPDATE stocks
SET isin = NULLIF(UPPER(TRIM(isin)), '')
WHERE isin IS DISTINCT FROM NULLIF(UPPER(TRIM(isin)), '');

DROP INDEX IF EXISTS idx_stocks_isin_nonunique;
DROP INDEX IF EXISTS idx_stocks_isin;

-- Partial unique: enforces one row per real ISIN; NULLs (no ISIN yet) stay free.
CREATE UNIQUE INDEX IF NOT EXISTS stocks_isin_unique
  ON stocks (isin)
  WHERE isin IS NOT NULL;
