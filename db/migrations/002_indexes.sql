-- ═══════════════════════════════════════════════════════════════
-- Finverse — Neon PostgreSQL Indexes
-- Migration 002: Performance Indexes
-- ═══════════════════════════════════════════════════════════════

-- Stocks
CREATE INDEX IF NOT EXISTS idx_stocks_sector ON stocks(sector_id);
CREATE INDEX IF NOT EXISTS idx_stocks_isin ON stocks(isin);
CREATE INDEX IF NOT EXISTS idx_stocks_nse ON stocks(nse_symbol);
CREATE INDEX IF NOT EXISTS idx_stocks_market_cap ON stocks(market_cap_category);

-- Funds
CREATE INDEX IF NOT EXISTS idx_funds_amc ON funds(amc_id);
CREATE INDEX IF NOT EXISTS idx_funds_category ON funds(category);
CREATE INDEX IF NOT EXISTS idx_funds_scheme_code ON funds(scheme_code);

-- NAV time-series
CREATE INDEX IF NOT EXISTS idx_navs_date ON fund_navs(date DESC);
CREATE INDEX IF NOT EXISTS idx_navs_fund_date ON fund_navs(fund_id, date DESC);

-- Holdings (smart money core)
CREATE INDEX IF NOT EXISTS idx_holdings_month ON fund_holdings(month DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_stock ON fund_holdings(stock_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_fund ON fund_holdings(fund_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_pct ON fund_holdings(pct_to_nav DESC);

-- Holdings changes
CREATE INDEX IF NOT EXISTS idx_changes_month_type ON holdings_changes(month, change_type);
CREATE INDEX IF NOT EXISTS idx_changes_stock ON holdings_changes(stock_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_changes_fund ON holdings_changes(fund_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_changes_type ON holdings_changes(change_type);

-- Stock signals (conviction scores, dashboard queries)
CREATE INDEX IF NOT EXISTS idx_signals_month_cat ON stock_signals(month DESC, category);
CREATE INDEX IF NOT EXISTS idx_signals_conviction ON stock_signals(month DESC, category, conviction_score DESC);
CREATE INDEX IF NOT EXISTS idx_signals_fresh ON stock_signals(month DESC, category, fresh_entries DESC);
CREATE INDEX IF NOT EXISTS idx_signals_holding_count ON stock_signals(month DESC, category, total_funds_holding DESC);

-- Sector allocations
CREATE INDEX IF NOT EXISTS idx_sector_alloc_month ON sector_allocations(month DESC);

-- Fund overlaps
CREATE INDEX IF NOT EXISTS idx_overlaps_month ON fund_overlaps(month DESC);
CREATE INDEX IF NOT EXISTS idx_overlaps_fund_a ON fund_overlaps(fund_a_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_overlaps_fund_b ON fund_overlaps(fund_b_id, month DESC);

-- IPO queries
CREATE INDEX IF NOT EXISTS idx_ipos_status ON ipos(status);
CREATE INDEX IF NOT EXISTS idx_ipos_sector ON ipos(sector);
CREATE INDEX IF NOT EXISTS idx_ipos_listing_date ON ipos(listing_date DESC);
CREATE INDEX IF NOT EXISTS idx_ipos_type_status ON ipos(type, status);

-- IPO subscriptions
CREATE INDEX IF NOT EXISTS idx_ipo_subs_day ON ipo_subscriptions(ipo_id, day_number);

-- IPO GMP
CREATE INDEX IF NOT EXISTS idx_ipo_gmp_date ON ipo_gmp_history(ipo_id, date DESC);
