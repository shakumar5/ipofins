import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';

const sql = neon(readFileSync('.env', 'utf8').match(/DATABASE_URL=(.+)/)[1].trim());
const names = ['Kotak Contra', 'Invesco India Largecap', 'DSP India T.I.G.E.R', 'ITI Flexi', 'HSBC Asia', 'Kotak Multicap', 'ITI Small Cap', 'Invesco India Smallcap'];

for (const n of names) {
  const r = await sql`
    SELECT f.name, f.slug,
      (SELECT COUNT(*)::int FROM fund_holdings fh WHERE fh.fund_id = f.id) AS holdings,
      (SELECT nav FROM fund_navs WHERE fund_id = f.id ORDER BY date DESC LIMIT 1) AS nav
    FROM funds f
    WHERE f.name ILIKE ${'%' + n + '%'} AND f.is_active = true
    ORDER BY holdings DESC, f.slug
    LIMIT 3
  `;
  console.log('\n' + n);
  for (const row of r) console.log(' ', row.slug, 'holdings=' + row.holdings, 'nav=' + row.nav);
}
