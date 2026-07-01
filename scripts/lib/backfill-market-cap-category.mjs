/**
 * Derive stocks.market_cap_category from SHP + entity holdings market caps.
 * SEBI-style rank buckets: top 100 large, 101-250 mid, 251-500 small, rest micro.
 */

const MIN_MCAP_CR = 100;
const MAX_MCAP_CR = 50_000_000;

/**
 * @param {import('@neondatabase/serverless').NeonQueryFunction} sql
 * @returns {Promise<{ updated: number, large: number, mid: number, small: number, micro: number }>}
 */
export async function backfillMarketCapCategory(sql) {
  const stats = await sql`
    WITH stock_mcap AS (
      SELECT stock_id, MAX(mcap_cr) AS mcap_cr
      FROM (
        SELECT sph.stock_id,
          (sph.shares::numeric * sqp.close_price * 100.0 / NULLIF(sph.pct_of_company, 0)) / 1e7 AS mcap_cr
        FROM shareholding_pattern_holders sph
        JOIN LATERAL (
          SELECT close_price
          FROM stock_quarter_prices sqp
          WHERE sqp.stock_id = sph.stock_id
          ORDER BY quarter DESC
          LIMIT 1
        ) sqp ON true
        WHERE sph.shares > 0 AND sph.pct_of_company > 0

        UNION ALL

        SELECT eh.stock_id,
          eh.market_value_cr * 100.0 / NULLIF(eh.pct_of_company, 0) AS mcap_cr
        FROM entity_holdings eh
        WHERE eh.strategy_id IS NULL
          AND eh.market_value_cr > 0
          AND eh.pct_of_company > 0
      ) raw
      WHERE mcap_cr > ${MIN_MCAP_CR} AND mcap_cr < ${MAX_MCAP_CR}
      GROUP BY stock_id
    ),
    ranked AS (
      SELECT
        stock_id,
        mcap_cr,
        ROW_NUMBER() OVER (ORDER BY mcap_cr DESC) AS rnk
      FROM stock_mcap
    ),
    classified AS (
      SELECT
        stock_id,
        CASE
          WHEN rnk <= 100 THEN 'large'
          WHEN rnk <= 250 THEN 'mid'
          WHEN rnk <= 500 THEN 'small'
          ELSE 'micro'
        END AS category
      FROM ranked
    ),
    upd AS (
      UPDATE stocks s
      SET market_cap_category = c.category
      FROM classified c
      WHERE s.id = c.stock_id
        AND (s.market_cap_category IS DISTINCT FROM c.category)
      RETURNING c.category
    )
    SELECT
      COUNT(*)::int AS updated,
      COUNT(*) FILTER (WHERE category = 'large')::int AS large,
      COUNT(*) FILTER (WHERE category = 'mid')::int AS mid,
      COUNT(*) FILTER (WHERE category = 'small')::int AS small,
      COUNT(*) FILTER (WHERE category = 'micro')::int AS micro
    FROM upd
  `;

  const row = stats[0] ?? { updated: 0, large: 0, mid: 0, small: 0, micro: 0 };
  return {
    updated: Number(row.updated) || 0,
    large: Number(row.large) || 0,
    mid: Number(row.mid) || 0,
    small: Number(row.small) || 0,
    micro: Number(row.micro) || 0,
  };
}

/**
 * @param {import('@neondatabase/serverless').NeonQueryFunction} sql
 */
export async function ensureMarketCapCategories(sql) {
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM stocks
    WHERE market_cap_category IN ('large', 'mid', 'small', 'micro')
  `;
  if (count >= 100) return { skipped: true, classified: count };

  const result = await backfillMarketCapCategory(sql);
  const [{ count: after }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM stocks
    WHERE market_cap_category IN ('large', 'mid', 'small', 'micro')
  `;
  return { skipped: false, classified: after, ...result };
}
