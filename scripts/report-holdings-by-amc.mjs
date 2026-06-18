import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const sql = neon(env.match(/DATABASE_URL=(.+)/)[1].trim());

const [latest] = await sql`SELECT MAX(month) AS month FROM fund_holdings`;
const latestMonth = latest.month;
const latestLabel = String(latestMonth).slice(0, 10);

const byAmcLatest = await sql`
  SELECT
    a.name AS amc,
    COUNT(DISTINCT fh.fund_id)::int AS funds,
    COUNT(DISTINCT fh.stock_id)::int AS distinct_stocks,
    COUNT(*)::int AS holding_rows
  FROM fund_holdings fh
  JOIN funds f ON f.id = fh.fund_id
  JOIN amcs a ON a.id = f.amc_id
  WHERE fh.month = ${latestMonth}
  GROUP BY a.id, a.name
  ORDER BY funds DESC, a.name
`;

const byAmcAllMonths = await sql`
  SELECT
    a.name AS amc,
    COUNT(DISTINCT fh.fund_id)::int AS funds,
    COUNT(DISTINCT fh.stock_id)::int AS distinct_stocks,
    COUNT(*)::int AS holding_rows
  FROM fund_holdings fh
  JOIN funds f ON f.id = fh.fund_id
  JOIN amcs a ON a.id = f.amc_id
  GROUP BY a.id, a.name
  ORDER BY funds DESC, a.name
`;

const totalsLatest = byAmcLatest.reduce(
  (acc, r) => ({
    amcs: acc.amcs + 1,
    funds: acc.funds + r.funds,
    stocks: acc.stocks + r.distinct_stocks,
    rows: acc.rows + r.holding_rows,
  }),
  { amcs: 0, funds: 0, stocks: 0, rows: 0 }
);

console.log(`\n=== Holdings by AMC — Latest month (${latestLabel}) ===\n`);
console.table(
  byAmcLatest.map((r) => ({
    AMC: r.amc,
    Funds: r.funds,
    'Distinct stocks': r.distinct_stocks,
    'Holding rows': r.holding_rows,
  }))
);
console.log('Totals (latest month):', {
  AMCs: totalsLatest.amcs,
  Funds: totalsLatest.funds,
  'Distinct stocks (sum per AMC, may overlap across AMCs)': totalsLatest.stocks,
  'Holding rows': totalsLatest.rows,
});

const [globalLatest] = await sql`
  SELECT
    COUNT(DISTINCT f.amc_id)::int AS amcs,
    COUNT(DISTINCT fh.fund_id)::int AS funds,
    COUNT(DISTINCT fh.stock_id)::int AS distinct_stocks,
    COUNT(*)::int AS holding_rows
  FROM fund_holdings fh
  JOIN funds f ON f.id = fh.fund_id
  WHERE fh.month = ${latestMonth}
`;
console.log('\nGlobal distinct (latest month — stocks counted once across all AMCs):', globalLatest);

const months = await sql`
  SELECT month::text, COUNT(DISTINCT f.amc_id)::int AS amcs,
         COUNT(DISTINCT fh.fund_id)::int AS funds,
         COUNT(DISTINCT fh.stock_id)::int AS stocks,
         COUNT(*)::int AS rows
  FROM fund_holdings fh
  JOIN funds f ON f.id = fh.fund_id
  GROUP BY month ORDER BY month
`;
console.log('\n=== By month (all AMCs) ===');
console.table(months);
