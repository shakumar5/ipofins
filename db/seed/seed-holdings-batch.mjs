/**
 * Finverse — Batch Holdings Seeder (truly fast)
 * 
 * Uses raw SQL with multiple VALUES per INSERT to minimize HTTP roundtrips.
 * Sends 100 rows per query instead of 1.
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(ROOT, 'src', 'data');

const envContent = readFileSync(join(ROOT, '.env'), 'utf-8');
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

function readJSON(file) {
  const p = join(DATA_DIR, file);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 80);
}

function monthToDate(monthStr) {
  const months = { January:'01', February:'02', March:'03', April:'04', 
                   May:'05', June:'06', July:'07', August:'08',
                   September:'09', October:'10', November:'11', December:'12' };
  const parts = monthStr.split(' ');
  if (parts.length !== 2) return null;
  const mm = months[parts[0]];
  return mm ? `${parts[1]}-${mm}-01` : null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Batch Holdings Seed');
  console.log('═══════════════════════════════════════════════════════════');

  const holdingsData = readJSON('fund-holdings.json');
  if (!holdingsData?.holdings) { console.log('No holdings data'); return; }

  // Get lookup maps
  const fundRows = await sql`SELECT id, slug FROM funds`;
  const fundIdMap = {};
  for (const r of fundRows) fundIdMap[r.slug] = r.id;

  const stockRows = await sql`SELECT id, slug FROM stocks`;
  const stockIdMap = {};
  for (const r of stockRows) stockIdMap[r.slug] = r.id;

  console.log(`  Funds: ${fundRows.length}, Stocks: ${stockRows.length}`);

  // Clear existing holdings for clean insert
  await sql`DELETE FROM holdings_changes`;
  await sql`DELETE FROM fund_holdings`;
  console.log('  Cleared existing holdings');

  // Build all holding rows in memory
  console.log('\n  📋 Building holding rows...');
  const allRows = [];

  for (const [fundSlug, fundData] of Object.entries(holdingsData.holdings)) {
    const fundId = fundIdMap[fundSlug];
    if (!fundId) continue;

    const months = Object.keys(fundData).filter(k => k !== 'name' && k !== 'amc');
    for (const monthStr of months) {
      const monthDate = monthToDate(monthStr);
      if (!monthDate) continue;
      
      const holdings = fundData[monthStr];
      if (!Array.isArray(holdings)) continue;

      for (const h of holdings) {
        const stockSlug = slugify(h.name);
        const stockId = stockIdMap[stockSlug];
        if (!stockId) continue;

        allRows.push({
          fund_id: fundId,
          stock_id: stockId,
          month: monthDate,
          quantity: h.quantity || null,
          market_value: h.value || null,
          pct_to_nav: h.pct || null,
        });
      }
    }
  }

  console.log(`  Total rows to insert: ${allRows.length}`);

  // Batch insert 50 rows at a time using sql.query with parameters
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    
    // Build parameterized query
    const values = [];
    const placeholders = [];
    let paramIdx = 1;

    for (const row of batch) {
      placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}::DATE, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
      values.push(row.fund_id, row.stock_id, row.month, row.quantity, row.market_value, row.pct_to_nav);
    }

    const query = `
      INSERT INTO fund_holdings (fund_id, stock_id, month, quantity, market_value, pct_to_nav)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (fund_id, stock_id, month) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        market_value = EXCLUDED.market_value,
        pct_to_nav = EXCLUDED.pct_to_nav
    `;

    try {
      await sql.query(query, values);
      inserted += batch.length;
    } catch (e) {
      errors++;
      // Fallback: try one-by-one for this batch
      for (const row of batch) {
        try {
          await sql`
            INSERT INTO fund_holdings (fund_id, stock_id, month, quantity, market_value, pct_to_nav)
            VALUES (${row.fund_id}, ${row.stock_id}, ${row.month}, ${row.quantity}, ${row.market_value}, ${row.pct_to_nav})
            ON CONFLICT (fund_id, stock_id, month) DO UPDATE SET
              quantity = EXCLUDED.quantity,
              market_value = EXCLUDED.market_value,
              pct_to_nav = EXCLUDED.pct_to_nav
          `;
          inserted++;
        } catch (e2) {}
      }
    }

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= allRows.length) {
      console.log(`    ${Math.min(i + BATCH_SIZE, allRows.length)}/${allRows.length} (${errors} batch errors)`);
    }
  }

  console.log(`\n  ✅ Inserted: ${inserted} holdings`);
  if (errors > 0) console.log(`  ⚠️  Batch errors (retried individually): ${errors}`);

  // Final count
  const r = await sql`SELECT COUNT(*) as cnt FROM fund_holdings`;
  console.log(`  DB total: ${r[0].cnt} holdings`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
