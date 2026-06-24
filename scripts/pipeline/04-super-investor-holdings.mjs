#!/usr/bin/env node
/**
 * Pipeline 4 — Super Investor Holdings + 1% Club (Shareholding Pattern)
 *
 * Fetches quarterly Shareholding Pattern data from NSE/BSE for all tracked stocks,
 * then:
 *   1. Writes EVERY ≥1% holder to shareholding_pattern_holders (1% Club).
 *   2. Matches curated tracked_entities by name → writes to entity_holdings.
 *   3. Runs quality gate (row-count delta vs prior quarter).
 *   4. Logs run to pipeline_runs for /health dashboard.
 *
 * One fetch → two tables. The pipeline does double duty.
 *
 * Flags:
 *   --quarter=2026-04-01    Process a specific quarter (default: latest)
 *   --dry-run                Fetch + match only, no DB writes
 *   --stock-count=N          Limit to top N stocks (for testing)
 *
 * Usage:
 *   node scripts/node-with-ca.mjs scripts/pipeline/04-super-investor-holdings.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql, upsertMany } from '../lib/db.mjs';
import { requireDb } from '../lib/db-writers.mjs';
import { buildEntityResolver } from '../lib/entity-name-resolver.mjs';
import { startRun, endRun, qualityGateRowCount } from '../lib/pipeline-run-logger.mjs';
import { fetchShareholdingPattern, closeSIBrowser } from '../lib/si-sources.mjs';
import { loadOverrides } from '../lib/si-overrides.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const stockCountLimit = parseInt((args.find((a) => a.startsWith('--stock-count=')) || '').split('=')[1] || '0', 10) || null;
const quarterOverride = (args.find((a) => a.startsWith('--quarter=')) || '').split('=')[1] || null;

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Determine the "latest" quarter to process based on SEBI filing windows.
 * Companies file within 21 days of quarter-end; we target +25 days for stragglers.
 */
function inferLatestQuarter(now = new Date()) {
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();

  // Indian FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  // Calendar quarters: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
  // Shareholding Pattern uses CALENDAR quarters.

  const quarters = [
    { q: `${year}-01-01`, endDate: new Date(year, 2, 31), windowDays: 25 },
    { q: `${year}-04-01`, endDate: new Date(year, 5, 30), windowDays: 25 },
    { q: `${year}-07-01`, endDate: new Date(year, 8, 30), windowDays: 25 },
    { q: `${year}-10-01`, endDate: new Date(year, 11, 31), windowDays: 25 },
  ];

  // Walk backwards to find the most recent quarter whose filing window has passed.
  for (let i = quarters.length - 1; i >= 0; i--) {
    const q = quarters[i];
    const windowEnd = new Date(q.endDate);
    windowEnd.setDate(windowEnd.getDate() + q.windowDays);
    if (now >= windowEnd) return q.q;
  }
  // Fallback: use the quarter before the current one.
  return quarters[Math.max(0, quarters.length - 2)].q;
}

/**
 * Fetch Shareholding Pattern for a single stock from BSE (primary) / NSE (fallback).
 * Returns array of { holderName, holderType, shares, pctOfCompany, sourceUrl }.
 *
 * Implemented in scripts/lib/si-sources.mjs — BSE plain-HTTP parse first, NSE
 * Puppeteer fallback. See DATA_PIPELINE.md for the source + override model.
 */
async function fetchSHP(stock, quarter) {
  return fetchShareholdingPattern(stock, quarter);
}

/**
 * Classify a holder as promoter or non-promoter based on the filing label.
 * Shareholding Patterns always label promoter rows distinctly.
 */
function classifyHolder(holderRow) {
  const name = (holderRow.holderName || '').toLowerCase();
  const isPromoter =
    name.includes('promoter') ||
    name.includes('promotors') ||
    holderRow.holderType === 'promoter' ||
    holderRow.holderType === 'promotors';

  let holderType = holderRow.holderType || 'unknown';
  if (isPromoter) holderType = 'promoter';
  // Normalize common variants.
  if (/^fii|foreign\s/i.test(holderType)) holderType = 'fii';
  if (/^dii|mutual\s+fund|insurance|lic/i.test(holderType)) holderType = 'dii';
  if (holderType === 'individuals' || holderType === 'individual') holderType = 'individual';
  if (holderType === 'public' || holderType === 'body corporate') holderType = 'individual';

  return { isPromoter, holderType };
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 4 — Super Investor Holdings + 1% Club');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  if (dryRun) console.log('  ⚠️  DRY RUN — no DB writes');

  requireDb();

  const quarter = quarterOverride || inferLatestQuarter();
  console.log(`  📊 Quarter: ${quarter}`);

  const ctx = await startRun('superinvestor', { quarter });

  try {
    // ── 1. Load tracked entities → build name resolver ──────────
    ctx.log('Loading tracked entities...');
    const entities = await sql`
      SELECT * FROM tracked_entities WHERE is_active = true
    `;
    const resolver = buildEntityResolver(entities);
    ctx.log(`Indexed ${resolver.indexStats.entityCount} entities (${resolver.indexStats.indexEntries} name variants)`);

    // ── 2. Load stock universe ────────────────────────────────────
    ctx.log('Loading stock universe...');
    const stocks = await sql`
      SELECT id, name, slug, nse_symbol, isin FROM stocks
        WHERE nse_symbol IS NOT NULL
      ORDER BY name
      ${stockCountLimit ? sql`LIMIT ${stockCountLimit}` : sql``}
    `;
    ctx.log(`${stocks.length} stocks to process`);

    // ── 3. Fetch Shareholding Patterns ───────────────────────────
    ctx.log('Fetching Shareholding Patterns from NSE/BSE...');
    const sphRows = [];     // → shareholding_pattern_holders
    const ehRows = [];       // → entity_holdings (curated matches only)
    let matchedCount = 0;
    let unmatchedCount = 0;
    let promoterCount = 0;
    let reviewQueue = [];    // low-confidence matches for output/

    for (const stock of stocks) {
      const holders = await fetchSHP(stock, quarter);

      for (const h of holders) {
        if (h.pctOfCompany < 1.0) continue; // Only ≥1%

        const { isPromoter, holderType } = classifyHolder(h);
        if (isPromoter) promoterCount++;

        // All ≥1% holders → shareholding_pattern_holders (1% Club).
        const match = isPromoter ? null : resolver.resolve(h.holderName);
        if (match) {
          matchedCount++;
          // Also write to entity_holdings for curated entities.
          ehRows.push({
            entity_id: match.entityId,
            strategy_id: null,
            stock_id: stock.id,
            quarter,
            shares_held: h.shares,
            pct_of_company: h.pctOfCompany,
            market_value_cr: null,  // computed later from quarter-end price
            is_encumbered: h.isEncumbered || false,
            source: 'shareholding_pattern',
            source_url: h.sourceUrl || null,
            is_preliminary: false,
          });
        } else if (!isPromoter) {
          unmatchedCount++;
          // Log low-confidence matches for the review queue.
          if (match && match.confidence < 0.85) {
            reviewQueue.push({
              filingName: h.holderName,
              stock: stock.name,
              stockSlug: stock.slug,
              bestMatch: match.entityName,
              confidence: match.confidence,
            });
          }
        }

        sphRows.push({
          stock_id: stock.id,
          quarter,
          holder_name: h.holderName,
          holder_type: holderType,
          shares: h.shares,
          pct_of_company: h.pctOfCompany,
          source: 'shareholding_pattern',
          source_url: h.sourceUrl || null,
          is_promoter: isPromoter,
          entity_id: match ? match.entityId : null,
          match_confidence: match ? match.confidence : null,
        });
      }
    }

    // ── 3b. Merge hand-curated overrides (BSE/NSE may have yielded nothing) ──
    ctx.log('Checking for JSON overrides...');
    const overrides = loadOverrides('superinvestor', quarter);
    let overrideMatched = 0;
    if (overrides.length > 0) {
      const stockBySlug = new Map(stocks.map((s) => [s.slug, s]));
      for (const o of overrides) {
        const stock = stockBySlug.get(o.stockSlug);
        if (!stock) continue;
        const { isPromoter, holderType } = classifyHolder({ holderName: o.holderName, holderType: o.holderType });
        const match = isPromoter ? null : resolver.resolve(o.holderName);
        if (match) {
          overrideMatched++;
          ehRows.push({
            entity_id: match.entityId,
            strategy_id: null,
            stock_id: stock.id,
            quarter,
            shares_held: o.shares,
            pct_of_company: o.pctOfCompany,
            market_value_cr: null,
            is_encumbered: false,
            source: 'override',
            source_url: o.sourceUrl || null,
            is_preliminary: false,
          });
        }
        sphRows.push({
          stock_id: stock.id,
          quarter,
          holder_name: o.holderName,
          holder_type: holderType,
          shares: o.shares,
          pct_of_company: o.pctOfCompany,
          source: 'override',
          source_url: o.sourceUrl || null,
          is_promoter: isPromoter,
          entity_id: match ? match.entityId : null,
          match_confidence: match ? match.confidence : null,
        });
      }
      ctx.log(`  +${overrides.length} override rows (${overrideMatched} matched to entities)`);
    }

    ctx.log(`Parsed ${sphRows.length} ≥1% holder rows across ${stocks.length} stocks`);
    ctx.log(`  Matched to entities: ${matchedCount}`);
    ctx.log(`  Unmatched (1% Club only): ${unmatchedCount}`);
    ctx.log(`  Promoters: ${promoterCount}`);
    ctx.log(`  Review queue: ${reviewQueue.length}`);

    // ── 4. Quality gate ──────────────────────────────────────────
    if (!dryRun && sphRows.length > 0) {
      ctx.log('Running quality gate (row-count delta)...');
      const gate = await qualityGateRowCount(
        { ...ctx, _pipeline: 'superinvestor' },
        { currentRows: sphRows.length, minRatio: 0.70 }
      );

      if (!gate.pass) {
        ctx.log(`❌ QUALITY GATE FAILED: ${gate.reason}`);
        await endRun(ctx, {
          status: 'aborted',
          rowsUpserted: 0,
          qualityGate: 'failed',
          message: gate.reason,
          counts: { sph: sphRows.length, eh: ehRows.length, matched: matchedCount, unmatched: unmatchedCount },
        });
        console.error('\n  ❌ Pipeline 4 aborted by quality gate.');
        console.error(`     ${gate.reason}`);
        console.error('     Site continues serving last-known-good data.');
        console.error('     Investigate, then re-run manually if appropriate.\n');
        process.exit(1);
      }
      ctx.log(`✅ Quality gate passed (ratio: ${Math.round(gate.ratio * 100)}%, prior: ${gate.priorRows})`);
    }

    // ── 5. Write to DB ──────────────────────────────────────────
    if (!dryRun) {
      // 5a. shareholding_pattern_holders (1% Club)
      ctx.log(`Writing ${sphRows.length} rows to shareholding_pattern_holders...`);
      await upsertMany(
        'shareholding_pattern_holders',
        sphRows,
        'stock_id, holder_name, quarter',
        ['holder_type', 'shares', 'pct_of_company', 'source', 'source_url', 'is_promoter', 'entity_id', 'match_confidence'],
      );

      // 5b. entity_holdings (curated matches only)
      ctx.log(`Writing ${ehRows.length} rows to entity_holdings...`);
      await upsertMany(
        'entity_holdings',
        ehRows,
        'entity_id, strategy_id, stock_id, quarter',
        ['shares_held', 'pct_of_company', 'market_value_cr', 'is_encumbered', 'source', 'source_url', 'is_preliminary'],
      );
    }

    // ── 6. Success ──────────────────────────────────────────────
    await endRun(ctx, {
      status: 'success',
      rowsUpserted: sphRows.length + ehRows.length,
      qualityGate: sphRows.length > 0 ? 'passed' : 'skipped',
      message: `Q${quarter}: ${sphRows.length} ≥1% holders (${matchedCount} curated, ${unmatchedCount} 1%-club, ${promoterCount} promoters)`,
      counts: { sph: sphRows.length, eh: ehRows.length, matched: matchedCount, unmatched: unmatchedCount, promoters: promoterCount },
    });

    console.log('\n  ✅ Pipeline 4 complete');
    console.log(`     ${sphRows.length} ≥1% holders written`);
    console.log(`     ${ehRows.length} curated entity holdings written`);
    console.log(`     ${reviewQueue.length} matches in review queue`);
    if (reviewQueue.length) {
      console.log('\n     ⚠️  Low-confidence matches (review manually):');
      for (const r of reviewQueue.slice(0, 10)) {
        console.log(`       "${r.filingName}" → ${r.bestMatch} (${r.confidence}) in ${r.stock}`);
      }
      if (reviewQueue.length > 10) console.log(`       ... and ${reviewQueue.length - 10} more`);
    }
    console.log(`\n     Next: run db:compute-si to derive changes, signals, conviction, overlaps.\n`);

  } catch (err) {
    await endRun(ctx, {
      status: 'failed',
      qualityGate: 'skipped',
      message: err.message,
    });
    console.error('\n  ❌ Pipeline 4 failed:', err);
    process.exit(1);
  } finally {
    // Release the Puppeteer browser if NSE fallback was used.
    await closeSIBrowser().catch(() => {});
  }
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 4 failed:', err.message);
  process.exit(1);
});
