import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = neon(readFileSync(join(ROOT, '.env'),'utf-8').match(/DATABASE_URL=(.+)/)[1].trim());

for (const id of [2743, 3550]) {
  const [f] = await sql`
    SELECT f.*, a.name AS amc_name,
      (SELECT COUNT(*)::int FROM fund_holdings WHERE fund_id = f.id) AS holdings,
      (SELECT COUNT(*)::int FROM fund_navs WHERE fund_id = f.id) AS navs,
      (SELECT COUNT(*)::int FROM fund_returns WHERE fund_id = f.id) AS returns,
      (SELECT COUNT(*)::int FROM fund_portfolio_stats WHERE fund_id = f.id) AS stats
    FROM funds f JOIN amcs a ON a.id = f.amc_id WHERE f.id = ${id}
  `;
  console.log('\nFund', id, JSON.stringify(f, null, 2));
}

const holdingsJson = JSON.parse(readFileSync(join(ROOT,'src/data/fund-holdings.json'),'utf-8'));
const slugs = Object.keys(holdingsJson.holdings || {}).filter(s => s.includes('motilal-oswal-consumption'));
console.log('\nParser slugs in fund-holdings.json:', slugs);
for (const s of slugs) {
  const fd = holdingsJson.holdings[s];
  console.log(' ', s, '->', fd.name, 'months:', Object.keys(fd).filter(k=>k!=='name'&&k!=='amc').length);
}
