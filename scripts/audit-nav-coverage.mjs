/**
 * Diagnose NAV coverage: fund_navs vs funds table.
 * Run: node --use-system-ca scripts/audit-nav-coverage.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = neon(readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim());

const [counts] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM funds WHERE is_active) AS active_funds,
    (SELECT COUNT(*)::int FROM funds WHERE is_active AND scheme_code IS NOT NULL AND scheme_code != '') AS with_scheme_code,
    (SELECT COUNT(*)::int FROM fund_navs) AS nav_rows,
    (SELECT COUNT(DISTINCT fund_id)::int FROM fund_navs) AS funds_with_nav,
    (SELECT COUNT(*)::int FROM fund_returns) AS return_rows
`;

console.log('\n=== NAV coverage ===');
console.table(counts);

const [holdingsOnly] = await sql`
  SELECT COUNT(DISTINCT f.id)::int AS cnt
  FROM funds f
  JOIN fund_holdings fh ON fh.fund_id = f.id
  WHERE f.is_active
    AND NOT EXISTS (SELECT 1 FROM fund_navs fn WHERE fn.fund_id = f.id)
`;

console.log('Active funds with holdings but no NAV row:', holdingsOnly?.cnt ?? 0);

const sample = await sql`
  SELECT f.name, f.scheme_code, f.slug
  FROM funds f
  WHERE f.is_active
    AND NOT EXISTS (SELECT 1 FROM fund_navs fn WHERE fn.fund_id = f.id)
  LIMIT 8
`;
console.log('\nSample funds missing NAV:');
console.table(sample);
