/**
 * Finverse — Seed Database from Existing JSON Files
 * 
 * Imports current JSON data into Neon PostgreSQL.
 * Run once after setting up the database and running migrations.
 * 
 * Usage: node db/seed/seed-from-json.mjs
 * 
 * Prerequisites:
 *   1. Create Neon project at https://console.neon.tech
 *   2. Run migrations: psql $DATABASE_URL -f db/migrations/001_initial_schema.sql
 *   3. Run indexes: psql $DATABASE_URL -f db/migrations/002_indexes.sql
 *   4. Set DATABASE_URL in .env
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql, isDbConfigured, upsertMany } from '../../scripts/lib/db.mjs';
import { normalizeStockName } from '../../scripts/lib/stock-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'src', 'data');

function readJSON(filename) {
  const filepath = join(DATA_DIR, filename);
  if (!existsSync(filepath)) {
    console.log(`  ⚠️  ${filename} not found, skipping`);
    return null;
  }
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

import { extractAmcFromFundName, slugify, CANONICAL_AMCS } from '../../scripts/lib/amc-resolve.mjs';

// ═══════════════════════════════════════════════════════════════
// SEED MUTUAL FUNDS
// ═══════════════════════════════════════════════════════════════

async function seedMutualFunds() {
  console.log('\n  📊 Seeding mutual funds...');
  const funds = readJSON('mutual-funds.json');
  if (!funds) return;

  // Extract unique AMCs (from fund names: "HDFC Mid Cap Fund" → "HDFC")
  // We'll use a simple heuristic since current data doesn't have explicit AMC field
  const amcSet = new Set();
  const fundAMCMap = {};
  
  for (const fund of funds) {
    const amcName = extractAmcFromFundName(fund.name);
    amcSet.add(amcName);
    fundAMCMap[fund.slug] = amcName;
  }

  // Insert AMCs (canonical list + any from funds)
  const amcRows = [...new Set([...CANONICAL_AMCS, ...amcSet])].map((name) => ({
    name,
    slug: slugify(name),
    short_name: name.substring(0, 30),
  }));
  
  console.log(`    Inserting ${amcRows.length} AMCs...`);
  for (const amc of amcRows) {
    await sql`
      INSERT INTO amcs (name, slug, short_name) 
      VALUES (${amc.name}, ${amc.slug}, ${amc.short_name})
      ON CONFLICT (slug) DO NOTHING
    `;
  }

  // Get AMC ID map
  const amcResult = await sql`SELECT id, name FROM amcs`;
  const amcIdMap = {};
  for (const row of amcResult) {
    amcIdMap[row.name] = row.id;
  }

  // Insert funds
  console.log(`    Inserting ${funds.length} funds...`);
  let inserted = 0;
  for (const fund of funds) {
    const amcName = fundAMCMap[fund.slug];
    const amcId = amcIdMap[amcName] || null;
    
    try {
      await sql`
        INSERT INTO funds (scheme_code, name, slug, amc_id, category, risk_level, rating, aum)
        VALUES (
          ${fund.schemeCode || null},
          ${fund.name},
          ${fund.slug},
          ${amcId},
          ${fund.category},
          ${fund.riskLevel || null},
          ${fund.rating || null},
          ${fund.aum ? parseFloat(fund.aum.replace(/[₹,Cr\s]/g, '')) || null : null}
        )
        ON CONFLICT (slug) DO UPDATE SET
          scheme_code = EXCLUDED.scheme_code,
          category = EXCLUDED.category,
          risk_level = EXCLUDED.risk_level,
          rating = EXCLUDED.rating,
          aum = EXCLUDED.aum,
          updated_at = NOW()
      `;
      inserted++;
    } catch (err) {
      // Skip duplicates silently
    }
  }
  console.log(`    ✅ ${inserted} funds inserted`);

  // Insert fund returns
  console.log(`    Inserting fund returns...`);
  const fundIdResult = await sql`SELECT id, slug FROM funds`;
  const fundIdMap = {};
  for (const row of fundIdResult) {
    fundIdMap[row.slug] = row.id;
  }

  let returnsInserted = 0;
  for (const fund of funds) {
    const fundId = fundIdMap[fund.slug];
    if (!fundId) continue;
    
    try {
      await sql`
        INSERT INTO fund_returns (fund_id, returns_1y, returns_3y, returns_5y, last_computed)
        VALUES (
          ${fundId},
          ${fund.returns1y || null},
          ${fund.returns3y || null},
          ${fund.returns5y || null},
          NOW()
        )
        ON CONFLICT (fund_id) DO UPDATE SET
          returns_1y = EXCLUDED.returns_1y,
          returns_3y = EXCLUDED.returns_3y,
          returns_5y = EXCLUDED.returns_5y,
          last_computed = NOW()
      `;
      returnsInserted++;
    } catch (err) {
      // Skip errors
    }
  }
  console.log(`    ✅ ${returnsInserted} fund returns inserted`);
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
    try {
      // Parse price range to get min/max
      let priceMin = null, priceMax = null;
      if (ipo.priceRange) {
        const parts = ipo.priceRange.replace(/₹/g, '').split('-').map(s => parseFloat(s.trim()));
        if (parts.length === 2) {
          priceMin = parts[0] || null;
          priceMax = parts[1] || null;
        } else if (parts.length === 1) {
          priceMin = parts[0] || null;
          priceMax = parts[0] || null;
        }
      }

      // Parse issue size to numeric
      let issueSizeCr = null;
      if (ipo.issueSize) {
        const match = ipo.issueSize.match(/([\d,.]+)/);
        if (match) issueSizeCr = parseFloat(match[1].replace(/,/g, '')) || null;
      }

      await sql`
        INSERT INTO ipos (
          slug, name, type, status, price_range, price_min, price_max,
          lot_size, issue_size, issue_size_cr, open_date, close_date,
          allotment_date, listing_date, sector, registrar, founders,
          headquarters, founded, description, purpose, drhp_url,
          highlights, risks, risk_score, last_updated
        ) VALUES (
          ${ipo.slug}, ${ipo.name}, ${ipo.type}, ${ipo.status},
          ${ipo.priceRange || null}, ${priceMin}, ${priceMax || ipo.priceMax || null},
          ${ipo.lotSize || null}, ${ipo.issueSize || null}, ${issueSizeCr},
          ${ipo.openDate || null}, ${ipo.closeDate || null},
          ${ipo.allotmentDate || null}, ${ipo.listingDate || null},
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
          issue_size = EXCLUDED.issue_size,
          sector = EXCLUDED.sector,
          listing_date = EXCLUDED.listing_date,
          last_updated = NOW()
      `;
      inserted++;
    } catch (err) {
      console.error(`    ❌ Error inserting IPO ${ipo.name}:`, err.message);
    }
  }
  console.log(`    ✅ ${inserted} IPOs inserted`);
}

// ═══════════════════════════════════════════════════════════════
// SEED HOLDINGS (if fund-holdings.json exists)
// ═══════════════════════════════════════════════════════════════

async function seedHoldings() {
  console.log('\n  🏦 Seeding fund holdings...');
  const holdingsData = readJSON('fund-holdings.json');
  if (!holdingsData || !holdingsData.holdings) {
    console.log('    ⚠️  No holdings data found');
    return;
  }

  // Get fund ID map
  const fundResult = await sql`SELECT id, slug FROM funds`;
  const fundIdMap = {};
  for (const row of fundResult) {
    fundIdMap[row.slug] = row.id;
  }

  // Get/create sectors and stocks
  const sectorCache = {};
  const stockCache = {};

  async function getOrCreateSector(sectorName) {
    if (!sectorName || sectorName.trim() === '') return null;
    const key = sectorName.trim();
    if (sectorCache[key]) return sectorCache[key];
    
    const slug = slugify(key);
    try {
      await sql`INSERT INTO sectors (name, slug) VALUES (${key}, ${slug}) ON CONFLICT (slug) DO NOTHING`;
      const result = await sql`SELECT id FROM sectors WHERE slug = ${slug}`;
      if (result.length > 0) {
        sectorCache[key] = result[0].id;
        return result[0].id;
      }
    } catch (err) {}
    return null;
  }

  async function getOrCreateStock(holding) {
    if (holding.isin) {
      const byIsin = await sql`
        SELECT id FROM stocks WHERE isin = ${holding.isin}
        ORDER BY (sector_id IS NOT NULL) DESC, id ASC LIMIT 1
      `;
      if (byIsin.length > 0) {
        stockCache[holding.isin] = byIsin[0].id;
        return byIsin[0].id;
      }
    }

    const normKey = normalizeStockName(holding.name);
    if (normKey) {
      const byName = await sql`
        SELECT s.id FROM stocks s
        WHERE TRIM(BOTH FROM REGEXP_REPLACE(
          TRIM(BOTH FROM REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  LOWER(TRIM(s.name)),
                  '\\s+\\d{2}/\\d{2}/\\d{4}\\s*$', '', 'g'
                ),
                '\\mlimited\\M', 'ltd', 'gi'
              ),
              '\\mltd\\M', 'ltd', 'gi'
            ),
            '[^a-z0-9]+', ' ', 'g'
          )),
          '\\s*\\mltd\\M\\s*$', '', 'g'
        )) = ${normKey}
        ORDER BY (s.isin IS NOT NULL) DESC, (s.sector_id IS NOT NULL) DESC, s.id ASC
        LIMIT 1
      `;
      if (byName.length > 0) {
        const id = byName[0].id;
        stockCache[normKey] = id;
        if (holding.isin) stockCache[holding.isin] = id;
        return id;
      }
    }

    const key = holding.isin || slugify(holding.name);
    if (stockCache[key]) return stockCache[key];

    const slug = slugify(holding.name);
    let sectorName = String(holding.sector || '').trim();
    if (sectorName && /^\d+$/.test(sectorName)) sectorName = '';
    if (sectorName && /^\[?(CRISIL|ICRA|FITCH|CARE|IND|BWR|Brickwork)/i.test(sectorName)) {
      sectorName = '';
    }
    const sectorId = sectorName ? await getOrCreateSector(sectorName) : null;

    try {
      await sql`
        INSERT INTO stocks (isin, name, slug, sector_id) 
        VALUES (${holding.isin || null}, ${holding.name}, ${slug}, ${sectorId})
        ON CONFLICT (slug) DO UPDATE SET
          isin = COALESCE(stocks.isin, EXCLUDED.isin),
          sector_id = COALESCE(EXCLUDED.sector_id, stocks.sector_id)
      `;
      const result = await sql`SELECT id FROM stocks WHERE slug = ${slug}`;
      if (result.length > 0) {
        stockCache[key] = result[0].id;
        if (holding.isin) stockCache[holding.isin] = result[0].id;
        return result[0].id;
      }
    } catch (err) {}
    return null;
  }

  // Parse month string to date
  function monthToDate(monthStr) {
    const months = { 'January': '01', 'February': '02', 'March': '03', 'April': '04', 
                     'May': '05', 'June': '06', 'July': '07', 'August': '08',
                     'September': '09', 'October': '10', 'November': '11', 'December': '12' };
    const parts = monthStr.split(' ');
    if (parts.length !== 2) return null;
    const mm = months[parts[0]];
    if (!mm) return null;
    return `${parts[1]}-${mm}-01`;
  }

  let totalInserted = 0;
  const fundSlugs = Object.keys(holdingsData.holdings);
  
  for (const fundSlug of fundSlugs) {
    const fundData = holdingsData.holdings[fundSlug];
    const fundId = fundIdMap[fundSlug];
    
    if (!fundId) {
      // Fund not in our funds table, skip
      continue;
    }

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
        } catch (err) {
          // Skip duplicate/error
        }
      }
    }
  }

  console.log(`    ✅ ${totalInserted} holding records inserted`);
  console.log(`    📋 ${Object.keys(stockCache).length} stocks in universe`);
  console.log(`    📋 ${Object.keys(sectorCache).length} sectors created`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Database Seed from JSON');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  if (!isDbConfigured()) {
    console.error('\n  ❌ DATABASE_URL not configured. Cannot seed.');
    console.error('  Set DATABASE_URL in .env file first.\n');
    process.exit(1);
  }

  console.log('  ✅ Database connection configured');

  await seedMutualFunds();
  await seedIPOs();
  await seedHoldings();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  ✅ Seed complete!');
  console.log('  Next steps:');
  console.log('    1. Run migrations/003_materialized_views.sql');
  console.log('    2. Run: node db/compute/compute-signals.mjs');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
