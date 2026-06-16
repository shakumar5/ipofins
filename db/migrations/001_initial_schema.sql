-- ═══════════════════════════════════════════════════════════════
-- Finverse — Neon PostgreSQL Schema
-- Migration 001: Initial Schema
-- Run: psql $DATABASE_URL -f db/migrations/001_initial_schema.sql
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- CORE REFERENCE TABLES
-- ═══════════════════════════════════════════════════════════════

-- Sectors lookup (for sector rotation tracking)
CREATE TABLE IF NOT EXISTS sectors (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Master stock universe (every equity tracked)
CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  isin VARCHAR(12),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sector_id INT REFERENCES sectors(id),
  industry TEXT,
  market_cap_category VARCHAR(20),           -- large/mid/small/micro
  bse_code VARCHAR(10),
  nse_symbol VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- AMC & MUTUAL FUND TABLES
-- ═══════════════════════════════════════════════════════════════

-- Asset Management Companies
CREATE TABLE IF NOT EXISTS amcs (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  short_name VARCHAR(30),
  total_aum NUMERIC(14,2),
  fund_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mutual Fund schemes
CREATE TABLE IF NOT EXISTS funds (
  id SERIAL PRIMARY KEY,
  scheme_code VARCHAR(20) UNIQUE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  amc_id INT REFERENCES amcs(id),
  category VARCHAR(50) NOT NULL,
  sub_category VARCHAR(50),
  risk_level VARCHAR(20),
  benchmark TEXT,
  inception_date DATE,
  expense_ratio NUMERIC(4,2),
  aum NUMERIC(14,2),
  rating SMALLINT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily NAV history
CREATE TABLE IF NOT EXISTS fund_navs (
  fund_id INT REFERENCES funds(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  nav NUMERIC(12,4) NOT NULL,
  PRIMARY KEY (fund_id, date)
);

-- Pre-computed returns (refreshed daily)
CREATE TABLE IF NOT EXISTS fund_returns (
  fund_id INT PRIMARY KEY REFERENCES funds(id) ON DELETE CASCADE,
  returns_1m NUMERIC(6,2),
  returns_3m NUMERIC(6,2),
  returns_6m NUMERIC(6,2),
  returns_1y NUMERIC(6,2),
  returns_3y NUMERIC(6,2),
  returns_5y NUMERIC(6,2),
  returns_10y NUMERIC(6,2),
  returns_since_inception NUMERIC(6,2),
  last_computed TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- HOLDINGS & SMART MONEY TABLES
-- ═══════════════════════════════════════════════════════════════

-- Monthly portfolio snapshot (raw data from AMFI disclosures)
CREATE TABLE IF NOT EXISTS fund_holdings (
  id BIGSERIAL PRIMARY KEY,
  fund_id INT REFERENCES funds(id) ON DELETE CASCADE,
  stock_id INT REFERENCES stocks(id),
  month DATE NOT NULL,                       -- First day of disclosure month
  quantity BIGINT,
  market_value NUMERIC(14,2),                -- Rs in Lakhs
  pct_to_nav NUMERIC(6,3),
  UNIQUE(fund_id, stock_id, month)
);

-- Computed month-over-month changes
CREATE TABLE IF NOT EXISTS holdings_changes (
  id BIGSERIAL PRIMARY KEY,
  fund_id INT REFERENCES funds(id) ON DELETE CASCADE,
  stock_id INT REFERENCES stocks(id),
  month DATE NOT NULL,
  prev_month DATE,
  change_type VARCHAR(20) NOT NULL,          -- fresh_entry/complete_exit/increased/decreased/unchanged
  qty_change BIGINT,
  pct_change NUMERIC(6,3),
  prev_pct NUMERIC(6,3),
  new_pct NUMERIC(6,3),
  prev_quantity BIGINT,
  new_quantity BIGINT,
  UNIQUE(fund_id, stock_id, month)
);

-- Aggregated stock-level smart money signals (per category + ALL)
CREATE TABLE IF NOT EXISTS stock_signals (
  stock_id INT REFERENCES stocks(id),
  month DATE NOT NULL,
  category VARCHAR(50) NOT NULL,             -- Fund category OR 'ALL'
  total_funds_holding INT DEFAULT 0,
  fresh_entries INT DEFAULT 0,
  complete_exits INT DEFAULT 0,
  increased_count INT DEFAULT 0,
  decreased_count INT DEFAULT 0,
  net_quantity_change BIGINT,
  total_value_held NUMERIC(16,2),
  avg_pct_allocation NUMERIC(6,3),
  conviction_score NUMERIC(5,2),
  PRIMARY KEY (stock_id, month, category)
);

-- Sector rotation tracking
CREATE TABLE IF NOT EXISTS sector_allocations (
  sector_id INT REFERENCES sectors(id),
  month DATE NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'ALL',  -- Fund category or 'ALL'
  total_value NUMERIC(16,2),
  pct_of_total_equity NUMERIC(6,3),
  fund_count INT,
  avg_allocation_pct NUMERIC(6,3),
  mom_change NUMERIC(6,3),                   -- Month-over-month weight change
  PRIMARY KEY (sector_id, month, category)
);

-- AMC-level monthly stats
CREATE TABLE IF NOT EXISTS amc_monthly_stats (
  amc_id INT REFERENCES amcs(id),
  month DATE NOT NULL,
  total_stocks_held INT,
  total_equity_aum NUMERIC(16,2),
  top_sector TEXT,
  top_sector_pct NUMERIC(5,2),
  concentration_score NUMERIC(5,2),
  turnover_ratio NUMERIC(5,2),
  PRIMARY KEY (amc_id, month)
);

-- Fund overlap (pairwise, monthly)
CREATE TABLE IF NOT EXISTS fund_overlaps (
  fund_a_id INT REFERENCES funds(id) ON DELETE CASCADE,
  fund_b_id INT REFERENCES funds(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  overlap_pct NUMERIC(5,2),
  common_stocks INT,
  PRIMARY KEY (fund_a_id, fund_b_id, month),
  CHECK (fund_a_id < fund_b_id)
);

-- ═══════════════════════════════════════════════════════════════
-- IPO TABLES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ipos (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  price_range TEXT,
  price_min NUMERIC(10,2),
  price_max NUMERIC(10,2),
  lot_size INT,
  issue_size TEXT,
  issue_size_cr NUMERIC(12,2),
  open_date DATE,
  close_date DATE,
  allotment_date DATE,
  listing_date DATE,
  sector TEXT,
  registrar TEXT,
  founders TEXT,
  headquarters TEXT,
  founded VARCHAR(10),
  description TEXT,
  purpose TEXT,
  drhp_url TEXT,
  highlights TEXT[],
  risks TEXT[],
  risk_score SMALLINT,
  stock_id INT REFERENCES stocks(id),        -- Links to stock after listing
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily subscription data during IPO period
CREATE TABLE IF NOT EXISTS ipo_subscriptions (
  ipo_id INT REFERENCES ipos(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day_number SMALLINT,
  retail_times NUMERIC(8,2),
  nii_times NUMERIC(8,2),
  qib_times NUMERIC(8,2),
  total_times NUMERIC(8,2),
  applications_count BIGINT,
  PRIMARY KEY (ipo_id, date)
);

-- Daily GMP tracking
CREATE TABLE IF NOT EXISTS ipo_gmp_history (
  ipo_id INT REFERENCES ipos(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  gmp NUMERIC(10,2),
  estimated_listing_pct NUMERIC(6,2),
  PRIMARY KEY (ipo_id, date)
);

-- Post-listing performance tracking
CREATE TABLE IF NOT EXISTS ipo_performance (
  ipo_id INT PRIMARY KEY REFERENCES ipos(id) ON DELETE CASCADE,
  issue_price NUMERIC(10,2),
  listing_price NUMERIC(10,2),
  listing_day_high NUMERIC(10,2),
  listing_day_low NUMERIC(10,2),
  listing_day_close NUMERIC(10,2),
  price_1w NUMERIC(10,2),
  price_1m NUMERIC(10,2),
  price_3m NUMERIC(10,2),
  price_6m NUMERIC(10,2),
  price_1y NUMERIC(10,2),
  current_price NUMERIC(10,2),
  listing_gain_pct NUMERIC(6,2),
  return_1m_pct NUMERIC(6,2),
  return_1y_pct NUMERIC(6,2),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- IPO allotment stats (for prediction model)
CREATE TABLE IF NOT EXISTS ipo_allotment_stats (
  ipo_id INT PRIMARY KEY REFERENCES ipos(id) ON DELETE CASCADE,
  total_applications BIGINT,
  total_shares_offered BIGINT,
  retail_quota_pct NUMERIC(5,2),
  retail_applications BIGINT,
  retail_oversubscription NUMERIC(8,2),
  allotment_probability NUMERIC(5,4),
  min_lots_for_allotment INT,
  category_cutoff TEXT
);
