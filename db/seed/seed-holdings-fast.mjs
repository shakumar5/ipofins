/**
 * Finverse — Fast Holdings Seeder
 * 
 * Optimized for speed: builds all stocks/sectors first in memory,
 * then batch-inserts holdings using fewer DB calls.
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
  console.log('  Finverse — Fast Holdings Seed');
  console.log('═══════════════════════════════════════════════════════════');

  const holdingsData = readJSON('fund-holdings.json');
  if (!holdingsData?.holdings) { console.log('No holdings data'); return; }

  // Step 1: Get fund ID map
  const fundRows = await sql`SELECT id, slug FROM funds`;
  const fundIdMap = {};
  for (const r of fundRows) fundIdMap[r.slug] = r.id;
  console.log(`  Funds in DB: ${fundRows.length}`);

  // Step 2: Collect ALL unique sectors and stocks from holdings data
  console.log('\n  📋 Collecting unique stocks and sectors...');
  const allSectors = new Set();
  const allStocks = new Map(); // slug → { name, isin, sector }

  for (const [fundSlug, fundData] of Object.entries(holdingsData.holdings)) {
    const months = Object.keys(fundData).filter(k => k !== 'name' && k !== 'amc');
    for (const monthStr of months) {
      const holdings = fundData[monthStr];
      if (!Array.isArray(holdings)) continue;
      for (const h of holdings) {
        if (h.sector?.trim()) allSectors.add(h.sector.trim());
        const slug = slugify(h.name);
        if (!allStocks.has(slug)) {
          allStocks.set(slug, { name: h.name, isin: h.isin || null, sector: h.sector?.trim() || null });
        }
      }
    }
  }
  console.log(`  Unique sectors: ${allSectors.size}`);
  console.log(`  Unique stocks: ${allStocks.size}`);

  // Step 3: Bulk insert all sectors
  console.log('\n  🌐 Inserting sectors...');
  for (const sectorName of allSectors) {
    const slug = slugify(sectorName);
    await sql`INSERT INTO sectors (name, slug) VALUES (${sectorName}, ${slug}) ON CONFLICT (slug) DO NOTHING`;
  }
  
  // Get sector ID map
  const sectorRows = await sql`SELECT id, slug FROM sectors`;
  const sectorIdMap = {};
  for (const r of sectorRows) sectorIdMap[r.slug] = r.id;
  console.log(`  ✅ ${sectorRows.length} sectors in DB`);

  // Step 4: Bulk insert all stocks
  console.log('\n  📈 Inserting stocks...');
  let stocksInserted = 0;
  for (const [slug, stock] of allStocks) {
    const sectorId = stock.sector ? (sectorIdMap[slugify(stock.sector)] || null) : null;
    await sql`
      INSERT INTO stocks (isin, name, slug, sector_id) 
      VALUES (${stock.isin}, ${stock.name}, ${slug}, ${sectorId})
      ON CONFLICT (slug) DO UPDATE SET
        isin = COALESCE(EXCLUDED.isin, stocks.isin),
        sector_id = COALESCE(EXCLUDED.sector_id, stocks.sector_id),
        updated_at = NOW()
    `;
    stocksInserted++;
    if (stocksInserted % 100 === 0) console.log(`    ${stocksInserted}/${allStocks.size}...`);
  }

  // Get stock ID map
  const stockRows = await sql`SELECT id, slug FROM stocks`;
  const stockIdMap = {};
  for (const r of stockRows) stockIdMap[r.slug] = r.id;
  console.log(`  ✅ ${stockRows.length} stocks in DB`);

  // Step 5: Clear existing holdings (start fresh for clean data)
  console.log('\n  🗑️  Clearing old holdings...');
  await sql`DELETE FROM fund_holdings`;
  
  // Step 6: Insert holdings — now fast because we already have all IDs
  console.log('\n  🏦 Inserting holdings...');
  let totalInserted = 0;
  let fundsDone = 0;
  const fundSlugs = Object.keys(holdingsData.holdings);

  for (const fundSlug of fundSlugs) {
    const fundData = holdingsData.holdings[fundSlug];
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

        try {
          await sql`
            INSERT INTO fund_holdings (fund_id, stock_id, month, quantity, market_value, pct_to_nav)
            VALUES (${fundId}, ${stockId}, ${monthDate}, ${h.quantity || null}, ${h.value || null}, ${h.pct || null})
            ON CONFLICT (fund_id, stock_id, month) DO UPDATE SET
              quantity = EXCLUDED.quantity,
              market_value = EXCLUDED.market_value,
              pct_to_nav = EXCLUDED.pct_to_nav
          `;
          totalInserted++;
        } catch (e) {}
      }
    }

    fundsDone++;
    if (fundsDone % 50 === 0) {
      console.log(`    ${fundsDone}/${fundSlugs.length} funds, ${totalInserted} holdings`);
    }
  }

  console.log(`\n  ✅ Done! ${totalInserted} holdings inserted across ${fundsDone} funds`);

  // Final counts
  const r = await sql`
    SELECT 
      (SELECT COUNT(*) FROM stocks) as stocks,
      (SELECT COUNT(*) FROM sectors) as sectors,
      (SELECT COUNT(*) FROM fund_holdings) as holdings
  `;
  console.log('  Final:', r[0]);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
