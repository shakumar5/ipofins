#!/usr/bin/env node
/**
 * Smoke test: per-entity latest quarter must not zero out portfolio when holdings exist.
 */
import assert from 'node:assert/strict';
import { sql } from './lib/db.mjs';

if (!sql) {
  console.log('verify-si-live-stats: skipped (no DATABASE_URL)');
  process.exit(0);
}

const rows = await sql`
  WITH entity_quarter AS (
    SELECT
      te.id AS entity_id,
      te.slug,
      COALESCE(
        (SELECT MAX(eh.quarter)
         FROM entity_holdings eh
         WHERE eh.entity_id = te.id AND eh.strategy_id IS NULL),
        (SELECT MAX(sph.quarter)
         FROM shareholding_pattern_holders sph
         WHERE sph.entity_id = te.id
           AND sph.is_promoter = FALSE
           AND sph.pct_of_company >= 1.0
           AND COALESCE(sph.match_confidence, 0) >= 0.85)
      ) AS quarter
    FROM tracked_entities te
    WHERE te.slug = 'akash-bhansali'
  )
  SELECT
    eq.slug,
    eq.quarter,
    COALESCE(
      NULLIF(eh_live.cnt, 0),
      sph_live.cnt,
      NULLIF(eqs.total_holdings, 0),
      0
    ) AS total_holdings,
    COALESCE(
      NULLIF(eh_live.value_cr, 0),
      sph_live.value_cr,
      NULLIF(eqs.portfolio_value_cr, 0)
    ) AS portfolio_value_cr
  FROM entity_quarter eq
  LEFT JOIN entity_quarterly_stats eqs
    ON eqs.entity_id = eq.entity_id
   AND eqs.strategy_id IS NULL
   AND eqs.quarter = eq.quarter
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt, ROUND(SUM(eh.market_value_cr)::numeric, 2) AS value_cr
    FROM entity_holdings eh
    WHERE eh.entity_id = eq.entity_id AND eh.strategy_id IS NULL AND eh.quarter = eq.quarter
  ) eh_live ON eq.quarter IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS cnt,
      ROUND(SUM(COALESCE(sph.shares, 0) * sqp.close_price / 1e7)::numeric, 2) AS value_cr
    FROM shareholding_pattern_holders sph
    LEFT JOIN stock_quarter_prices sqp
      ON sqp.stock_id = sph.stock_id AND sqp.quarter = sph.quarter
    WHERE sph.entity_id = eq.entity_id
      AND sph.is_promoter = FALSE
      AND sph.pct_of_company >= 1.0
      AND COALESCE(sph.match_confidence, 0) >= 0.85
      AND sph.quarter = eq.quarter
  ) sph_live ON eq.quarter IS NOT NULL
`;

const akash = rows[0];
assert.ok(akash, 'akash-bhansali row missing');
assert.ok(Number(akash.total_holdings) > 0, `expected holdings > 0, got ${akash.total_holdings}`);
assert.ok(Number(akash.portfolio_value_cr) > 0, `expected portfolio > 0, got ${akash.portfolio_value_cr}`);
console.log('verify-si-live-stats: ok', akash);
