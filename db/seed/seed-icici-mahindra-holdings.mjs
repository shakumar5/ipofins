#!/usr/bin/env node
/**
 * Targeted holdings seed with EXPLICIT parser→DB slug map (no fuzzy matcher).
 * Also restores funds corrupted by a prior bad match run.
 *
 * Run: node --use-system-ca db/seed/seed-icici-mahindra-holdings.mjs
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { slugify } from '../../scripts/lib/fund-match.mjs';
import {
  buildStockIdResolver,
  buildListingLookup,
  isDebtInstrument,
  isMutualFundSchemeHolding,
  sanitizeSectorName,
} from '../../scripts/lib/stock-utils.mjs';
import {
  normalizeEquityHoldingRow,
  normalizeStockListingRow,
  isInternationalEquityFund,
} from '../../scripts/lib/listing-codes.mjs';
import { unpackMonthHoldings } from '../../scripts/lib/holdings-month.mjs';
import {
  bulkUpsertFundHoldings,
  bulkUpsertFundPortfolioStats,
  bulkUpsertSectors,
  bulkUpsertStocks,
  closePgPool,
} from '../../scripts/lib/pg-bulk.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(ROOT, 'src', 'data');

/** parser slug → preferred DB fund slug (exact) */
const PARSER_TO_DB = {
  'icici-prudential-focused-equity-fund': 'icici-prudential-focused-equity-fund-direct-plan',
  'icici-prudential-large-cap-fund': 'icici-prudential-bluechip-fund',
  'icici-prudential-flexicap-fund': 'icici-prudential-flexicap-fund-direct-plan',
  'icici-prudential-large-mid-cap-fund': 'icici-prudential-large-mid-cap-fund-direct-plan',
  'icici-prudential-midcap-fund': 'icici-prudential-midcap-fund-direct-plan',
  'icici-prudential-smallcap-fund': 'icici-prudential-smallcap-fund-direct-plan',
  'mahindra-manulife-flexi-cap-fund': 'mahindra-manulife-flexi-cap-fund-direct-plan',
  'mahindra-manulife-large-mid-cap-fund': 'mahindra-manulife-large-mid-cap-fund-direct-plan',
  'mahindra-manulife-mid-cap-fund': 'mahindra-manulife-mid-cap-fund-direct-plan',
  'mahindra-manulife-small-cap-fund': 'mahindra-manulife-small-cap-fund-direct-plan',
  'mahindra-manulife-large-cap-fund': 'mahindra-manulife-large-cap-fund-direct-plan',
  'mahindra-manulife-focused-fund': 'mahindra-manulife-focused-fund-direct-plan',
  // Mirae Asset
  'mirae-asset-flexi-cap-fund': 'mirae-asset-flexi-cap-fund-direct-plan',
  'mirae-asset-midcap-fund': 'mirae-asset-mid-cap-fund-direct-plan',
  'mirae-asset-small-cap-fund': 'mirae-asset-small-cap-fund-direct-plan',
  'mirae-asset-focused-fund': 'mirae-asset-focused-fund-direct-plan',
  'mirae-asset-large-cap-fund': 'mirae-asset-large-cap-fund-direct-plan',
  'mirae-asset-large-midcap-fund': 'mirae-asset-large-midcap-fund-direct-plan',
  'mirae-asset-multicap-fund': 'mirae-asset-multicap-fund-direct-plan',
  'mirae-asset-healthcare-fund': 'mirae-asset-healthcare-fund-direct-plan',
  'mirae-asset-infrastructure-fund': 'mirae-asset-infrastructure-fund',
  // White Oak Capital
  'whiteoak-capital-flexi-cap-fund': 'whiteoak-capital-flexi-cap-fund-direct-plan',
  'whiteoak-capital-large-cap-fund': 'whiteoak-capital-large-cap-fund-direct-plan',
  'whiteoak-capital-mid-cap-fund': 'whiteoak-capital-mid-cap-fund-direct-plan',
  'whiteoak-capital-multi-cap-fund': 'whiteoak-capital-multi-cap-fund-direct-plan',
  'whiteoak-capital-large-mid-cap-fund': 'whiteoak-capital-large-mid-cap-fund-direct-plan-growth',
  // DB typo: heathcare
  'whiteoak-capital-pharma-and-healthcare-fund': 'whiteoak-capital-pharma-and-heathcare-fund-direct-plan-growth',
};

// Override via: --months=May 2026,June 2026
const monthArg = process.argv.find((a) => a.startsWith('--months='))?.slice('--months='.length);
const MONTHS = monthArg
  ? monthArg.split(',').map((s) => s.trim()).filter(Boolean)
  : ['May 2026', 'June 2026'];

function monthToDate(monthStr) {
  const months = {
    January: '01', February: '02', March: '03', April: '04',
    May: '05', June: '06', July: '07', August: '08',
    September: '09', October: '10', November: '11', December: '12',
  };
  const parts = monthStr.split(' ');
  if (parts.length !== 2) return null;
  const mm = months[parts[0]];
  return mm ? `${parts[1]}-${mm}-01` : null;
}

const envContent = readFileSync(join(ROOT, '.env'), 'utf-8');
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)[1].trim();
process.env.DATABASE_URL = dbUrl;
const sql = neon(dbUrl);

async function main() {
  const path = join(DATA_DIR, 'fund-holdings.json');
  if (!existsSync(path)) throw new Error('Missing src/data/fund-holdings.json');
  const holdingsData = JSON.parse(readFileSync(path, 'utf-8'));

  const targetDates = [...new Set(MONTHS.map(monthToDate).filter(Boolean))];
  console.log('\n  Targeted seed (explicit slug map): ICICI + Mahindra + Mirae + WhiteOak');
  console.log(`  Months: ${MONTHS.join(', ')}\n`);

  const fundRows = await sql`SELECT id, slug, name FROM funds`;
  const fundIdBySlug = new Map(fundRows.map((f) => [f.slug, f.id]));

  const stockRows = await sql`SELECT id, slug, name, isin, nse_symbol, bse_code FROM stocks`;
  const resolveListing = buildListingLookup(stockRows, slugify);

  const stockBySlug = new Map();
  const sectorBySlug = new Map();

  for (const [parserSlug, dbSlug] of Object.entries(PARSER_TO_DB)) {
    const fundData = holdingsData.holdings[parserSlug];
    if (!fundData) continue;
    for (const monthStr of MONTHS) {
      if (!fundData[monthStr]) continue;
      const { stocks } = unpackMonthHoldings(fundData[monthStr]);
      for (const holding of stocks) {
        if (
          !holding?.name ||
          isDebtInstrument(holding.name, holding.sector) ||
          isMutualFundSchemeHolding(holding.name, holding.sector)
        ) {
          continue;
        }
        const listing = resolveListing(holding);
        const stockSlug = slugify(holding.name);
        if (!stockSlug || stockBySlug.has(stockSlug)) continue;
        const fundContext = {
          fundSlug: parserSlug,
          fundName: fundData.name,
          internationalFund: isInternationalEquityFund(parserSlug, fundData.name),
        };
        const stockRow = normalizeStockListingRow(
          {
            isin: listing.isin,
            nse_symbol: listing.nse_symbol,
            bse_code: listing.bse_code,
            name: holding.name,
            slug: stockSlug,
          },
          fundContext,
        );
        if (!stockRow) continue;
        const sectorName = sanitizeSectorName(holding.sector);
        if (sectorName) {
          const sectorSlug = slugify(sectorName);
          if (sectorSlug && !sectorBySlug.has(sectorSlug)) {
            sectorBySlug.set(sectorSlug, { name: sectorName, slug: sectorSlug });
          }
        }
        stockBySlug.set(stockSlug, {
          name: holding.name,
          slug: stockSlug,
          isin: stockRow.isin || null,
          nse_symbol: stockRow.nse_symbol || null,
          bse_code: stockRow.bse_code || null,
          sectorSlug: sectorName ? slugify(sectorName) : null,
        });
      }
    }
  }

  if (sectorBySlug.size) await bulkUpsertSectors([...sectorBySlug.values()]);
  const sectorRows = await sql`SELECT id, slug FROM sectors`;
  const sectorIdBySlug = Object.fromEntries(sectorRows.map((r) => [r.slug, r.id]));
  const stockPayload = [...stockBySlug.values()].map((s) => ({
    name: s.name,
    slug: s.slug,
    isin: s.isin,
    nse_symbol: s.nse_symbol,
    bse_code: s.bse_code,
    sector_id: s.sectorSlug ? sectorIdBySlug[s.sectorSlug] ?? null : null,
  }));
  if (stockPayload.length) {
    await bulkUpsertStocks(stockPayload);
    console.log(`  Stocks upserted: ${stockPayload.length}`);
  }

  const stockRowsAfter = await sql`SELECT id, slug, name, isin, nse_symbol, bse_code FROM stocks`;
  const resolveStockId = buildStockIdResolver(stockRowsAfter, slugify);

  const matchedFundIds = new Set();
  const allRows = [];
  const statsRows = [];
  let skippedNoListing = 0;

  for (const [parserSlug, dbSlug] of Object.entries(PARSER_TO_DB)) {
    const fundData = holdingsData.holdings[parserSlug];
    if (!fundData) {
      console.warn(`  ⚠ parser missing ${parserSlug}`);
      continue;
    }
    const fundId = fundIdBySlug.get(dbSlug);
    if (!fundId) {
      console.warn(`  ⚠ DB missing ${dbSlug} (from ${parserSlug})`);
      continue;
    }
    console.log(`  ✓ ${parserSlug} → ${dbSlug}`);
    matchedFundIds.add(fundId);

    for (const monthStr of MONTHS) {
      const monthDate = monthToDate(monthStr);
      if (!monthDate || !fundData[monthStr]) continue;
      const { stocks, totalStocks } = unpackMonthHoldings(fundData[monthStr]);
      if (!stocks.length) continue;

      statsRows.push({ fund_id: fundId, month: monthDate, total_stocks: totalStocks });

      for (const h of stocks) {
        const listing = resolveListing(h);
        const fundContext = {
          fundSlug: parserSlug,
          fundName: fundData.name,
          internationalFund: isInternationalEquityFund(parserSlug, fundData.name),
        };
        const normalized = normalizeEquityHoldingRow(
          {
            ...h,
            isin: listing.isin || h.isin,
            nseSymbol: listing.nse_symbol,
            bseCode: listing.bse_code,
          },
          { enrichFromSlug: false, fundContext },
        );
        if (!normalized) {
          skippedNoListing++;
          continue;
        }
        const stockId = resolveStockId({
          ...h,
          isin: normalized.isin,
          nse_symbol: normalized.nseSymbol,
          bse_code: normalized.bseCode,
        });
        if (!stockId) continue;
        allRows.push({
          fund_id: fundId,
          stock_id: stockId,
          month: monthDate,
          quantity: h.quantity ?? null,
          market_value: h.value ?? null,
          pct_to_nav: h.pct ?? null,
        });
      }
    }
  }

  for (const fundId of matchedFundIds) {
    for (const d of targetDates) {
      await sql`DELETE FROM fund_holdings WHERE fund_id = ${fundId} AND month = ${d}::DATE`;
      await sql`DELETE FROM fund_portfolio_stats WHERE fund_id = ${fundId} AND month = ${d}::DATE`;
    }
  }
  console.log(`  Cleared ${matchedFundIds.size} fund(s) × ${targetDates.length} month(s)`);

  const seen = new Set();
  const deduped = [];
  for (const row of allRows) {
    const key = `${row.fund_id}|${row.stock_id}|${row.month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  console.log(`  Skipped (no listing): ${skippedNoListing}`);
  console.log(`  Rows to insert: ${deduped.length}`);

  let inserted = 0;
  if (deduped.length) inserted = await bulkUpsertFundHoldings(deduped, 3000);

  const statsSeen = new Set();
  const dedupedStats = [];
  for (const row of statsRows) {
    const key = `${row.fund_id}|${row.month}`;
    if (statsSeen.has(key)) continue;
    statsSeen.add(key);
    dedupedStats.push(row);
  }
  let statsInserted = 0;
  if (dedupedStats.length) statsInserted = await bulkUpsertFundPortfolioStats(dedupedStats, 2000);
  await closePgPool();

  console.log(`\n  ✅ Inserted ${inserted} holdings, ${statsInserted} stats`);

  const fundIdList = [...matchedFundIds];
  const check = await sql`
    SELECT f.slug, TRIM(TO_CHAR(fh.month, 'FMMonth YYYY')) AS month, COUNT(*)::int AS n
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id
    WHERE f.id = ANY(${fundIdList})
      AND fh.month = ANY(${targetDates}::date[])
    GROUP BY f.slug, fh.month
    ORDER BY f.slug, fh.month
  `;
  console.log('\n  Verification:');
  for (const r of check) console.log(`    ${r.slug} ${r.month}: ${r.n}`);
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
