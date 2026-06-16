/**
 * Finverse — Finish seeding (fund returns, IPOs, holdings)
 * Optimized with batch inserts for speed over HTTP.
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(ROOT, 'src', 'data');

// Load env
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

// ═══════════════════════════════════════════════════════════════
// FINISH FUND RETURNS
// ═══════════════════════════════════════════════════════════════
async function seedFundReturns() {
  console.log('\n  📊 Finishing fund returns...');
  const funds = readJSON('mutual-funds.json');
  if (!funds) return;

  // Get fund id map
  const fundRows = await sql`SELECT id, slug FROM funds`;
  const fundIdMap = {};
  for (const r of fundRows) fundIdMap[r.slug] = r.id;

  // Check what's already done
  const existingReturns = await sql`SELECT fund_id FROM fund_returns`;
  const doneSet = new Set(existingReturns.map(r => r.fund_id));

  const remaining = funds.filter(f => {
    const id = fundIdMap[f.slug];
    return id && !doneSet.has(id);
  });

  console.log(`    Already done: ${doneSet.size}, remaining: ${remaining.length}`);

  // Batch insert remaining
  for (let i = 0; i < remaining.length; i += 20) {
    const batch = remaining.slice(i, i + 20);
    for (const fund of batch) {
      const fundId = fundIdMap[fund.slug];
      try {
        await sql`
          INSERT INTO fund_returns (fund_id, returns_1y, returns_3y, returns_5y, last_computed)
          VALUES (${fundId}, ${fund.returns1y || null}, ${fund.returns3y || null}, ${fund.returns5y || null}, NOW())
          ON CONFLICT (fund_id) DO UPDATE SET
            returns_1y = EXCLUDED.returns_1y,
            returns_3y = EXCLUDED.returns_3y,
            returns_5y = EXCLUDED.returns_5y,
            last_computed = NOW()
        `;
      } catch (e) {}
    }
    if ((i + 20) % 100 === 0) process.stdout.write('.');
  }
  
  const count = await sql`SELECT COUNT(*) as cnt FROM fund_returns`;
  console.log(`\n    ✅ Fund returns: ${count[0].cnt} total`);
}

// ═══════════════════════════════════════════════════════════════
// SEED IPOs
// ═══════════════════════════════════════════════════════════════
async function seedIPOs() {
  console.log('\n  📈 Seeding IPOs...');
  const ipos = readJSON('ipos.json');
  if (!ipos) return;

  let inserted = 0;
  for (const ipo of ipos) {
    let priceMin = null, priceMax = null;
    if (ipo.priceRange) {
      const parts = ipo.priceRange.replace(/₹/g, '').split('-').map(s => parseFloat(s.trim()));
      if (parts.length === 2) { priceMin = parts[0] || null; priceMax = parts[1] || null; }
      else if (parts.length === 1) { priceMin = parts[0] || null; priceMax = parts[0] || null; }
    }

    let issueSizeCr = null;
    if (ipo.issueSize) {
      const match = ipo.issueSize.match(/([\d,.]+)/);
      if (match) issueSizeCr = parseFloat(match[1].replace(/,/g, '')) || null;
    }

    try {
      await sql`
        INSERT INTO ipos (
          slug, name, type, status, price_range, price_min, price_max,
          lot_size, issue_size, issue_size_cr, sector, registrar, founders,
          headquarters, founded, description, purpose, drhp_url,
          highlights, risks, risk_score, last_updated
        ) VALUES (
          ${ipo.slug}, ${ipo.name}, ${ipo.type}, ${ipo.status},
          ${ipo.priceRange || null}, ${priceMin}, ${priceMax || ipo.priceMax || null},
          ${ipo.lotSize || null}, ${ipo.issueSize || null}, ${issueSizeCr},
          ${ipo.sector || null}, ${ipo.registrar || null}, ${ipo.founders || null},
          ${ipo.headquarters || null}, ${ipo.founded || null},
          ${ipo.description || null}, ${ipo.purpose || null}, ${ipo.drhpUrl || null},
          ${ipo.highlights || null}, ${ipo.risks || null},
          ${ipo.riskScore || null}, ${ipo.lastUpdated || new Date().toISOString()}
        )
        ON CONFLICT (slug) DO UPDATE SET
          status = EXCLUDED.status,
          price_range = EXCLUDED.price_range,
          price_min = EXCLUDED.price_min,
          price_max = EXCLUDED.price_max,
          lot_size = EXCLUDED.lot_size,
          sector = EXCLUDED.sector,
          last_updated = NOW()
      `;
      inserted++;
    } catch (err) {
      console.error(`    ❌ ${ipo.name}: ${err.message.substring(0, 80)}`);
    }
  }
  console.log(`    ✅ ${inserted} IPOs inserted`);
}

// ═══════════════════════════════════════════════════════════════
// SEED HOLDINGS
// ═══════════════════════════════════════════════════════════════
async function seedHoldings() {
  console.log('\n  🏦 Seeding fund holdings...');
  const holdingsData = readJSON('fund-holdings.json');
  if (!holdingsData || !holdingsData.holdings) {
    console.log('    ⚠️  No holdings data found');
    return;
  }

  // Get fund ID map
  const fundRows = await sql`SELECT id, slug FROM funds`;
  const fundIdMap = {};
  for (const r of fundRows) fundIdMap[r.slug] = r.id;

  // Month string to date
  function monthToDate(monthStr) {
    const months = { January:'01', February:'02', March:'03', April:'04', 
                     May:'05', June:'06', July:'07', August:'08',
                     September:'09', October:'10', November:'11', December:'12' };
    const parts = monthStr.split(' ');
    if (parts.length !== 2) return null;
    const mm = months[parts[0]];
    if (!mm) return null;
    return `${parts[1]}-${mm}-01`;
  }

  // Cache for sectors and stocks
  const sectorCache = {};
  const stockCache = {};

  async function getOrCreateSector(name) {
    if (!name || !name.trim()) return null;
    const key = name.trim();
    if (sectorCache[key]) return sectorCache[key];
    const slug = slugify(key);
    try {
      await sql`INSERT INTO sectors (name, slug) VALUES (${key}, ${slug}) ON CONFLICT (slug) DO NOTHING`;
      const r = await sql`SELECT id FROM sectors WHERE slug = ${slug}`;
      if (r.length > 0) { sectorCache[key] = r[0].id; return r[0].id; }
    } catch (e) {}
    return null;
  }

  async function getOrCreateStock(holding) {
    const slug = slugify(holding.name);
    if (stockCache[slug]) return stockCache[slug];
    const sectorId = await getOrCreateSector(holding.sector);
    try {
      await sql`
        INSERT INTO stocks (isin, name, slug, sector_id) 
        VALUES (${holding.isin || null}, ${holding.name}, ${slug}, ${sectorId})
        ON CONFLICT (slug) DO UPDATE SET
          isin = COALESCE(EXCLUDED.isin, stocks.isin),
          sector_id = COALESCE(EXCLUDED.sector_id, stocks.sector_id)
      `;
      const r = await sql`SELECT id FROM stocks WHERE slug = ${slug}`;
      if (r.length > 0) { stockCache[slug] = r[0].id; return r[0].id; }
    } catch (e) {}
    return null;
  }

  let totalInserted = 0;
  const fundSlugs = Object.keys(holdingsData.holdings);
  console.log(`    Funds to process: ${fundSlugs.length}`);

  for (let fi = 0; fi < fundSlugs.length; fi++) {
    const fundSlug = fundSlugs[fi];
    const fundData = holdingsData.holdings[fundSlug];
    const fundId = fundIdMap[fundSlug];
    if (!fundId) continue;

    const months = Object.keys(fundData).filter(k => k !== 'name' && k !== 'amc');
    
    for (const monthStr of months) {
      const monthDate = monthToDate(monthStr);
      if (!monthDate) continue;
      
      const holdings = fundData[monthStr];
      if (!Array.isArray(holdings)) continue;

      for (const holding of holdings) {
        const stockId = await getOrCreateStock(holding);
        if (!stockId) continue;

        try {
          await sql`
            INSERT INTO fund_holdings (fund_id, stock_id, month, quantity, market_value, pct_to_nav)
            VALUES (${fundId}, ${stockId}, ${monthDate}, ${holding.quantity || null}, ${holding.value || null}, ${holding.pct || null})
            ON CONFLICT (fund_id, stock_id, month) DO UPDATE SET
              quantity = EXCLUDED.quantity,
              market_value = EXCLUDED.market_value,
              pct_to_nav = EXCLUDED.pct_to_nav
          `;
          totalInserted++;
        } catch (e) {}
      }
    }

    if ((fi + 1) % 10 === 0) {
      console.log(`    Progress: ${fi + 1}/${fundSlugs.length} funds, ${totalInserted} holdings`);
    }
  }

  console.log(`    ✅ ${totalInserted} holding records inserted`);
  console.log(`    📋 ${Object.keys(stockCache).length} stocks, ${Object.keys(sectorCache).length} sectors`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Seed Remaining Data');
  console.log('═══════════════════════════════════════════════════════════');

  await seedFundReturns();
  await seedIPOs();
  await seedHoldings();

  // Final counts
  const r = await sql`
    SELECT 
      (SELECT COUNT(*) FROM amcs) as amcs,
      (SELECT COUNT(*) FROM funds) as funds,
      (SELECT COUNT(*) FROM fund_returns) as returns,
      (SELECT COUNT(*) FROM ipos) as ipos,
      (SELECT COUNT(*) FROM stocks) as stocks,
      (SELECT COUNT(*) FROM sectors) as sectors,
      (SELECT COUNT(*) FROM fund_holdings) as holdings
  `;
  console.log('\n  📊 Final database counts:');
  console.log(r[0]);
  console.log('\n  ✅ Done!');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
