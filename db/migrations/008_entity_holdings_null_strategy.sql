-- Fix duplicate entity_holdings / entity_changes rows when strategy_id IS NULL.
-- PostgreSQL treats NULL as distinct in the 005 UNIQUE constraints, so re-runs
-- inserted duplicate rows and UI joins multiplied them (2×2 = 4 identical lines).

-- ── Dedupe entity_holdings (keep newest id per entity + stock + quarter) ──
DELETE FROM entity_holdings eh
USING entity_holdings eh2
WHERE eh.strategy_id IS NULL
  AND eh2.strategy_id IS NULL
  AND eh.entity_id = eh2.entity_id
  AND eh.stock_id = eh2.stock_id
  AND eh.quarter = eh2.quarter
  AND eh.id > eh2.id;

-- ── Dedupe entity_changes (keep one row per entity + stock + quarter) ──
DELETE FROM entity_changes ec
USING entity_changes ec2
WHERE ec.strategy_id IS NULL
  AND ec2.strategy_id IS NULL
  AND ec.entity_id = ec2.entity_id
  AND ec.stock_id = ec2.stock_id
  AND ec.quarter = ec2.quarter
  AND ec.ctid > ec2.ctid;

-- ── NULLS NOT DISTINCT unique indexes (mirrors migration 007) ──
ALTER TABLE entity_holdings DROP CONSTRAINT IF EXISTS entity_holdings_entity_id_strategy_id_stock_id_quarter_key;
DROP INDEX IF EXISTS entity_holdings_entity_strategy_stock_quarter_uniq;
CREATE UNIQUE INDEX entity_holdings_entity_strategy_stock_quarter_uniq
  ON entity_holdings (entity_id, strategy_id, stock_id, quarter) NULLS NOT DISTINCT;

ALTER TABLE entity_changes DROP CONSTRAINT IF EXISTS entity_changes_entity_id_strategy_id_stock_id_quarter_key;
DROP INDEX IF EXISTS entity_changes_entity_strategy_stock_quarter_uniq;
CREATE UNIQUE INDEX entity_changes_entity_strategy_stock_quarter_uniq
  ON entity_changes (entity_id, strategy_id, stock_id, quarter) NULLS NOT DISTINCT;
