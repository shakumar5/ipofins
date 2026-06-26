-- Category-level shareholding pattern totals per stock × quarter (from XBRL filings).
-- Powers the 1% Club ownership chart:
--   Promoter + FII + Mutual Funds + DII (ex-MF) + Retail = 100%

CREATE TABLE IF NOT EXISTS stock_shp_summary (
  stock_id             INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  quarter              DATE NOT NULL,
  promoter_pct         NUMERIC(6,3),
  fii_pct              NUMERIC(6,3),
  mf_pct               NUMERIC(6,3),
  dii_ex_mf_pct        NUMERIC(6,3),
  public_pct           NUMERIC(6,3),
  individuals_gte1_pct NUMERIC(6,3),
  retail_pct           NUMERIC(6,3),
  total_pct            NUMERIC(6,3),
  source_url           TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (stock_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_stock_shp_summary_quarter
  ON stock_shp_summary(quarter DESC);
