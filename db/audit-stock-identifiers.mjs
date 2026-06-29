import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPgPool, closePgPool } from '../scripts/lib/pg-bulk.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.DATABASE_URL = readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim();
async function main() {
  const pool = getPgPool();
  const q = async (s) => (await pool.query(s)).rows[0].n;
  console.log('Total:', await q('SELECT COUNT(*)::int n FROM stocks'));
  console.log('Distinct ISIN:', await q('SELECT COUNT(DISTINCT UPPER(TRIM(isin)))::int n FROM stocks'));
  console.log('Dup ISIN groups:', await q(`SELECT COUNT(*)::int n FROM (SELECT UPPER(TRIM(isin)) FROM stocks GROUP BY 1 HAVING COUNT(*)>1) x`));
  console.log('NULL nse (this is likely your 2444):', await q("SELECT COUNT(*)::int n FROM stocks WHERE NULLIF(TRIM(nse_symbol),'') IS NULL"));
  console.log('Indian INE isin:', await q("SELECT COUNT(*)::int n FROM stocks WHERE UPPER(TRIM(isin)) LIKE 'INE%'"));
  console.log('Non-INE isin (foreign MF):', await q("SELECT COUNT(*)::int n FROM stocks WHERE UPPER(TRIM(isin)) NOT LIKE 'INE%'"));
  await closePgPool();
}
main().catch(async (e) => { await closePgPool().catch(() => {}); console.error(e.message); process.exit(1); });
