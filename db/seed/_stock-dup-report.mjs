import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPgPool, closePgPool } from '../../scripts/lib/pg-bulk.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
process.env.DATABASE_URL = readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim();
async function main() {
  const pool = getPgPool();
  const q = async (sql) => (await pool.query(sql)).rows[0];
  const rows = [
    ['nse null, has ISIN', "SELECT COUNT(*)::int n FROM stocks WHERE NULLIF(TRIM(nse_symbol),'') IS NULL AND NULLIF(TRIM(isin),'') IS NOT NULL"],
    ['nse null, has BSE only', "SELECT COUNT(*)::int n FROM stocks WHERE NULLIF(TRIM(nse_symbol),'') IS NULL AND NULLIF(TRIM(bse_code),'') IS NOT NULL"],
    ['nse null, no isin/bse (junk)', "SELECT COUNT(*)::int n FROM stocks WHERE NULLIF(TRIM(nse_symbol),'') IS NULL AND NULLIF(TRIM(isin),'') IS NULL AND NULLIF(TRIM(bse_code),'') IS NULL"],
    ['true duplicate ISIN extra rows', "SELECT COALESCE(SUM(cnt-1),0)::int n FROM (SELECT UPPER(TRIM(isin)) k, COUNT(*) cnt FROM stocks WHERE NULLIF(TRIM(isin),'') IS NOT NULL GROUP BY k HAVING COUNT(*)>1) x"],
    ['true duplicate name extra rows', "SELECT COALESCE(SUM(cnt-1),0)::int n FROM (SELECT LOWER(TRIM(name)) k, COUNT(*) cnt FROM stocks GROUP BY k HAVING COUNT(*)>1) x"],
    ['with NSE symbol', "SELECT COUNT(*)::int n FROM stocks WHERE NULLIF(TRIM(nse_symbol),'') IS NOT NULL"],
  ];
  for (const [label, sql] of rows) console.log(label + ':', (await q(sql)).n);
  await closePgPool();
}
main().catch(async (e) => { await closePgPool().catch(() => {}); console.error(e.message); process.exit(1); });
