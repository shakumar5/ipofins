-- ═══════════════════════════════════════════════════════════════
-- Finverse — Migration 011: Constraints, Indexes & Extensions
-- Zero-downtime: all operations are CONCURRENT or constraint ADDs
-- that don't require table rewrites on Neon/PostgreSQL 16.
-- Run: psql $DATABASE_URL -f db/migrations/011_constraints_and_indexes.sql
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- SECTION 1: ENUM CHECK CONSTRAINTS
-- Prevents invalid status/type values from being inserted by
-- pipeline bugs. These catch data quality issues at the DB level
-- rather than relying on application-layer validation alone.
-- ─────────────────────────────────────────────────────────────

-- ipos.status — valid pipeline states
ALTER TABLE ipos
  ADD CONSTRAINT IF NOT EXISTS ipos_status_check
  CHECK (status IN (
    'drhp-filed', 'sebi-approved', 'upcoming', 'open', 'live',
    'closed', 'allotment', 'listing', 'listed', 'failed', 'withdrawn'
  ));

-- ipos.type — mainboard or SME only
ALTER TABLE ipos
  ADD CONSTRAINT IF NOT EXISTS ipos_type_check
  CHECK (type IN ('mainboard', 'sme'));

-- ipos price band integrity
ALTER TABLE ipos
  ADD CONSTRAINT IF NOT EXISTS ipos_price_band_check
  CHECK (price_min IS NULL OR price_max IS NULL OR price_min <= price_max);

-- tracked_entities.type — drives route membership
ALTER TABLE tracked_entities
  ADD CONSTRAINT IF NOT EXISTS te_type_check
  CHECK (type IN ('individual', 'family_office', 'fii', 'dii', 'pms', 'aif', 'sif'));

-- holdings_changes.change_type — known change categories
ALTER TABLE holdings_changes
  ADD CONSTRAINT IF NOT EXISTS hc_change_type_check
  CHECK (change_type IN (
    'fresh_entry', 'complete_exit', 'increased', 'decreased', 'unchanged'
  ));

-- entity_changes.change_type — mirrors holdings_changes
ALTER TABLE entity_changes
  ADD CONSTRAINT IF NOT EXISTS ec_change_type_check
  CHECK (change_type IN (
    'fresh_entry', 'complete_exit', 'increased', 'decreased', 'unchanged', 'partial_exit'
  ));

-- shareholding_pattern_holders.pct_of_company — catches the XBRL 1.0 misparse bug
-- (pct values mistakenly stored as 100 instead of 1.0) at DB insert time.
ALTER TABLE shareholding_pattern_holders
  ADD CONSTRAINT IF NOT EXISTS sph_pct_range_check
  CHECK (pct_of_company >= 0 AND pct_of_company <= 100);

-- fund_returns — guard against extreme pipeline errors
ALTER TABLE fund_returns
  ADD CONSTRAINT IF NOT EXISTS fund_returns_range_check
  CHECK (
    (returns_1y IS NULL OR returns_1y BETWEEN -100 AND 10000) AND
    (returns_3y IS NULL OR returns_3y BETWEEN -100 AND 10000) AND
    (returns_5y IS NULL OR returns_5y BETWEEN -100 AND 10000)
  );

-- pipeline_runs.status — known pipeline states
ALTER TABLE pipeline_runs
  ADD CONSTRAINT IF NOT EXISTS pr_status_check
  CHECK (status IN ('success', 'aborted', 'failed', 'running'));

-- pipeline_runs.pipeline — known pipeline names (extend as needed)
ALTER TABLE pipeline_runs
  ADD CONSTRAINT IF NOT EXISTS pr_pipeline_check
  CHECK (pipeline IN (
    'superinvestor', '1pc-club', 'pms', 'altfunds', 'sast-sweep',
    'mf-holdings', 'nav-daily', 'ipo-sync', 'ipo-subscription',
    'ipo-performance', 'quarterly-si'
  ));


-- ─────────────────────────────────────────────────────────────
-- SECTION 2: FULL-TEXT SEARCH INDEXES (pg_trgm)
-- Enables fast fuzzy name matching for:
--   - Stock search in Smart Money Tracker + 1% Club
--   - Fund name search in Portfolio Overlap Checker
--   - Entity name matching for SHP name resolution
-- CREATE INDEX CONCURRENTLY acquires no table lock.
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stocks_name_trgm
  ON stocks USING GIN(name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_funds_name_trgm
  ON funds USING GIN(name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_te_name_trgm
  ON tracked_entities USING GIN(name gin_trgm_ops);

-- GIN index on aliases array for fast variant matching during SHP ingestion
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_te_aliases
  ON tracked_entities USING GIN(aliases);

-- Full-text vector index on stocks for higher-quality name search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stocks_name_fts
  ON stocks USING GIN(to_tsvector('english', name));

-- ─────────────────────────────────────────────────────────────
-- SECTION 3: MISSING PERFORMANCE INDEXES
-- Identified from query analysis — these eliminate sequential
-- scans on hot paths used by the IPO status queries and
-- fund NAV lookups.
-- ─────────────────────────────────────────────────────────────

-- Live IPO query: WHERE status IN ('upcoming','live') AND open_date <= NOW() AND close_date >= NOW()
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ipos_open_close_status
  ON ipos(open_date, close_date) WHERE status IN ('upcoming', 'live', 'open');

-- "Latest NAV for a fund" covering index — eliminates heap fetch
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_navs_fund_latest_covering
  ON fund_navs(fund_id, date DESC) INCLUDE (nav);

-- entity_holdings: confirmed (non-preliminary) holdings by entity+quarter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eh_confirmed
  ON entity_holdings(entity_id, quarter DESC)
  WHERE is_preliminary = FALSE;

-- shareholding_pattern_holders: unmatched holders (for 1% Club discovery view)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sph_unmatched
  ON shareholding_pattern_holders(quarter DESC, pct_of_company DESC)
  WHERE entity_id IS NULL AND is_promoter = FALSE;

-- sast_filings: preliminary filings pending quarterly confirmation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sast_preliminary
  ON sast_filings(filing_date DESC)
  WHERE is_preliminary = TRUE;


-- ─────────────────────────────────────────────────────────────
-- SECTION 4: MATERIALIZED VIEW REFRESH LOG
-- Enables the UI to show "Smart money data last updated: X ago"
-- and automated alerting when views become stale.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mv_refresh_log (
  view_name   TEXT NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms  INT,
  rows_count   BIGINT,
  triggered_by TEXT DEFAULT 'manual',  -- manual / pipeline / cron
  PRIMARY KEY (view_name, refreshed_at)
);

CREATE INDEX IF NOT EXISTS idx_mv_refresh_log_view
  ON mv_refresh_log(view_name, refreshed_at DESC);

-- ─────────────────────────────────────────────────────────────
-- SECTION 5: IPO ALERTS TABLE (no-login email notifications)
-- UUID-keyed so no user account needed. Unsubscribe via token.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ipo_alerts (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email            TEXT NOT NULL,
  ipo_id           INT REFERENCES ipos(id) ON DELETE CASCADE,
  alert_types      TEXT[] DEFAULT ARRAY['open','reminder','close','allotment','listing'],
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  unsubscribe_token UUID DEFAULT gen_random_uuid() UNIQUE,
  is_active        BOOLEAN DEFAULT TRUE,
  last_sent_at     TIMESTAMPTZ,
  -- Simple deduplication — one alert subscription per email+ipo combination
  UNIQUE(email, ipo_id)
);

CREATE INDEX IF NOT EXISTS idx_ipo_alerts_ipo_active
  ON ipo_alerts(ipo_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_ipo_alerts_email_active
  ON ipo_alerts(email) WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────
-- SECTION 6: IPO FUNDAMENTALS TABLE (for richer IPO scoring)
-- Populated by LLM extraction from DRHP PDFs (future pipeline step)
-- or manual data entry. Additive — does not touch existing tables.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ipo_fundamentals (
  ipo_id            INT PRIMARY KEY REFERENCES ipos(id) ON DELETE CASCADE,
  revenue_cr        NUMERIC(14,2),
  revenue_cagr_3y   NUMERIC(6,2),
  ebitda_margin_pct NUMERIC(6,2),
  pat_cr            NUMERIC(14,2),
  pat_margin_pct    NUMERIC(6,2),
  debt_equity_ratio NUMERIC(8,3),
  promoter_holding_pct NUMERIC(5,2),
  pe_ratio          NUMERIC(8,2),
  sector_pe_ratio   NUMERIC(8,2),
  roce_pct          NUMERIC(6,2),
  roe_pct           NUMERIC(6,2),
  data_source       TEXT DEFAULT 'manual',  -- manual / drhp_llm / scrape
  data_notes        TEXT,
  last_updated      TIMESTAMPTZ DEFAULT NOW()
);
