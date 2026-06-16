import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const r = await sql`
  SELECT 
    (SELECT COUNT(*) FROM amcs) as amcs,
    (SELECT COUNT(*) FROM funds) as funds,
    (SELECT COUNT(*) FROM fund_returns) as fund_returns,
    (SELECT COUNT(*) FROM fund_navs) as fund_navs,
    (SELECT COUNT(*) FROM ipos) as ipos,
    (SELECT COUNT(*) FROM stocks) as stocks,
    (SELECT COUNT(*) FROM sectors) as sectors,
    (SELECT COUNT(*) FROM fund_holdings) as holdings,
    (SELECT COUNT(*) FROM holdings_changes) as changes,
    (SELECT COUNT(*) FROM stock_signals) as signals,
    (SELECT COUNT(*) FROM sector_allocations) as sector_allocs,
    (SELECT COUNT(*) FROM fund_overlaps) as overlaps
`;

console.log('\n  📊 Finverse Database — Complete Status');
console.log('  ═══════════════════════════════════════');
const d = r[0];
console.log(`  AMCs:               ${d.amcs}`);
console.log(`  Funds:              ${d.funds}`);
console.log(`  Fund Returns:       ${d.fund_returns}`);
console.log(`  Fund NAVs:          ${d.fund_navs}`);
console.log(`  IPOs:               ${d.ipos}`);
console.log(`  Stocks:             ${d.stocks}`);
console.log(`  Sectors:            ${d.sectors}`);
console.log(`  Holdings:           ${d.holdings}`);
console.log(`  Holdings Changes:   ${d.changes}`);
console.log(`  Stock Signals:      ${d.signals}`);
console.log(`  Sector Allocations: ${d.sector_allocs}`);
console.log(`  Fund Overlaps:      ${d.overlaps}`);
console.log('  ═══════════════════════════════════════\n');
