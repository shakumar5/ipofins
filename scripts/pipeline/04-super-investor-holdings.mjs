#!/usr/bin/env node
/**
 * Pipeline 4 — Super Investor Holdings + 1% Club (Shareholding Pattern)
 *
 * Fetches quarterly Shareholding Pattern data from NSE/BSE for all NSE-listed
 * equities in `stocks` (seeded via db:seed-listed-equities — not the MF subset).
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
 *   --bse-only               Process BSE-only listings (no nse_symbol) only
 *   --missing-only           Re-fetch stocks with no SHP rows for this quarter
 *   --concurrency=N          Parallel fetch workers (default: 40; use 1 for sequential)
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
import { fetchShareholdingPattern, closeSIBrowser, setSiFetchThrottle } from '../lib/si-sources.mjs';
import { loadOverrides } from '../lib/si-overrides.mjs';
import { mapPool } from '../lib/pool.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bseOnly = args.includes('--bse-only');
const missingOnly = args.includes('--missing-only');
const stockCountLimit = parseInt((args.find((a) => a.startsWith('--stock-count=')) || '').split('=')[1] || '0', 10) || null;
const quarterOverride = (args.find((a) => a.startsWith('--quarter=')) || '').split('=')[1] || null;
const concurrency = Math.max(1, parseInt((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || '40', 10) || 40);

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

function dedupeRows(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const prev = map.get(key);
    if (!prev || (row.pct_of_company ?? 0) > (prev.pct_of_company ?? 0)) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

function processStockHolders(stock, holders, quarter, resolver) {
  const sphRows = [];
  const ehRows = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let promoterCount = 0;
  const reviewQueue = [];

  for (const h of holders) {
    if (h.pctOfCompany == null || !Number.isFinite(h.pctOfCompany) || h.pctOfCompany < 1.0) continue;

    const { isPromoter, holderType } = classifyHolder(h);
    if (isPromoter) promoterCount++;

    const match = isPromoter ? null : resolver.resolve(h.holderName);
    if (match) {
      matchedCount++;
      ehRows.push({
        entity_id: match.entityId,
        strategy_id: null,
        stock_id: stock.id,
        quarter,
        shares_held: h.shares,
        pct_of_company: h.pctOfCompany,
        market_value_cr: null,
        is_encumbered: h.isEncumbered || false,
        source: 'shareholding_pattern',
        source_url: h.sourceUrl || null,
        is_preliminary: false,
      });
    } else if (!isPromoter) {
      unmatchedCount++;
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

  return { sphRows, ehRows, matchedCount, unmatchedCount, promoterCount, reviewQueue };
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 4 — Super Investor Holdings + 1% Club');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  if (dryRun) console.log('  ⚠️  DRY RUN — no DB writes');
  if (missingOnly) console.log('  🔧 MISSING-ONLY — stocks without SHP for this quarter');
  console.log(`  ⚡ Concurrency: ${concurrency}`);

  requireDb();
  setSiFetchThrottle(concurrency > 1 ? 0 : 800);

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

    // ── 2. Load stock universe (NSE-listed + BSE-only equities) ──
    ctx.log(`Loading stock universe (${bseOnly ? 'BSE-only' : 'NSE + BSE-only'} listed equities${missingOnly ? ', missing SHP only' : ''})...`);
    const stocks = bseOnly
      ? await sql`
          SELECT id, name, slug, nse_symbol, bse_code, isin
          FROM stocks s
          WHERE NULLIF(TRIM(bse_code), '') IS NOT NULL
            AND NULLIF(TRIM(nse_symbol), '') IS NULL
            ${missingOnly ? sql`AND NOT EXISTS (
              SELECT 1 FROM shareholding_pattern_holders sph
              WHERE sph.stock_id = s.id AND sph.quarter = ${quarter}::DATE
            )` : sql``}
          ORDER BY bse_code
          ${stockCountLimit ? sql`LIMIT ${stockCountLimit}` : sql``}
        `
      : await sql`
          SELECT id, name, slug, nse_symbol, bse_code, isin
          FROM stocks s
          WHERE NULLIF(TRIM(nse_symbol), '') IS NOT NULL
             OR NULLIF(TRIM(bse_code), '') IS NOT NULL
            ${missingOnly ? sql`AND NOT EXISTS (
              SELECT 1 FROM shareholding_pattern_holders sph
              WHERE sph.stock_id = s.id AND sph.quarter = ${quarter}::DATE
            )` : sql``}
          ORDER BY COALESCE(NULLIF(TRIM(nse_symbol), ''), NULLIF(TRIM(bse_code), ''))
          ${stockCountLimit ? sql`LIMIT ${stockCountLimit}` : sql``}
        `;
    ctx.log(`${stocks.length} stocks to process`);

    if (stocks.length === 0) {
      ctx.log('Nothing to fetch — all stocks already have SHP data for this quarter.');
      await endRun(ctx, {
        status: 'success',
        rowsUpserted: 0,
        qualityGate: 'skipped',
        message: `Q${quarter}: no missing stocks`,
        counts: { sph: 0, eh: 0, matched: 0, unmatched: 0, promoters: 0 },
      });
      console.log('\n  ✅ Pipeline 4 complete (nothing to do)\n');
      return;
    }

    // ── 3. Fetch Shareholding Patterns (parallel) ────────────────
    ctx.log(`Fetching Shareholding Patterns from NSE/BSE (${concurrency} workers)...`);
    const fetchStarted = Date.now();
    let completed = 0;

    const fetchResults = await mapPool(stocks, concurrency, async (stock) => {
      const holders = await fetchSHP(stock, quarter);
      completed++;
      if (completed % 50 === 0 || completed === stocks.length) {
        const elapsed = ((Date.now() - fetchStarted) / 1000).toFixed(0);
        ctx.log(`  … ${completed}/${stocks.length} stocks fetched (${elapsed}s)`);
      }
      return { stock, holders };
    });

    const sphRows = [];
    const ehRows = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    let promoterCount = 0;
    let reviewQueue = [];

    for (const { stock, holders } of fetchResults) {
      const parsed = processStockHolders(stock, holders, quarter, resolver);
      sphRows.push(...parsed.sphRows);
      ehRows.push(...parsed.ehRows);
      matchedCount += parsed.matchedCount;
      unmatchedCount += parsed.unmatchedCount;
      promoterCount += parsed.promoterCount;
      reviewQueue.push(...parsed.reviewQueue);
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

    const dedupedSph = dedupeRows(sphRows, (r) => `${r.stock_id}\0${r.holder_name}\0${r.quarter}`);
    const dedupedEh = dedupeRows(ehRows, (r) => `${r.entity_id}\0${r.strategy_id ?? ''}\0${r.stock_id}\0${r.quarter}`);
    if (dedupedSph.length < sphRows.length) {
      ctx.log(`  Deduped ${sphRows.length - dedupedSph.length} duplicate SHP rows before write`);
    }

    // ── 4. Quality gate ──────────────────────────────────────────
    if (!dryRun && !missingOnly && dedupedSph.length > 0) {
      ctx.log('Running quality gate (row-count delta)...');
      const gate = await qualityGateRowCount(
        { ...ctx, _pipeline: 'superinvestor' },
        { currentRows: dedupedSph.length, minRatio: 0.70 }
      );

      if (!gate.pass) {
        ctx.log(`❌ QUALITY GATE FAILED: ${gate.reason}`);
        await endRun(ctx, {
          status: 'aborted',
          rowsUpserted: 0,
          qualityGate: 'failed',
          message: gate.reason,
          counts: { sph: dedupedSph.length, eh: dedupedEh.length, matched: matchedCount, unmatched: unmatchedCount },
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
      ctx.log(`Writing ${dedupedSph.length} rows to shareholding_pattern_holders...`);
      await upsertMany(
        'shareholding_pattern_holders',
        dedupedSph,
        'stock_id, holder_name, quarter',
        ['holder_type', 'shares', 'pct_of_company', 'source', 'source_url', 'is_promoter', 'entity_id', 'match_confidence'],
      );

      // 5b. entity_holdings (curated matches only)
      ctx.log(`Writing ${dedupedEh.length} rows to entity_holdings...`);
      await upsertMany(
        'entity_holdings',
        dedupedEh,
        'entity_id, strategy_id, stock_id, quarter',
        ['shares_held', 'pct_of_company', 'market_value_cr', 'is_encumbered', 'source', 'source_url', 'is_preliminary'],
      );
    }

    // ── 6. Success ──────────────────────────────────────────────
    await endRun(ctx, {
      status: 'success',
      rowsUpserted: dedupedSph.length + dedupedEh.length,
      qualityGate: dedupedSph.length > 0 ? (missingOnly ? 'skipped' : 'passed') : 'skipped',
      message: `Q${quarter}: ${dedupedSph.length} ≥1% holders (${matchedCount} curated, ${unmatchedCount} 1%-club, ${promoterCount} promoters)`,
      counts: { sph: dedupedSph.length, eh: dedupedEh.length, matched: matchedCount, unmatched: unmatchedCount, promoters: promoterCount },
    });

    console.log('\n  ✅ Pipeline 4 complete');
    console.log(`     ${dedupedSph.length} ≥1% holders written`);
    console.log(`     ${dedupedEh.length} curated entity holdings written`);
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
