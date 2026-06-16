-- ═══════════════════════════════════════════════════════════════
-- Finverse — Materialized Views
-- Migration 003: Pre-computed views for dashboard speed
-- Refresh these after each monthly data load
-- ═══════════════════════════════════════════════════════════════

-- Top smart money picks (latest month, all categories)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_smart_money_latest AS
SELECT 
  s.id AS stock_id,
  s.name AS stock_name,
  s.slug AS stock_slug,
  s.isin,
  sec.name AS sector,
  s.market_cap_category,
  sig.month,
  sig.category AS fund_category,
  sig.total_funds_holding,
  sig.fresh_entries,
  sig.complete_exits,
  sig.increased_count,
  sig.decreased_count,
  sig.net_quantity_change,
  sig.total_value_held,
  sig.avg_pct_allocation,
  sig.conviction_score
FROM stock_signals sig
JOIN stocks s ON s.id = sig.stock_id
LEFT JOIN sectors sec ON sec.id = s.sector_id
WHERE sig.month = (SELECT MAX(month) FROM stock_signals)
ORDER BY sig.category, sig.conviction_score DESC;

-- AMC top holdings (latest month)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_amc_top_holdings AS
SELECT 
  a.id AS amc_id,
  a.name AS amc_name,
  a.slug AS amc_slug,
  s.name AS stock_name,
  s.slug AS stock_slug,
  s.isin,
  fh.month,
  COUNT(DISTINCT fh.fund_id) AS funds_holding,
  SUM(fh.market_value) AS total_value,
  AVG(fh.pct_to_nav) AS avg_allocation
FROM fund_holdings fh
JOIN funds f ON f.id = fh.fund_id
JOIN amcs a ON a.id = f.amc_id
JOIN stocks s ON s.id = fh.stock_id
WHERE fh.month = (SELECT MAX(month) FROM fund_holdings)
GROUP BY a.id, a.name, a.slug, s.name, s.slug, s.isin, fh.month
ORDER BY a.name, total_value DESC;

-- Sector rotation (last 6 months)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_sector_rotation AS
SELECT 
  sec.name AS sector_name,
  sec.slug AS sector_slug,
  sa.month,
  sa.category,
  sa.total_value,
  sa.pct_of_total_equity,
  sa.fund_count,
  sa.mom_change
FROM sector_allocations sa
JOIN sectors sec ON sec.id = sa.sector_id
WHERE sa.month >= (SELECT MAX(month) - INTERVAL '6 months' FROM sector_allocations)
ORDER BY sa.month DESC, sa.total_value DESC;

-- Fund accumulation trends (stocks with growing fund count)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_accumulation_trends AS
SELECT
  s.name AS stock_name,
  s.slug AS stock_slug,
  sig_curr.category,
  sig_curr.month AS current_month,
  sig_curr.total_funds_holding AS current_funds,
  sig_prev.total_funds_holding AS prev_funds,
  sig_curr.total_funds_holding - COALESCE(sig_prev.total_funds_holding, 0) AS funds_change,
  sig_curr.conviction_score
FROM stock_signals sig_curr
LEFT JOIN stock_signals sig_prev 
  ON sig_prev.stock_id = sig_curr.stock_id 
  AND sig_prev.category = sig_curr.category
  AND sig_prev.month = (sig_curr.month - INTERVAL '1 month')::DATE
JOIN stocks s ON s.id = sig_curr.stock_id
WHERE sig_curr.month = (SELECT MAX(month) FROM stock_signals)
  AND sig_curr.total_funds_holding > sig_prev.total_funds_holding
ORDER BY sig_curr.category, (sig_curr.total_funds_holding - COALESCE(sig_prev.total_funds_holding, 0)) DESC;

-- ═══════════════════════════════════════════════════════════════
-- REFRESH FUNCTION (call after monthly data load)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION refresh_all_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_smart_money_latest;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_amc_top_holdings;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sector_rotation;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_accumulation_trends;
END;
$$ LANGUAGE plpgsql;

-- Unique indexes required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_smart_money_pk 
  ON mv_smart_money_latest(stock_id, fund_category);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_amc_holdings_pk 
  ON mv_amc_top_holdings(amc_id, stock_slug, month);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_sector_rotation_pk 
  ON mv_sector_rotation(sector_slug, month, category);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_accumulation_pk 
  ON mv_accumulation_trends(stock_slug, category, current_month);
