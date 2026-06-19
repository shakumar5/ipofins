import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';
import { normalizeFundName, fundQualityScore } from './lib/fund-match.mjs';

const sql = neon(readFileSync('.env', 'utf8').match(/DATABASE_URL=(.+)/)[1].trim());
const amcNameById = Object.fromEntries((await sql`SELECT id, name FROM amcs`).map((a) => [a.id, a.name]));
const funds = await sql`SELECT id, slug, name, amc_id, scheme_code FROM funds WHERE is_active AND slug LIKE 'invesco-india-largecap%'`;
for (const f of funds) {
  const norm = normalizeFundName(f.name, amcNameById[f.amc_id]);
  const h = await sql`SELECT COUNT(*)::int c FROM fund_holdings WHERE fund_id = ${f.id}`;
  console.log(f.slug, 'score', fundQualityScore(f), 'norm', norm, 'holdings', h[0].c);
}
