-- Allow entity-level rows (strategy_id IS NULL) in quarterly stats + conviction.
-- Super-investor holdings use strategy_id = NULL; PRIMARY KEY blocked NULL inserts.

ALTER TABLE entity_quarterly_stats ALTER COLUMN strategy_id DROP NOT NULL;
ALTER TABLE entity_quarterly_stats DROP CONSTRAINT IF EXISTS entity_quarterly_stats_pkey;
DROP INDEX IF EXISTS entity_quarterly_stats_entity_strategy_quarter_uniq;
CREATE UNIQUE INDEX entity_quarterly_stats_entity_strategy_quarter_uniq
  ON entity_quarterly_stats (entity_id, strategy_id, quarter) NULLS NOT DISTINCT;

ALTER TABLE entity_conviction ALTER COLUMN strategy_id DROP NOT NULL;
ALTER TABLE entity_conviction DROP CONSTRAINT IF EXISTS entity_conviction_pkey;
DROP INDEX IF EXISTS entity_conviction_entity_strategy_stock_quarter_uniq;
CREATE UNIQUE INDEX entity_conviction_entity_strategy_stock_quarter_uniq
  ON entity_conviction (entity_id, strategy_id, stock_id, quarter) NULLS NOT DISTINCT;
