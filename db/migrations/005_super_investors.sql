-- ═══════════════════════════════════════════════════════════════
-- Finverse — Super Investors, 1% Club, PMS, AIF/SIF Schema
-- Migration 005
-- Run: psql $DATABASE_URL -f db/migrations/005_super_investors.sql
--
-- Design principles:
--   • Additive only — no ALTER to existing 001/004 tables (zero regression risk).
--   • Promoters are EXCLUDED everywhere by filtering on holder_type; never
--     stored as curated entities. See shareholding_pattern_holders.is_promoter.
--   • One unified tracked_entities table backs 4 route products:
--       /super-investors   (individual, family_office, fii, dii)
--       /1-percent-club    (raw uncurated ≥1% holders)
--       /pms               (pms providers + their strategies)
--       /alternative-funds (aif cat I/II/III + sif — one vertical, two tabs)
--   • Quarter grain matches the SEBI disclosure reality (Shareholding Pattern
--     is filed quarterly; SAST Form B is event-driven intra-quarter).
--   • SAST-sourced interim holdings are flagged source='sast' and marked
--     is_preliminary until the next quarterly filing confirms them.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. CURATED ENTITIES (the unified master table)
-- ═══════════════════════════════════════════════════════════════
-- One row per tracked investor / fund / PMS provider / AIF / SIF.
-- The `type` column is the universal filter that powers the 4 route products.

CREATE TABLE IF NOT EXISTS tracked_entities (
  id               SERIAL PRIMARY KEY,
  name             TEXT UNIQUE NOT NULL,
  slug             TEXT UNIQUE NOT NULL,
  display_name     TEXT,
  -- Universal classifier — drives route membership:
  --   individual | family_office | fii | dii | pms | aif | sif
  type             VARCHAR(20) NOT NULL,
  -- Style tier for individuals only (legendary/active/emerging); NULL for funds
  tier             VARCHAR(20),
  -- Name variants seen in filings, for fuzzy matching at ingest time.
  -- e.g. "Khanna Dolly", "Dolly Khanna HUF" all roll up to one entity.
  aliases          TEXT[] DEFAULT '{}',
  focus            TEXT,                          -- "Small/mid-cap consumer"
  bio              TEXT,
  location         TEXT,
  website          TEXT,
  photo            TEXT,                          -- path under /public or NULL
  -- Regulated-vehicle fields (PMS/AIF/SIF only; NULL for individuals)
  registration_id  TEXT,                          -- SEBI PMS/IN-AIF reg number
  aum_cr           NUMERIC(14,2),                 -- reported AUM (₹ Cr)
  fee_structure    TEXT,                          -- "2% + 1% hurdle"
  parent_org       TEXT,                          -- "Marcellus Investment Managers"
  is_active        BOOLEAN DEFAULT TRUE,
  tracked_since    DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_te_type        ON tracked_entities(type);
CREATE INDEX IF NOT EXISTS idx_te_type_active ON tracked_entities(type, is_active);

-- Editorial style tags (many-to-many). e.g. "contrarian", "growth", "small-cap".
CREATE TABLE IF NOT EXISTS tracked_entity_tags (
  entity_id INT REFERENCES tracked_entities(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  PRIMARY KEY (entity_id, tag)
);

-- PMS / SIF strategies — sub-portfolios under a provider.
-- AIFs usually track at fund level only (strategy_id stays NULL).
CREATE TABLE IF NOT EXISTS entity_strategies (
  id            SERIAL PRIMARY KEY,
  entity_id     INT REFERENCES tracked_entities(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,               -- "Little Champs", "Consistent Compounders"
  slug          TEXT UNIQUE NOT NULL,
  strategy_type TEXT,                        -- large-cap/mid-small/multi/thematic
  min_ticket_cr NUMERIC(10,2),
  description   TEXT,
  UNIQUE(entity_id, name)
);

-- ═══════════════════════════════════════════════════════════════
-- 2. RAW DISCLOSURE DATA — powers the 1% Club
-- ═══════════════════════════════════════════════════════════════
-- Every ≥1% holder parsed from every Shareholding Pattern filing, unfiltered.
-- entity_id is NULL until a curated match is found; unmatched rows still show
-- in /1-percent-club (the discovery layer).
--
-- PROMOTERS live here too (is_promoter = TRUE) so we can compute "% held by
-- promoters" on stock pages, but they are EXCLUDED from curated entity views
-- and from super-investor/alternative-funds features by filter convention.

CREATE TABLE IF NOT EXISTS shareholding_pattern_holders (
  id             BIGSERIAL PRIMARY KEY,
  stock_id       INT REFERENCES stocks(id),
  quarter        DATE NOT NULL,              -- first day of disclosure quarter
  holder_name    TEXT NOT NULL,              -- raw name exactly as filed
  holder_type    VARCHAR(20) NOT NULL,       -- promoter/public/fii/dii/individual/unknown
  shares         BIGINT,
  pct_of_company NUMERIC(6,3),
  source         VARCHAR(30) DEFAULT 'shareholding_pattern',
  source_url     TEXT,
  is_promoter    BOOLEAN DEFAULT FALSE,      -- TRUE → excluded from curated views
  -- Link to curated entity once matched; NULL = unmatched (shown only in 1% Club)
  entity_id      INT REFERENCES tracked_entities(id),
  -- Match confidence 0..1 from the name-resolution step. NULL for promoter rows.
  match_confidence NUMERIC(4,3),
  UNIQUE(stock_id, holder_name, quarter)
);

CREATE INDEX IF NOT EXISTS idx_sph_quarter  ON shareholding_pattern_holders(quarter DESC);
CREATE INDEX IF NOT EXISTS idx_sph_stock    ON shareholding_pattern_holders(stock_id, quarter DESC);
CREATE INDEX IF NOT EXISTS idx_sph_holder   ON shareholding_pattern_holders(holder_name);
CREATE INDEX IF NOT EXISTS idx_sph_entity   ON shareholding_pattern_holders(entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sph_non_prom ON shareholding_pattern_holders(quarter DESC, is_promoter) WHERE is_promoter = FALSE;

-- SAST Form B (Substantial Acquisition) — event-driven intra-quarter filings.
-- Captured continuously; rows marked is_preliminary until quarterly filing confirms.
CREATE TABLE IF NOT EXISTS sast_filings (
  id             BIGSERIAL PRIMARY KEY,
  stock_id       INT REFERENCES stocks(id),
  entity_id      INT REFERENCES tracked_entities(id),
  -- Raw filer name (entity_id may be NULL if no curated match yet)
  filer_name     TEXT NOT NULL,
  filer_type     VARCHAR(20) NOT NULL,       -- promoter/public/fii/dii/individual
  filing_date    DATE NOT NULL,
  post_shares    BIGINT,                     -- shares held after the transaction
  post_pct       NUMERIC(6,3),               -- % of company after the transaction
  pre_pct        NUMERIC(6,3),
  transaction_nature TEXT,                   -- acquisition/disposal
  source_url     TEXT,
  is_preliminary BOOLEAN DEFAULT TRUE,       -- cleared when quarterly filing lands
  UNIQUE(stock_id, filer_name, filing_date)
);

CREATE INDEX IF NOT EXISTS idx_sast_date     ON sast_filings(filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_sast_entity   ON sast_filings(entity_id, filing_date DESC) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sast_stock    ON sast_filings(stock_id, filing_date DESC);

-- ═══════════════════════════════════════════════════════════════
-- 3. CURATED HOLDINGS (one row per entity + stock + quarter)
-- ═══════════════════════════════════════════════════════════════
-- Populated by (a) matching shareholding_pattern_holders → tracked_entities,
-- and (b) provider disclosures for PMS/AIF/SIF. Mirrors fund_holdings shape.

CREATE TABLE IF NOT EXISTS entity_holdings (
  id              BIGSERIAL PRIMARY KEY,
  entity_id       INT REFERENCES tracked_entities(id) ON DELETE CASCADE,
  strategy_id     INT REFERENCES entity_strategies(id) ON DELETE CASCADE,  -- PMS/SIF only
  stock_id        INT REFERENCES stocks(id),
  quarter         DATE NOT NULL,             -- first day of disclosure quarter
  shares_held     BIGINT,
  pct_of_company  NUMERIC(6,3),
  market_value_cr NUMERIC(14,2),             -- computed from quarter-end price
  is_encumbered   BOOLEAN DEFAULT FALSE,     -- pledged shares
  source          VARCHAR(30) NOT NULL,      -- shareholding_pattern/sast/pms_disclosure/aif_disclosure/sif_disclosure
  source_url      TEXT,
  -- TRUE when sourced from SAST before the quarterly filing confirms it.
  is_preliminary  BOOLEAN DEFAULT FALSE,
  UNIQUE(entity_id, strategy_id, stock_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_eh_quarter      ON entity_holdings(quarter DESC);
CREATE INDEX IF NOT EXISTS idx_eh_entity_q     ON entity_holdings(entity_id, quarter DESC);
CREATE INDEX IF NOT EXISTS idx_eh_stock_q      ON entity_holdings(stock_id, quarter DESC);
CREATE INDEX IF NOT EXISTS idx_eh_strategy     ON entity_holdings(strategy_id, quarter DESC) WHERE strategy_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 4. QUARTER-OVER-QUARTER CHANGES (computed, mirrors holdings_changes)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entity_changes (
  entity_id        INT REFERENCES tracked_entities(id) ON DELETE CASCADE,
  strategy_id      INT REFERENCES entity_strategies(id) ON DELETE CASCADE,
  stock_id         INT REFERENCES stocks(id),
  quarter          DATE NOT NULL,
  prev_quarter     DATE,
  change_type      VARCHAR(20) NOT NULL,     -- fresh_entry/complete_exit/increased/decreased/unchanged/partial_exit
  prev_shares      BIGINT,
  new_shares       BIGINT,
  qty_change       BIGINT,
  pct_change       NUMERIC(8,3),
  value_change_cr  NUMERIC(14,2),
  UNIQUE(entity_id, strategy_id, stock_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_ec_entity_q   ON entity_changes(entity_id, quarter DESC);
CREATE INDEX IF NOT EXISTS idx_ec_type_q     ON entity_changes(change_type, quarter DESC);
CREATE INDEX IF NOT EXISTS idx_ec_stock_q    ON entity_changes(stock_id, quarter DESC);

-- ═══════════════════════════════════════════════════════════════
-- 5. AGGREGATE STOCK-LEVEL SIGNALS
-- ═══════════════════════════════════════════════════════════════
-- Mirrors stock_signals (smart money) but scoped to curated entities.
-- Powers: most-held, most-bought, conviction scoreboard.

CREATE TABLE IF NOT EXISTS entity_stock_signals (
  stock_id          INT REFERENCES stocks(id),
  quarter           DATE NOT NULL,
  investors_holding INT DEFAULT 0,
  fresh_entries     INT DEFAULT 0,
  complete_exits    INT DEFAULT 0,
  increased_count   INT DEFAULT 0,
  decreased_count   INT DEFAULT 0,
  net_value_change  NUMERIC(16,2),           -- ₹Cr net flow this quarter
  total_value_held  NUMERIC(16,2),
  conviction_score  NUMERIC(5,2),            -- 0..100
  PRIMARY KEY (stock_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_ess_quarter      ON entity_stock_signals(quarter DESC);
CREATE INDEX IF NOT EXISTS idx_ess_conviction   ON entity_stock_signals(quarter DESC, conviction_score DESC);
CREATE INDEX IF NOT EXISTS idx_ess_net          ON entity_stock_signals(quarter DESC, net_value_change DESC);
CREATE INDEX IF NOT EXISTS idx_ess_fresh        ON entity_stock_signals(quarter DESC, fresh_entries DESC);

-- ═══════════════════════════════════════════════════════════════
-- 6. PER-ENTITY QUARTERLY PORTFOLIO STATS (precomputed)
-- ═══════════════════════════════════════════════════════════════
-- Mirrors amc_monthly_stats. Pre-aggregated so profile pages never compute live.

CREATE TABLE IF NOT EXISTS entity_quarterly_stats (
  entity_id          INT REFERENCES tracked_entities(id) ON DELETE CASCADE,
  strategy_id        INT REFERENCES entity_strategies(id) ON DELETE CASCADE,
  quarter            DATE NOT NULL,
  total_holdings     INT,
  portfolio_value_cr NUMERIC(16,2),
  top5_concentration NUMERIC(6,3),
  hhi                NUMERIC(8,3),           -- Herfindahl concentration index
  turnover_ratio     NUMERIC(6,3),
  large_cap_pct      NUMERIC(6,3),
  mid_cap_pct        NUMERIC(6,3),
  small_cap_pct      NUMERIC(6,3),
  PRIMARY KEY (entity_id, strategy_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_eqs_quarter ON entity_quarterly_stats(quarter DESC);

-- ═══════════════════════════════════════════════════════════════
-- 7. PAIRWISE ENTITY OVERLAP (computed, mirrors fund_overlaps)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entity_overlaps (
  entity_a_id INT REFERENCES tracked_entities(id) ON DELETE CASCADE,
  entity_b_id INT REFERENCES tracked_entities(id) ON DELETE CASCADE,
  quarter     DATE NOT NULL,
  overlap_pct NUMERIC(5,2),
  common_stocks INT,
  PRIMARY KEY (entity_a_id, entity_b_id, quarter),
  CHECK (entity_a_id < entity_b_id)
);

CREATE INDEX IF NOT EXISTS idx_eo_quarter ON entity_overlaps(quarter DESC);
CREATE INDEX IF NOT EXISTS idx_eo_a       ON entity_overlaps(entity_a_id, quarter DESC);
CREATE INDEX IF NOT EXISTS idx_eo_b       ON entity_overlaps(entity_b_id, quarter DESC);

-- ═══════════════════════════════════════════════════════════════
-- 8. PER-POSITION CONVICTION (computed)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entity_conviction (
  entity_id        INT REFERENCES tracked_entities(id) ON DELETE CASCADE,
  strategy_id      INT REFERENCES entity_strategies(id) ON DELETE CASCADE,
  stock_id         INT REFERENCES stocks(id),
  quarter          DATE NOT NULL,
  conviction       NUMERIC(5,2),            -- 0..100
  holding_quarters INT,                     -- duration in quarters
  trend            VARCHAR(10),             -- rising/falling/stable
  PRIMARY KEY (entity_id, strategy_id, stock_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_ecv_entity_q ON entity_conviction(entity_id, quarter DESC);
CREATE INDEX IF NOT EXISTS idx_ecv_stock_q  ON entity_conviction(stock_id, quarter DESC);

-- ═══════════════════════════════════════════════════════════════
-- 9. CORPORATE ACTIONS (splits/bonuses) — rebase history
-- ═══════════════════════════════════════════════════════════════
-- Populated from NSE/BSE corporate action feed. Used by the changes-compute
-- step to rebase historical share counts so splits don't show as phantom sells.

CREATE TABLE IF NOT EXISTS corporate_actions (
  id          BIGSERIAL PRIMARY KEY,
  stock_id    INT REFERENCES stocks(id),
  ex_date     DATE NOT NULL,
  action_type VARCHAR(20) NOT NULL,         -- split/bonus/consolidation
  ratio       TEXT,                          -- "2:1"
  -- Multiplier applied to pre-action historical share counts to rebase them.
  -- e.g. 2:1 split → historical_adj_factor = 2.0
  historical_adj_factor NUMERIC(10,4) DEFAULT 1.0,
  source_url  TEXT,
  UNIQUE(stock_id, ex_date, action_type)
);

CREATE INDEX IF NOT EXISTS idx_ca_stock ON corporate_actions(stock_id, ex_date DESC);

-- ═══════════════════════════════════════════════════════════════
-- 10. PIPELINE RUN LOG — for /health dashboard + automated alerting
-- ═══════════════════════════════════════════════════════════════
-- Every pipeline run inserts a row here. The /health page reads from it;
-- automated alerts fire when a quarterly run hasn't succeeded within 35 days
-- of quarter-end.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id            BIGSERIAL PRIMARY KEY,
  pipeline      VARCHAR(40) NOT NULL,       -- superinvestor/1pc-club/pms/altfunds/sast-sweep
  quarter       DATE,                       -- NULL for weekly SAST sweep
  status        VARCHAR(20) NOT NULL,       -- success/aborted/failed
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  rows_upserted INT DEFAULT 0,
  quality_gate  VARCHAR(20),                -- passed/failed/skipped
  message       TEXT,
  -- Snapshot of sanity-check counts for the /health dashboard trend chart.
  counts_json   JSONB
);

CREATE INDEX IF NOT EXISTS idx_pr_pipeline_status ON pipeline_runs(pipeline, started_at DESC);
