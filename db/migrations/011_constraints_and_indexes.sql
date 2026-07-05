-- ═══════════════════════════════════════════════════════════════
-- Finverse — Migration 011: Constraints, Indexes & Extensions
-- Idempotent via DO blocks + CREATE IF NOT EXISTS (pg driver transaction-safe).
-- Run: npm run db:migrate-011
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- SECTION 1: ENUM CHECK CONSTRAINTS
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE ipos ADD CONSTRAINT ipos_status_check
  CHECK (status IN (
    'drhp-filed', 'sebi-approved', 'upcoming', 'open', 'live',
    'closed', 'allotment', 'listing', 'listed', 'failed', 'withdrawn'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ipos ADD CONSTRAINT ipos_type_check
  CHECK (type IN ('mainboard', 'sme'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ipos ADD CONSTRAINT ipos_price_band_check
  CHECK (price_min IS NULL OR price_max IS NULL OR price_min <= price_max);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tracked_entities ADD CONSTRAINT te_type_check
  CHECK (type IN ('individual', 'family_office', 'fii', 'dii', 'pms', 'aif', 'sif'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE holdings_changes ADD CONSTRAINT hc_change_type_check
  CHECK (change_type IN (
    'fresh_entry', 'complete_exit', 'increased', 'decreased', 'unchanged'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE entity_changes ADD CONSTRAINT ec_change_type_check
  CHECK (change_type IN (
    'fresh_entry', 'complete_exit', 'increased', 'decreased', 'unchanged', 'partial_exit'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE shareholding_pattern_holders ADD CONSTRAINT sph_pct_range_check
  CHECK (pct_of_company >= 0 AND pct_of_company <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE fund_returns ADD CONSTRAINT fund_returns_range_check
  CHECK (
    (returns_1y IS NULL OR returns_1y BETWEEN -100 AND 10000) AND
    (returns_3y IS NULL OR returns_3y BETWEEN -100 AND 10000) AND
    (returns_5y IS NULL OR returns_5y BETWEEN -100 AND 10000)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE pipeline_runs ADD CONSTRAINT pr_status_check
  CHECK (status IN ('success', 'aborted', 'failed', 'running'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE pipeline_runs ADD CONSTRAINT pr_pipeline_check
  CHECK (pipeline IN (
    'superinvestor', '1pc-club', 'pms', 'altfunds', 'sast-sweep',
    'mf-holdings', 'nav-daily', 'ipo-sync', 'ipo-subscription',
    'ipo-performance', 'quarterly-si'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─────────────────────────────────────────────────────────────
-- SECTION 2: FULL-TEXT SEARCH INDEXES (pg_trgm)
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS idx_stocks_name_trgm
  ON stocks USING GIN(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_funds_name_trgm
  ON funds USING GIN(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_te_name_trgm
  ON tracked_entities USING GIN(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_te_aliases
  ON tracked_entities USING GIN(aliases);

CREATE INDEX IF NOT EXISTS idx_stocks_name_fts
  ON stocks USING GIN(to_tsvector('english', name));


-- ─────────────────────────────────────────────────────────────
-- SECTION 3: MISSING PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ipos_open_close_status
  ON ipos(open_date, close_date) WHERE status IN ('upcoming', 'live', 'open');

CREATE INDEX IF NOT EXISTS idx_navs_fund_latest_covering
  ON fund_navs(fund_id, date DESC) INCLUDE (nav);

CREATE INDEX IF NOT EXISTS idx_eh_confirmed
  ON entity_holdings(entity_id, quarter DESC)
  WHERE is_preliminary = FALSE;

CREATE INDEX IF NOT EXISTS idx_sph_unmatched
  ON shareholding_pattern_holders(quarter DESC, pct_of_company DESC)
  WHERE entity_id IS NULL AND is_promoter = FALSE;

CREATE INDEX IF NOT EXISTS idx_sast_preliminary
  ON sast_filings(filing_date DESC)
  WHERE is_preliminary = TRUE;


-- ─────────────────────────────────────────────────────────────
-- SECTION 4: MATERIALIZED VIEW REFRESH LOG
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mv_refresh_log (
  view_name   TEXT NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms  INT,
  rows_count   BIGINT,
  triggered_by TEXT DEFAULT 'manual',
  PRIMARY KEY (view_name, refreshed_at)
);

CREATE INDEX IF NOT EXISTS idx_mv_refresh_log_view
  ON mv_refresh_log(view_name, refreshed_at DESC);


-- ─────────────────────────────────────────────────────────────
-- SECTION 5: IPO ALERTS TABLE
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
  UNIQUE(email, ipo_id)
);

CREATE INDEX IF NOT EXISTS idx_ipo_alerts_ipo_active
  ON ipo_alerts(ipo_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_ipo_alerts_email_active
  ON ipo_alerts(email) WHERE is_active = TRUE;


-- ─────────────────────────────────────────────────────────────
-- SECTION 6: IPO FUNDAMENTALS TABLE
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
  data_source       TEXT DEFAULT 'manual',
  data_notes        TEXT,
  last_updated      TIMESTAMPTZ DEFAULT NOW()
);
