/**
 * Enforce ISIN uniqueness on stocks (ISIN = natural key).
 * Run after dedupe-stocks-canonical if any duplicate groups remain.
 *
 * Usage: node --use-system-ca db/fix-isin.mjs
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbUrl = readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const dups = await sql`
  SELECT UPPER(TRIM(isin)) AS isin, COUNT(*)::int AS cnt
  FROM stocks
  WHERE NULLIF(TRIM(isin), '') IS NOT NULL
  GROUP BY 1
  HAVING COUNT(*) > 1
  LIMIT 5
`;
if (dups.length) {
  console.error('Refuse to add UNIQUE — duplicate ISIN groups remain. Run:');
  console.error('  node --use-system-ca db/seed/dedupe-stocks-canonical.mjs');
  for (const d of dups) console.error(`  ${d.isin} ×${d.cnt}`);
  process.exit(1);
}

await sql`
  UPDATE stocks
  SET isin = NULLIF(UPPER(TRIM(isin)), '')
  WHERE isin IS DISTINCT FROM NULLIF(UPPER(TRIM(isin)), '')
`;

await sql`DROP INDEX IF EXISTS idx_stocks_isin_nonunique`;
await sql`DROP INDEX IF EXISTS idx_stocks_isin`;
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS stocks_isin_unique
  ON stocks (isin)
  WHERE isin IS NOT NULL
`;

console.log('✅ stocks.isin is UNIQUE (partial index stocks_isin_unique)');
