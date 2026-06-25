-- ═══════════════════════════════════════════════════════════════
-- Finverse — Super Investor Materialized Views
-- Migration 006
-- Run: psql $DATABASE_URL -f db/migrations/006_super_investor_views.sql
--
-- Pre-computed views backing the dashboards. Refresh after each quarterly
-- data load by calling refresh_super_investor_views(). Mirrors the pattern
-- established in 003_materialized_views.sql (CONCURRENTLY refresh requires
-- unique indexes, declared at the bottom).
-- ═══════════════════════════════════════════════════════════════

-- Latest-quarter super-investor portfolio rollup (one row per entity)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_super_investor_latest AS
SELECT
  te.id            AS entity_id,
  te.slug,
  te.display_name,
  te.name,
  te.type,
  te.tier,
  te.focus,
  eqs.total_holdings,
  eqs.portfolio_value_cr,
  eqs.top5_concentration,
  eqs.large_cap_pct,
  eqs.mid_cap_pct,
  eqs.small_cap_pct,
  eqs.quarter
FROM tracked_entities te
LEFT JOIN entity_quarterly_stats eqs
  ON eqs.entity_id = te.id
 AND eqs.strategy_id IS NULL
 AND eqs.quarter = (SELECT MAX(quarter) FROM entity_quarterly_stats)
WHERE te.type IN ('individual', 'family_office', 'fii', 'dii')
  AND te.is_active = TRUE
ORDER BY eqs.portfolio_value_cr DESC NULLS LAST;

-- Latest-quarter stock-level smart-money signal from curated entities
-- (drives most-held, most-bought, conviction scoreboard, new-entry radar)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_entity_signal_latest AS
SELECT
  s.id    AS stock_id,
  s.name  AS stock_name,
  s.slug  AS stock_slug,
  s.isin,
  sec.name AS sector,
  s.market_cap_category,
  ess.quarter,
  ess.investors_holding,
  ess.fresh_entries,
  ess.complete_exits,
  ess.increased_count,
  ess.decreased_count,
  ess.net_value_change,
  ess.total_value_held,
  ess.conviction_score
FROM entity_stock_signals ess
JOIN stocks s   ON s.id = ess.stock_id
LEFT JOIN sectors sec ON sec.id = s.sector_id
WHERE ess.quarter = (SELECT MAX(quarter) FROM entity_stock_signals)
ORDER BY ess.conviction_score DESC NULLS LAST;

-- 1% Club: every non-promoter ≥1% holder in the latest quarter.
-- entity_id NULL = unmatched mystery holder (still surfaced in the discovery UI).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_one_percent_club_latest AS
SELECT
  sph.id,
  s.id   AS stock_id,
  s.name AS stock_name,
  s.slug AS stock_slug,
  sph.holder_name,
  sph.holder_type,
  sph.shares,
  sph.pct_of_company,
  sph.entity_id,
  sph.match_confidence,
  sph.quarter
FROM shareholding_pattern_holders sph
JOIN stocks s ON s.id = sph.stock_id
WHERE sph.quarter = (SELECT MAX(quarter) FROM shareholding_pattern_holders)
  AND sph.is_promoter = FALSE
  AND sph.pct_of_company >= 1.0
ORDER BY sph.pct_of_company DESC;

-- Trending entities: most active movers in the latest quarter
-- (count of non-unchanged changes → who made the most moves)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_trending_entities AS
SELECT
  te.id   AS entity_id,
  te.slug,
  te.display_name,
  te.name,
  te.type,
  ec.quarter,
  SUM(CASE WHEN ec.change_type = 'fresh_entry'   THEN 1 ELSE 0 END) AS fresh_entries,
  SUM(CASE WHEN ec.change_type = 'complete_exit' THEN 1 ELSE 0 END) AS exits,
  SUM(CASE WHEN ec.change_type = 'increased'     THEN 1 ELSE 0 END) AS adds,
  SUM(CASE WHEN ec.change_type = 'decreased'     THEN 1 ELSE 0 END) AS trims,
  COUNT(*) AS total_moves
FROM entity_changes ec
JOIN tracked_entities te ON te.id = ec.entity_id
WHERE ec.quarter = (SELECT MAX(quarter) FROM entity_changes)
  AND ec.change_type != 'unchanged'
GROUP BY te.id, te.slug, te.display_name, te.name, te.type, ec.quarter
ORDER BY total_moves DESC;

-- ═══════════════════════════════════════════════════════════════
-- REFRESH FUNCTION (call after each quarterly data load + weekly SAST sweep)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION refresh_super_investor_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_super_investor_latest;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_entity_signal_latest;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_one_percent_club_latest;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trending_entities;
END;
$$ LANGUAGE plpgsql;

-- Unique indexes required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_si_latest_pk
  ON mv_super_investor_latest(entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_entity_signal_pk
  ON mv_entity_signal_latest(stock_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_1pc_club_pk
  ON mv_one_percent_club_latest(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trending_pk
  ON mv_trending_entities(entity_id, quarter);
