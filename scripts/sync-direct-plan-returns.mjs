/**
 * Copy fund_returns from base slug rows to matching Direct Plan rows.
 * Fixes cases where returns exist on "nippon-india-taiwan-equity-fund" but not
 * on "nippon-india-taiwan-equity-fund-direct-plan".
 *
 * Usage: node scripts/sync-direct-plan-returns.mjs
 */
import { sql, isDbConfigured } from './lib/db.mjs';

if (!isDbConfigured()) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const result = await sql`
  INSERT INTO fund_returns (fund_id, returns_1y, returns_3y, returns_5y, last_computed)
  SELECT
    f_direct.id,
    fr_base.returns_1y,
    fr_base.returns_3y,
    fr_base.returns_5y,
    fr_base.last_computed
  FROM funds f_direct
  INNER JOIN funds f_base
    ON f_base.slug = regexp_replace(f_direct.slug, '-direct-plan$', '')
    AND f_base.id <> f_direct.id
  INNER JOIN fund_returns fr_base ON fr_base.fund_id = f_base.id
  LEFT JOIN fund_returns fr_direct ON fr_direct.fund_id = f_direct.id
  WHERE f_direct.is_active = true
    AND f_direct.slug LIKE '%-direct-plan'
    AND fr_direct.fund_id IS NULL
    AND (
      fr_base.returns_1y IS NOT NULL
      OR fr_base.returns_3y IS NOT NULL
      OR fr_base.returns_5y IS NOT NULL
    )
  ON CONFLICT (fund_id) DO UPDATE SET
    returns_1y = COALESCE(fund_returns.returns_1y, EXCLUDED.returns_1y),
    returns_3y = COALESCE(fund_returns.returns_3y, EXCLUDED.returns_3y),
    returns_5y = COALESCE(fund_returns.returns_5y, EXCLUDED.returns_5y),
    last_computed = COALESCE(fund_returns.last_computed, EXCLUDED.last_computed)
  RETURNING fund_id
`;

console.log(`Synced returns for ${result.length} Direct Plan fund(s).`);

const taiwan = await sql`
  SELECT f.name, f.slug, fr.returns_1y, fr.returns_3y
  FROM funds f
  JOIN fund_returns fr ON fr.fund_id = f.id
  WHERE f.slug = 'nippon-india-taiwan-equity-fund-direct-plan'
`;
console.log('Taiwan Direct Plan:', taiwan[0]);
