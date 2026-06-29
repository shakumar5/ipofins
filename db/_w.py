from pathlib import Path
js = r"""import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPgPool, closePgPool } from '../scripts/lib/pg-bulk.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.DATABASE_URL = readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim();

const MF_PLAN_FILTER = `
  name ~* '\\m(direct plan|regular plan|idcw|growth option|dividend option)\\M'
  OR name ~* 'direct plan\\s+(growth|idcw|dividend)'
  OR name ~* 'regular plan\\s+(growth|idcw|dividend)'
`;

async function main() {
  const pool = getPgPool();
  const rows = (await pool.query(`
    SELECT id, name, isin, nse_symbol, bse_code, slug,
      (SELECT COUNT(*)::int FROM fund_holdings fh WHERE fh.stock_id = s.id) AS holdings_rows
    FROM stocks s
    WHERE name ~* '\\m(direct plan|regular plan|idcw|growth option|dividend option)\\M'
       OR name ~* 'direct plan\\s+(growth|idcw|dividend)'
       OR name ~* 'regular plan\\s+(growth|idcw|dividend)'
    ORDER BY name
  `)).rows;
  console.log('MF plan-like stocks:', rows.length);
  for (const r of rows) {
    console.log(JSON.stringify({ id: r.id, name: r.name, isin: r.isin, nse: r.nse_symbol, bse: r.bse_code, holdings: r.holdings_rows }));
  }
  const broader = (await pool.query(`
    SELECT COUNT(*)::int n FROM stocks WHERE
      name ~* 'direct plan|regular plan|idcw|growth option|dividend option'
  `)).rows[0].n;
  console.log('Broader pattern count:', broader);
  await closePgPool();
}
main().catch(async (e) => { await closePgPool().catch(() => {}); console.error(e.message); process.exit(1); });
"""
Path(r"c:\Users\shaik\Downloads\Testing\Finverse\finverseui\db\_mf-plan-audit.mjs").write_text(js, encoding='utf-8')
