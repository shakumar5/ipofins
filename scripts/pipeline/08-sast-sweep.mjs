#!/usr/bin/env node
/**
 * Pipeline 8 — Weekly SAST Sweep (event-driven intra-quarter filings)
 *
 * Monitors NSE/BSE corporate announcement feeds for SAST Form B filings
 * (Substantial Acquisition of Shares). When a tracked entity crosses a 2%
 * threshold, SEBI mandates filing within 2 trading days.
 *
 * This pipeline:
 *   1. Fetches recent SAST filings from NSE/BSE.
 *   2. Matches filer names against tracked_entities.
 *   3. Writes to sast_filings + entity_holdings (is_preliminary = true).
 *   4. Flags matched holdings as preliminary until next quarterly filing confirms.
 *
 * Runs weekly (Monday 3 AM UTC) via GitHub Actions cron.
 *
 * Flags:
 *   --days=N    Look back N days (default: 7)
 *   --dry-run   Fetch + match only, no DB writes
 *
 * Usage:
 *   node scripts/node-with-ca.mjs scripts/pipeline/08-sast-sweep.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql, upsertMany } from '../lib/db.mjs';
import { requireDb } from '../lib/db-writers.mjs';
import { buildEntityResolver } from '../lib/entity-name-resolver.mjs';
import { startRun, endRun } from '../lib/pipeline-run-logger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const lookbackDays = parseInt((args.find((a) => a.startsWith('--days=')) || '').split('=')[1] || '7', 10);

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Fetch recent SAST Form B filings from NSE/BSE corporate announcements.
 *
 * TODO: Implement actual NSE/BSE fetch.
 *   - NSE: https://www1.nseindia.com/marketinfo/company_info/corpInfo_equities.html
 *   - BSE: https://www.bseindia.com/corporates/corporate.html
 *   - Filter by announcement type: SAST (Substantial Acquisition of Shares and Takeovers)
 *
 * Returns array of:
 *   { stockName, nseSymbol, filingDate, filerName, filerType,
 *     prePct, postPct, postShares, transactionNature, sourceUrl }
 */
async function fetchSASTFilings(daysBack) {
  // ── STUB ──────────────────────────────────────────────────────
  // Real implementation will:
  // 1. Query NSE corporate announcements API for SAST-type filings.
  // 2. Parse each filing XML/HTML for holder details.
  // 3. Match stockName to stocks table via nse_symbol.
  // 4. Return structured array.
  return [];
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 8 — Weekly SAST Sweep');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log(`  🔍 Lookback: ${lookbackDays} days`);
  if (dryRun) console.log('  ⚠️  DRY RUN — no DB writes');

  requireDb();

  const ctx = await startRun('sast-sweep');

  try {
    // ── 1. Load tracked entities → build name resolver ──────────
    ctx.log('Loading tracked entities...');
    const entities = await sql`
      SELECT * FROM tracked_entities WHERE is_active = true
    `;
    const resolver = buildEntityResolver(entities);
    ctx.log(`Indexed ${resolver.indexStats.entityCount} entities`);

    // ── 2. Load stock universe ──────────────────────────────────
    const stockRows = await sql`
      SELECT id, name, slug, nse_symbol FROM stocks WHERE nse_symbol IS NOT NULL
    `;
    const stockBySymbol = new Map();
    for (const s of stockRows) {
      if (s.nse_symbol) stockBySymbol.set(s.nse_symbol.toUpperCase(), s);
    }
    ctx.log(`${stockRows.length} stocks indexed`);

    // ── 3. Fetch SAST filings ────────────────────────────────────
    ctx.log(`Fetching SAST filings (last ${lookbackDays} days)...`);
    const filings = await fetchSASTFilings(lookbackDays);
    ctx.log(`Found ${filings.length} SAST filings`);

    // ── 4. Process + match ──────────────────────────────────────
    const sastRows = [];
    const ehRows = [];
    let matchedCount = 0;
    let newCount = 0;

    for (const f of filings) {
      const stock = stockBySymbol.get((f.nseSymbol || '').toUpperCase());
      if (!stock) continue; // Stock not in our universe — skip.

      const match = resolver.resolve(f.filerName);
      const filerType = f.filerType || 'individual';

      sastRows.push({
        stock_id: stock.id,
        entity_id: match ? match.entityId : null,
        filer_name: f.filerName,
        filer_type: filerType,
        filing_date: f.filingDate,
        post_shares: f.postShares,
        post_pct: f.postPct,
        pre_pct: f.prePct,
        transaction_nature: f.transactionNature,
        source_url: f.sourceUrl,
        is_preliminary: true,
      });

      if (match) {
        matchedCount++;
        // Also write a preliminary entity_holding.
        ehRows.push({
          entity_id: match.entityId,
          strategy_id: null,
          stock_id: stock.id,
          quarter: f.filingDate, // Will be re-keyed to proper quarter during quarterly run.
          shares_held: f.postShares,
          pct_of_company: f.postPct,
          market_value_cr: null,
          is_encumbered: false,
          source: 'sast',
          source_url: f.sourceUrl,
          is_preliminary: true,
        });

        // Check if this is new (not in prior entity_holdings).
        const existing = await sql`
          SELECT 1 FROM entity_holdings
          WHERE entity_id = ${match.entityId} AND stock_id = ${stock.id}
          LIMIT 1
        `;
        if (!existing.length) newCount++;
      }
    }

    ctx.log(`Matched ${matchedCount} filings to tracked entities`);
    ctx.log(`New entity-stock pairs: ${newCount}`);

    // ── 5. Write to DB ──────────────────────────────────────────
    if (!dryRun) {
      if (sastRows.length) {
        ctx.log(`Writing ${sastRows.length} rows to sast_filings...`);
        await upsertMany(
          'sast_filings',
          sastRows,
          'stock_id, filer_name, filing_date',
          ['entity_id', 'filer_type', 'post_shares', 'post_pct', 'pre_pct', 'transaction_nature', 'source_url', 'is_preliminary'],
        );
      }
      if (ehRows.length) {
        ctx.log(`Writing ${ehRows.length} preliminary rows to entity_holdings...`);
        // Use a temporary quarter key for SAST interim data.
        // The quarterly pipeline will overwrite with the proper quarter.
        for (const row of ehRows) {
          await sql`
            INSERT INTO entity_holdings (
              entity_id, strategy_id, stock_id, quarter, shares_held,
              pct_of_company, market_value_cr, is_encumbered, source,
              source_url, is_preliminary
            ) VALUES (
              ${row.entity_id}, ${row.strategy_id}, ${row.stock_id},
              ${row.quarter}, ${row.shares_held}, ${row.pct_of_company},
              ${row.market_value_cr}, ${row.is_encumbered}, ${row.source},
              ${row.source_url}, ${row.is_preliminary}
            )
            ON CONFLICT (entity_id, strategy_id, stock_id, quarter) DO UPDATE SET
              shares_held    = EXCLUDED.shares_held,
              pct_of_company = EXCLUDED.pct_of_company,
              source         = EXCLUDED.source,
              is_preliminary = EXCLUDED.is_preliminary
          `;
        }
      }
    }

    // ── 6. Success ──────────────────────────────────────────────
    await endRun(ctx, {
      status: 'success',
      rowsUpserted: sastRows.length + ehRows.length,
      qualityGate: 'skipped', // SAST sweep doesn't have a row-count gate.
      message: `${filings.length} SAST filings processed (${matchedCount} matched, ${newCount} new pairs)`,
      counts: { filings: filings.length, matched: matchedCount, new: newCount },
    });

    console.log('\n  ✅ SAST sweep complete');
    console.log(`     ${filings.length} filings checked, ${matchedCount} matched, ${newCount} new holdings`);
    if (ehRows.length) {
      console.log('     Preliminary holdings flagged — will be confirmed in next quarterly filing.');
    }
    console.log('');

  } catch (err) {
    await endRun(ctx, {
      status: 'failed',
      qualityGate: 'skipped',
      message: err.message,
    });
    console.error('\n  ❌ SAST sweep failed:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n  ❌ SAST sweep failed:', err.message);
  process.exit(1);
});
