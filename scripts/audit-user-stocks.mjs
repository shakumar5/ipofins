import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const sql = neon(env.match(/DATABASE_URL=(.+)/)[1].trim());

const dups = await sql`
  WITH normed AS (
    SELECT s.*,
      LOWER(REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(TRIM(s.name), '\\mlimited\\M', 'ltd', 'gi'),
          '\\mltd\\M', 'ltd', 'gi'
        ),
        '[^a-z0-9]+', ' ', 'g'
      )) AS norm
    FROM stocks s
  )
  SELECT norm, COUNT(*)::int AS c,
         array_agg(name ORDER BY id) AS names,
         array_agg(COALESCE(isin, 'null') ORDER BY id) AS isins
  FROM normed
  GROUP BY norm HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC LIMIT 20
`;
console.log('Normalized name duplicate groups:', dups.length);
for (const r of dups) {
  console.log(`  ${r.norm} (${r.c}):`, r.names.join(' | '));
}

const queries = ['Aadhar Housing', 'ABB India', 'Abbott India', 'Adani Energy', 'Adani Green', 'Adani Enterprises', '360 One', '3M India', 'Eternal', 'ICICI Bank', 'HDFC Bank'];
for (const q of queries) {
  const rows = await sql`
    SELECT s.id, s.name, s.isin, COALESCE(sec.name,'') AS sector
    FROM stocks s LEFT JOIN sectors sec ON sec.id = s.sector_id
    WHERE s.name ILIKE ${'%' + q + '%'}
    ORDER BY s.name
  `;
  console.log(`\n${q} (${rows.length} rows):`);
  for (const r of rows) console.log(`  #${r.id} ${r.name} | ${r.isin || 'null'} | ${r.sector}`);
}

const sm = await sql`
  SELECT s.name, COALESCE(s.isin,'') AS isin, COALESCE(sec.name,'') AS sector,
         COUNT(DISTINCT hc.fund_id)::int AS funds
  FROM holdings_changes hc
  JOIN stocks s ON s.id = hc.stock_id
  LEFT JOIN sectors sec ON sec.id = s.sector_id
  WHERE hc.month = (SELECT MAX(month) FROM holdings_changes)
    AND hc.change_type = 'increased'
    AND (s.name ILIKE '%icici bank%' OR s.name ILIKE '%hdfc bank%' OR s.name ILIKE '%aadhar%' OR s.name ILIKE '%abb india%' OR s.name ILIKE '%abbott india%')
  GROUP BY s.name, s.isin, sec.name
  ORDER BY funds DESC
`;
console.log('\nIncreased holdings (user examples):');
for (const r of sm) console.log(`  ${r.name} | ${r.isin} | ${r.sector} | ${r.funds} funds`);
