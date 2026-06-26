-- Quarter-end closing prices per stock (NSE/BSE bhavcopy + Yahoo).
-- Powers 1% Club holder values for stocks without curated entity_holdings rows.

CREATE TABLE IF NOT EXISTS stock_quarter_prices (
  stock_id     INT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  quarter      DATE NOT NULL,
  close_price  NUMERIC(14,4) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stock_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_sqp_quarter ON stock_quarter_prices(quarter DESC);
