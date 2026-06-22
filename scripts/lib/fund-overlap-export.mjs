/**
 * Export fund_overlaps (DB) → fund-overlap-index.json + fund-overlaps-by-fund.json
 * Slugs must match funds.slug used in getStaticPaths — not parser/holdings keys.
 */

/** @param {import('@neondatabase/serverless').NeonQueryFunction} sql */
export async function loadFundsWithOverlapsFromDb(sql) {
  const rows = await sql`
    SELECT DISTINCT f.slug, f.name
    FROM fund_overlaps fo
    JOIN funds f ON f.id IN (fo.fund_a_id, fo.fund_b_id)
    WHERE fo.month = (SELECT MAX(month) FROM fund_overlaps)
      AND EXISTS (
        SELECT 1 FROM fund_holdings fh
        WHERE fh.fund_id = f.id AND fh.month = fo.month
      )
    ORDER BY f.name
  `;
  return rows.map((r) => ({ slug: String(r.slug), name: String(r.name) }));
}

/** @param {import('@neondatabase/serverless').NeonQueryFunction} sql */
export async function loadAllFundOverlapsFromDb(sql) {
  const rows = await sql`
    SELECT
      f1.slug AS fund_slug,
      f2.name,
      f2.slug,
      fo.overlap_pct,
      fo.common_stocks,
      (
        SELECT COALESCE(array_agg(s.name ORDER BY s.name), ARRAY[]::text[])
        FROM fund_holdings fh_a
        JOIN fund_holdings fh_b
          ON fh_a.stock_id = fh_b.stock_id
          AND fh_a.month = fh_b.month
        JOIN stocks s ON s.id = fh_a.stock_id
        WHERE fh_a.fund_id = f1.id
          AND fh_b.fund_id = f2.id
          AND fh_a.month = fo.month
      ) AS common_stock_names
    FROM fund_overlaps fo
    JOIN funds f1 ON f1.id = fo.fund_a_id OR f1.id = fo.fund_b_id
    JOIN funds f2 ON (f2.id = fo.fund_a_id OR f2.id = fo.fund_b_id) AND f2.id != f1.id
    WHERE fo.month = (SELECT MAX(month) FROM fund_overlaps)
      AND EXISTS (
        SELECT 1 FROM fund_holdings fh
        WHERE fh.fund_id = f2.id AND fh.month = fo.month
      )
    ORDER BY f1.slug, fo.overlap_pct DESC
  `;

  const bySlug = {};
  for (const row of rows) {
    const fundSlug = String(row.fund_slug);
    if (!bySlug[fundSlug]) bySlug[fundSlug] = [];
    bySlug[fundSlug].push({
      name: String(row.name),
      slug: String(row.slug),
      overlap_pct: row.overlap_pct != null ? Number(row.overlap_pct) : null,
      common_stocks: Number(row.common_stocks ?? 0),
      common_stock_names: Array.isArray(row.common_stock_names)
        ? row.common_stock_names.map(String)
        : [],
    });
  }

  for (const list of Object.values(bySlug)) {
    list.sort((a, b) => (b.overlap_pct ?? 0) - (a.overlap_pct ?? 0));
  }

  return bySlug;
}
