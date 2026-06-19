/** Verify Smart Money "Most Bought" has no duplicate stocks for latest month. */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { normalizeStockName, isValidEquitySector, isDebtInstrument, stockGroupKey } from './lib/stock-utils.mjs';

const EQUITY_CATEGORIES = new Set([
  'Large Cap', 'Large & Mid Cap', 'Mid Cap', 'Multi Cap', 'Flexi Cap', 'Small Cap',
  'Value', 'Focused', 'ELSS', 'Sectoral/Thematic', 'Sectoral', 'Contra', 'Dividend Yield', 'Index',
]);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = neon(readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim());

const rows = await sql`
  SELECT
    TRIM(TO_CHAR(hc.month, 'FMMonth YYYY')) AS month_label,
    s.name AS stock_name,
    COALESCE(s.isin, '') AS isin,
    COALESCE(sec.name, 'Unknown') AS sector,
    f.category AS fund_category,
    COALESCE(hc.pct_change, 0)::float AS pct_change
  FROM holdings_changes hc
  JOIN funds f ON f.id = hc.fund_id AND f.is_active = true
  JOIN stocks s ON s.id = hc.stock_id
  LEFT JOIN sectors sec ON sec.id = s.sector_id
  WHERE hc.change_type = 'increased'
    AND hc.month = (SELECT MAX(month) FROM holdings_changes)
`;

const grouped = new Map();

for (const row of rows) {
  if (!EQUITY_CATEGORIES.has(row.fund_category)) continue;
  if (isDebtInstrument(row.stock_name, row.sector)) continue;
  if (!isValidEquitySector(row.sector)) continue;

  const key = stockGroupKey({ isin: row.isin, name: row.stock_name });
  if (!grouped.has(key)) {
    grouped.set(key, { names: new Set(), sector: row.sector, funds: 0, weight: 0 });
  }
  const g = grouped.get(key);
  g.names.add(row.stock_name);
  g.funds += 1;
  g.weight += Math.max(0, Number(row.pct_change));
}

const ranked = [...grouped.entries()]
  .map(([key, g]) => ({
    key,
    display: [...g.names].sort((a, b) => b.length - a.length)[0],
    names: [...g.names],
    sector: g.sector,
    funds: g.funds,
    weight: Math.round(g.weight * 100) / 100,
  }))
  .sort((a, b) => b.funds - a.funds);

const multiName = ranked.filter((r) => r.names.length > 1);
const badSector = ranked.filter((r) => !isValidEquitySector(r.sector));

console.log(`Month: ${rows[0]?.month_label?.trim() || 'n/a'}`);
console.log(`Unique stocks (increased): ${ranked.length}`);
console.log(`Merged name variants: ${multiName.length}`);
console.log(`Invalid sectors: ${badSector.length}`);

console.log('\nTop 15 Most Bought:');
for (const r of ranked.slice(0, 15)) {
  console.log(`  ${r.display} | ${r.sector} | ${r.funds} funds | ${r.weight.toFixed(2)}%`);
}

if (multiName.length || badSector.length) process.exit(1);
