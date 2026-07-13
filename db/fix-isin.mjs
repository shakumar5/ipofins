/**
 * Enforce tiered unique listing identity on stocks:
 *   ISIN → else NSE → else BSE
 *
 * Run after dedupe if duplicate groups remain:
 *   node --use-system-ca db/seed/dedupe-stocks-canonical.mjs
 *   node --use-system-ca db/fix-isin.mjs
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbUrl = readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

async function refuseIfDups(label, rows) {
  if (!rows.length) return;
  console.error(`Refuse to add UNIQUE — duplicate ${label} groups remain. Run:`);
  console.error('  node --use-system-ca db/seed/dedupe-stocks-canonical.mjs');
  for (const d of rows) console.error(`  ${d.key} ×${d.cnt}`);
  process.exit(1);
}

await refuseIfDups(
  'ISIN',
  await sql`
    SELECT UPPER(TRIM(isin)) AS key, COUNT(*)::int AS cnt
    FROM stocks
    WHERE NULLIF(TRIM(isin), '') IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) > 1 LIMIT 5
  `,
);
await refuseIfDups(
  'NSE (no ISIN)',
  await sql`
    SELECT UPPER(TRIM(nse_symbol)) AS key, COUNT(*)::int AS cnt
    FROM stocks
    WHERE NULLIF(TRIM(isin), '') IS NULL
      AND NULLIF(TRIM(nse_symbol), '') IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) > 1 LIMIT 5
  `,
);
await refuseIfDups(
  'BSE (no ISIN/NSE)',
  await sql`
    SELECT TRIM(bse_code) AS key, COUNT(*)::int AS cnt
    FROM stocks
    WHERE NULLIF(TRIM(isin), '') IS NULL
      AND NULLIF(TRIM(nse_symbol), '') IS NULL
      AND NULLIF(TRIM(bse_code), '') IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) > 1 LIMIT 5
  `,
);

await sql`
  UPDATE stocks SET isin = NULLIF(UPPER(TRIM(isin)), '')
  WHERE isin IS DISTINCT FROM NULLIF(UPPER(TRIM(isin)), '')
`;
await sql`
  UPDATE stocks SET nse_symbol = NULLIF(UPPER(TRIM(nse_symbol)), '')
  WHERE nse_symbol IS DISTINCT FROM NULLIF(UPPER(TRIM(nse_symbol)), '')
`;
await sql`
  UPDATE stocks SET bse_code = NULLIF(TRIM(bse_code), '')
  WHERE bse_code IS DISTINCT FROM NULLIF(TRIM(bse_code), '')
`;

await sql`DROP INDEX IF EXISTS idx_stocks_isin_nonunique`;
await sql`DROP INDEX IF EXISTS idx_stocks_isin`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS stocks_isin_unique
  ON stocks (isin)
  WHERE isin IS NOT NULL
`;
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS stocks_nse_unique_no_isin
  ON stocks (nse_symbol)
  WHERE isin IS NULL AND nse_symbol IS NOT NULL
`;
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS stocks_bse_unique_no_isin_nse
  ON stocks (bse_code)
  WHERE isin IS NULL AND nse_symbol IS NULL AND bse_code IS NOT NULL
`;

console.log('✅ Unique listing identity:');
console.log('   stocks_isin_unique');
console.log('   stocks_nse_unique_no_isin (ISIN null)');
console.log('   stocks_bse_unique_no_isin_nse (ISIN+NSE null)');
