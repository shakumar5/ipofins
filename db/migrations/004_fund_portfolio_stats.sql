-- Full portfolio stock count per fund/month (top-N holdings are stored separately in fund_holdings)
CREATE TABLE IF NOT EXISTS fund_portfolio_stats (
  fund_id INT REFERENCES funds(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  total_stocks INT NOT NULL,
  PRIMARY KEY (fund_id, month)
);

CREATE INDEX IF NOT EXISTS idx_fund_portfolio_stats_month ON fund_portfolio_stats(month DESC);
