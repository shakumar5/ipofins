/**
 * TER lookup for fund holdings pages (disk export + DB load).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadFundTerBySlugFromDisk(root = process.cwd()) {
  for (const sub of ['public/data', 'dist/data']) {
    const path = join(root, sub, 'fund-ter-by-slug.json');
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

/** Load direct + regular TER per funds.slug from Neon. */
export async function loadFundTerBySlugFromDb(sql) {
  const rows = await sql`
    SELECT
      f.slug,
      f.expense_ratio AS direct_ter,
      f_regular.expense_ratio AS regular_ter
    FROM funds f
    LEFT JOIN funds f_regular
      ON f_regular.slug = regexp_replace(f.slug, '-direct-plan$', '')
      AND f_regular.id <> f.id
      AND f_regular.is_active = true
    WHERE f.is_active = true
      AND (
        f.expense_ratio IS NOT NULL
        OR f_regular.expense_ratio IS NOT NULL
      )
  `;

  const out = {};
  for (const row of rows) {
    const slug = String(row.slug);
    const direct =
      row.direct_ter != null && Number.isFinite(Number(row.direct_ter))
        ? Number(row.direct_ter)
        : null;
    const regular =
      row.regular_ter != null && Number.isFinite(Number(row.regular_ter))
        ? Number(row.regular_ter)
        : null;
    if (direct == null && regular == null) continue;
    out[slug] = { expenseRatio: direct, expenseRatioRegular: regular };
  }
  return out;
}

export function writeFundTerBySlugExport(root, terBySlug) {
  const path = join(root, 'public', 'data', 'fund-ter-by-slug.json');
  writeFileSync(path, JSON.stringify(terBySlug));
  return path;
}

function baseSlug(slug) {
  return String(slug).replace(/-direct-plan$/, '');
}

/** Apply TER map to a fund holdings index row (direct-plan + base slug aliases). */
export function applyTerToFundRow(row, terBySlug) {
  if (!row || !terBySlug || !Object.keys(terBySlug).length) return row;
  const candidates = [row.slug, baseSlug(row.slug), `${baseSlug(row.slug)}-direct-plan`];
  for (const slug of candidates) {
    const hit = terBySlug[slug];
    if (!hit) continue;
    return {
      ...row,
      expenseRatio: hit.expenseRatio ?? row.expenseRatio ?? null,
      expenseRatioRegular: hit.expenseRatioRegular ?? row.expenseRatioRegular ?? null,
    };
  }
  return row;
}

export function enrichHoldingsIndexWithTer(index, terBySlug) {
  if (!index?.length || !terBySlug || !Object.keys(terBySlug).length) return index;
  return index.map((row) => applyTerToFundRow(row, terBySlug));
}
