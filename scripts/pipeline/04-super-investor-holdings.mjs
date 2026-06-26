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
 *   --stock-slug=SLUG        Process a single stock by slug (for targeted re-fetch)
 *   --bse-only               Process BSE-only listings (no nse_symbol) only
 *   --missing-only           Re-fetch stocks with no SHP rows for this quarter
 *   --backfill-quarters=N    Backfill last N quarters (parallel cross-quarter fetch)
 *   --concurrency=N          Parallel fetch workers (default: 40; backfill auto-boosts)
 *   --max-minutes=N          Target wall-clock for backfill (default: 20 when backfilling)
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
import { fetchShareholdingPatternBundle, closeSIBrowser, setSiFetchThrottle, setSiFetchOptions } from '../lib/si-sources.mjs';
import { loadOverrides } from '../lib/si-overrides.mjs';
import { mapPool } from '../lib/pool.mjs';
import { inferLatestQuarter, recentCalendarQuarters } from '../lib/si-quarters.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bseOnly = args.includes('--bse-only');
const missingOnly = args.includes('--missing-only');
const stockCountLimit = parseInt((args.find((a) => a.startsWith('--stock-count=')) || '').split('=')[1] || '0', 10) || null;
const stockSlugFilter = (args.find((a) => a.startsWith('--stock-slug=')) || '').split('=')[1] || null;
const quarterOverride = (args.find((a) => a.startsWith('--quarter=')) || '').split('=')[1] || null;
const backfillQuarters = Math.max(0, parseInt((args.find((a) => a.startsWith('--backfill-quarters=')) || '').split('=')[1] || '0', 10) || 0);
const concurrencyArg = parseInt((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || '0', 10) || 0;
const maxMinutesArg = parseInt((args.find((a) => a.startsWith('--max-minutes=')) || '').split('=')[1] || '0', 10) || 0;

const DEFAULT_CONCURRENCY = 40;
const BACKFILL_MAX_CONCURRENCY = 50;
const BACKFILL_BATCH_SIZE = 250;
const SEC_PER_FETCH_ESTIMATE = 1.2;

// ─── Helpers ───────────────────────────────────────────────────

async function fetchSHP(stock, quarter) {
  return fetchShareholdingPatternBundle(stock, quarter);
}

function buildSummaryRow(stock, quarter, summary, holders, sourceUrl) {
  if (!summary || summary.promoterPct == null) return null;

  let individualsGte1 = 0;
  for (const h of holders) {
    if (h.pctOfCompany == null || h.pctOfCompany < 1) continue;
    const { isPromoter, holderType } = classifyHolder(h);
    if (!isPromoter && holderType === 'individual') individualsGte1 += h.pctOfCompany;
  }

  const promoter = Number(summary.promoterPct ?? 0);
  const fii = Number(summary.fiiPct ?? 0);
  const mf = Number(summary.mfPct ?? 0);
  const diiTotal = Number(summary.diiTotalPct ?? 0);
  const diiExMf = Number(summary.diiExMfPct ?? Math.max(0, diiTotal - mf));
  const retail = Math.max(0, Math.round((100 - promoter - fii - mf - diiExMf) * 1000) / 1000);

  return {
    stock_id: stock.id,
    quarter,
    promoter_pct: summary.promoterPct ?? null,
    fii_pct: summary.fiiPct ?? null,
    mf_pct: summary.mfPct ?? null,
    dii_ex_mf_pct: diiExMf || null,
    public_pct: summary.publicPct ?? null,
    individuals_gte1_pct: Math.round(individualsGte1 * 1000) / 1000,
    retail_pct: retail,
    total_pct: summary.totalPct ?? null,
    source_url: sourceUrl ?? null,
  };
}

function classifyHolder(holderRow) {
  const name = (holderRow.holderName || '').toLowerCase();
  const isPromoter =
    name.includes('promoter') ||
    name.includes('promotors') ||
    holderRow.holderType === 'promoter' ||
    holderRow.holderType === 'promotors';

  let holderType = holderRow.holderType || 'unknown';
  if (isPromoter) holderType = 'promoter';
  if (/^fii|foreign\s/i.test(holderType)) holderType = 'fii';
  if (/^dii|mutual\s+fund|insurance|lic/i.test(holderType)) holderType = 'dii';
  if (holderType === 'individuals' || holderType === 'individual') holderType = 'individual';
  if (holderType === 'body corporate') holderType = 'public';

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

/** Sum shares / stake % when multiple filing names map to one entity + stock + quarter. */
function aggregateEntityHoldings(ehRows) {
  const map = new Map();
  for (const row of ehRows) {
    const key = `${row.entity_id}\0${row.strategy_id ?? ''}\0${row.stock_id}\0${row.quarter}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...row });
      continue;
    }
    prev.shares_held = Number(prev.shares_held ?? 0) + Number(row.shares_held ?? 0);
    prev.pct_of_company = Number(prev.pct_of_company ?? 0) + Number(row.pct_of_company ?? 0);
    prev.is_encumbered = Boolean(prev.is_encumbered || row.is_encumbered);
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

function resolveConcurrency(taskCount, { isBackfill = false } = {}) {
  const base = concurrencyArg || DEFAULT_CONCURRENCY;
  if (!isBackfill || taskCount === 0) return base;

  const targetMinutes = maxMinutesArg || 20;
  const needed = Math.ceil((taskCount * SEC_PER_FETCH_ESTIMATE) / (targetMinutes * 60));
  const boosted = Math.max(base, needed);
  return Math.min(BACKFILL_MAX_CONCURRENCY, boosted);
}

async function loadResolver(ctx) {
  ctx.log('Loading tracked entities...');
  const entities = await sql`SELECT * FROM tracked_entities WHERE is_active = true`;
  const resolver = buildEntityResolver(entities);
  ctx.log(`Indexed ${resolver.indexStats.entityCount} entities (${resolver.indexStats.indexEntries} name variants)`);
  return resolver;
}

async function loadStocksForQuarter(quarter) {
  const slugFilter = stockSlugFilter
    ? sql`AND s.slug = ${stockSlugFilter}`
    : sql``;
  return bseOnly
    ? sql`
        SELECT id, name, slug, nse_symbol, bse_code, isin
        FROM stocks s
        WHERE NULLIF(TRIM(bse_code), '') IS NOT NULL
          AND NULLIF(TRIM(nse_symbol), '') IS NULL
          ${slugFilter}
          ${missingOnly ? sql`AND NOT EXISTS (
            SELECT 1 FROM shareholding_pattern_holders sph
            WHERE sph.stock_id = s.id AND sph.quarter = ${quarter}::DATE
          )` : sql``}
        ORDER BY bse_code
        ${stockCountLimit ? sql`LIMIT ${stockCountLimit}` : sql``}
      `
    : sql`
        SELECT id, name, slug, nse_symbol, bse_code, isin
        FROM stocks s
        WHERE (NULLIF(TRIM(nse_symbol), '') IS NOT NULL
           OR NULLIF(TRIM(bse_code), '') IS NOT NULL)
          ${slugFilter}
          ${missingOnly ? sql`AND NOT EXISTS (
            SELECT 1 FROM shareholding_pattern_holders sph
            WHERE sph.stock_id = s.id AND sph.quarter = ${quarter}::DATE
          )` : sql``}
        ORDER BY COALESCE(NULLIF(TRIM(nse_symbol), ''), NULLIF(TRIM(bse_code), ''))
        ${stockCountLimit ? sql`LIMIT ${stockCountLimit}` : sql``}
      `;
}

/** Flat (stock × quarter) task list for parallel backfill. */
async function loadBackfillTasks(quarters) {
  const quarterDates = quarters.map((q) => q);
  const slugFilter = stockSlugFilter
    ? sql`AND s.slug = ${stockSlugFilter}`
    : sql``;
  return bseOnly
    ? sql`
        SELECT s.id, s.name, s.slug, s.nse_symbol, s.bse_code, s.isin, t.quarter::text AS quarter
        FROM stocks s
        CROSS JOIN unnest(${quarterDates}::date[]) AS t(quarter)
        WHERE NULLIF(TRIM(s.bse_code), '') IS NOT NULL
          AND NULLIF(TRIM(s.nse_symbol), '') IS NULL
          ${slugFilter}
          ${missingOnly ? sql`AND NOT EXISTS (
            SELECT 1 FROM shareholding_pattern_holders sph
            WHERE sph.stock_id = s.id AND sph.quarter = t.quarter
          )` : sql``}
        ORDER BY t.quarter, s.id
        ${stockCountLimit ? sql`LIMIT ${stockCountLimit}` : sql``}
      `
    : sql`
        SELECT s.id, s.name, s.slug, s.nse_symbol, s.bse_code, s.isin, t.quarter::text AS quarter
        FROM stocks s
        CROSS JOIN unnest(${quarterDates}::date[]) AS t(quarter)
        WHERE (NULLIF(TRIM(s.nse_symbol), '') IS NOT NULL
           OR NULLIF(TRIM(bse_code), '') IS NOT NULL)
          ${slugFilter}
          ${missingOnly ? sql`AND NOT EXISTS (
            SELECT 1 FROM shareholding_pattern_holders sph
            WHERE sph.stock_id = s.id AND sph.quarter = t.quarter
          )` : sql``}
        ORDER BY t.quarter, s.id
        ${stockCountLimit ? sql`LIMIT ${stockCountLimit}` : sql``}
      `;
}

async function aggregateFetchResults(fetchResults, quarter, resolver) {
  const sphRows = [];
  const ehRows = [];
  const summaryRows = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let promoterCount = 0;

  for (const { stock, holders, summary, sourceUrl } of fetchResults) {
    const parsed = processStockHolders(stock, holders, quarter, resolver);
    sphRows.push(...parsed.sphRows);
    ehRows.push(...parsed.ehRows);
    matchedCount += parsed.matchedCount;
    unmatchedCount += parsed.unmatchedCount;
    promoterCount += parsed.promoterCount;
    const summaryRow = buildSummaryRow(stock, quarter, summary, holders, sourceUrl);
    if (summaryRow) summaryRows.push(summaryRow);
  }

  return {
    sphRows: dedupeRows(sphRows, (r) => `${r.stock_id}\0${r.holder_name}\0${r.quarter}`),
    ehRows: aggregateEntityHoldings(ehRows),
    summaryRows: dedupeRows(summaryRows, (r) => `${r.stock_id}\0${r.quarter}`),
    matchedCount,
    unmatchedCount,
    promoterCount,
  };
}

async function upsertQuarterRows(sphRows, ehRows, summaryRows = []) {
  if (dryRun) return;
  if (sphRows.length > 0) {
    await upsertMany(
      'shareholding_pattern_holders',
      sphRows,
      'stock_id, holder_name, quarter',
      ['holder_type', 'shares', 'pct_of_company', 'source', 'source_url', 'is_promoter', 'entity_id', 'match_confidence'],
    );
  }
  if (ehRows.length > 0) {
    await upsertMany(
      'entity_holdings',
      ehRows,
      'entity_id, strategy_id, stock_id, quarter',
      ['shares_held', 'pct_of_company', 'market_value_cr', 'is_encumbered', 'source', 'source_url', 'is_preliminary'],
    );
  }
  if (summaryRows.length > 0) {
    await upsertMany(
      'stock_shp_summary',
      summaryRows,
      'stock_id, quarter',
      ['promoter_pct', 'fii_pct', 'mf_pct', 'dii_ex_mf_pct', 'public_pct', 'individuals_gte1_pct', 'retail_pct', 'total_pct', 'source_url'],
    );
  }
}

async function upsertBatchResults(batchResults, resolver) {
  const byQuarter = new Map();
  for (const row of batchResults) {
    if (!byQuarter.has(row.quarter)) byQuarter.set(row.quarter, []);
    byQuarter.get(row.quarter).push({
      stock: row.stock,
      holders: row.holders,
      summary: row.summary,
      sourceUrl: row.sourceUrl,
    });
  }

  let sph = 0;
  let eh = 0;
  for (const [quarter, results] of byQuarter) {
    const agg = await aggregateFetchResults(results, quarter, resolver);
    await upsertQuarterRows(agg.sphRows, agg.ehRows, agg.summaryRows);
    sph += agg.sphRows.length;
    eh += agg.ehRows.length;
  }
  return { sph, eh };
}

async function runQuarterQualityGate(ctx, quarter, rowCount) {
  if (dryRun || missingOnly) return;
  const count = rowCount ?? (await sql`
    SELECT COUNT(*)::int AS count FROM shareholding_pattern_holders WHERE quarter = ${quarter}::DATE
  `)[0].count;
  if (count === 0) return;
  ctx.log(`Quality gate for ${quarter} (${count} SPH rows)...`);
  const gate = await qualityGateRowCount(
    { ...ctx, _pipeline: 'superinvestor' },
    { currentRows: count, minRatio: 0.70 },
  );
  if (!gate.pass) throw new Error(`Quality gate failed for ${quarter}: ${gate.reason}`);
  ctx.log(`  ✅ passed (${Math.round(gate.ratio * 100)}% vs prior)`);
}

async function finalizeQuarter(ctx, quarter, fetchResults, resolver) {
  const stocks = [...new Map(fetchResults.map(({ stock }) => [stock.id, stock])).values()];
  const sphRows = [];
  const ehRows = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let promoterCount = 0;
  const reviewQueue = [];

  const summaryRows = [];

  for (const { stock, holders, summary, sourceUrl } of fetchResults) {
    const parsed = processStockHolders(stock, holders, quarter, resolver);
    sphRows.push(...parsed.sphRows);
    ehRows.push(...parsed.ehRows);
    matchedCount += parsed.matchedCount;
    unmatchedCount += parsed.unmatchedCount;
    promoterCount += parsed.promoterCount;
    reviewQueue.push(...parsed.reviewQueue);
    const summaryRow = buildSummaryRow(stock, quarter, summary, holders, sourceUrl);
    if (summaryRow) summaryRows.push(summaryRow);
  }

  ctx.log(`Checking overrides for ${quarter}...`);
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
    ctx.log(`  +${overrides.length} override rows (${overrideMatched} matched)`);
  }

  ctx.log(`Q${quarter}: ${sphRows.length} ≥1% rows from ${fetchResults.length} stocks (${matchedCount} curated matches)`);

  const dedupedSph = dedupeRows(sphRows, (r) => `${r.stock_id}\0${r.holder_name}\0${r.quarter}`);
  const dedupedEh = aggregateEntityHoldings(ehRows);

  await upsertQuarterRows(dedupedSph, dedupedEh, dedupeRows(summaryRows, (r) => `${r.stock_id}\0${r.quarter}`));
  await runQuarterQualityGate(ctx, quarter, dedupedSph.length);

  return {
    sph: dedupedSph.length,
    eh: dedupedEh.length,
    matched: matchedCount,
    unmatched: unmatchedCount,
    promoters: promoterCount,
    reviewQueue,
  };
}

async function runParallelBackfill(quarters) {
  console.log(`  📚 Parallel backfill: ${quarters.length} quarters (${quarters[0]} → ${quarters[quarters.length - 1]})`);
  const ctx = await startRun('superinvestor', { quarter: quarters[quarters.length - 1] });

  try {
    const resolver = await loadResolver(ctx);
    const taskRows = await loadBackfillTasks(quarters);
    const tasks = taskRows.map((r) => ({
      quarter: String(r.quarter).slice(0, 10),
      stock: {
        id: r.id,
        name: r.name,
        slug: r.slug,
        nse_symbol: r.nse_symbol,
        bse_code: r.bse_code,
        isin: r.isin,
      },
    }));

    if (tasks.length === 0) {
      ctx.log('All quarters already populated — nothing to fetch.');
      await endRun(ctx, {
        status: 'success',
        rowsUpserted: 0,
        qualityGate: 'skipped',
        message: 'Backfill: all quarters complete',
        counts: { sph: 0, eh: 0, matched: 0, unmatched: 0, promoters: 0 },
      });
      console.log('\n  ✅ Backfill complete (already up to date)\n');
      return;
    }

    const workers = resolveConcurrency(tasks.length, { isBackfill: true });
    const targetMin = maxMinutesArg || 20;
    ctx.log(`${tasks.length} stock×quarter tasks · ${workers} parallel workers · ~${targetMin} min target`);
    setSiFetchOptions({ throttle: 0, skipPuppeteer: true, timeoutMs: 20_000 });

    const started = Date.now();
    let completed = 0;
    let emptyResults = 0;
    let totalSph = 0;
    let totalEh = 0;

    for (let offset = 0; offset < tasks.length; offset += BACKFILL_BATCH_SIZE) {
      const chunk = tasks.slice(offset, offset + BACKFILL_BATCH_SIZE);
      const batchNum = Math.floor(offset / BACKFILL_BATCH_SIZE) + 1;
      const batchTotal = Math.ceil(tasks.length / BACKFILL_BATCH_SIZE);
      ctx.log(`Batch ${batchNum}/${batchTotal}: fetching ${chunk.length} tasks...`);

      const batchResults = await mapPool(chunk, workers, async ({ stock, quarter }) => {
        const bundle = await fetchSHP(stock, quarter);
        completed++;
        if (!bundle.holders.length) emptyResults++;
        if (completed % 250 === 0 || completed === tasks.length) {
          const elapsed = (Date.now() - started) / 1000;
          const rate = completed / Math.max(elapsed, 1);
          const eta = Math.round((tasks.length - completed) / Math.max(rate, 0.01));
          ctx.log(`  … ${completed}/${tasks.length} fetched (${elapsed.toFixed(0)}s elapsed, ~${eta}s left, ${workers} workers, ${emptyResults} empty)`);
        }
        return {
          stock,
          quarter,
          holders: bundle.holders,
          summary: bundle.summary,
          sourceUrl: bundle.sourceUrl,
        };
      });

      const written = await upsertBatchResults(batchResults, resolver);
      totalSph += written.sph;
      totalEh += written.eh;
      ctx.log(`  Batch ${batchNum} written (${written.sph} SPH rows)`);
    }

    const fetchSec = ((Date.now() - started) / 1000).toFixed(0);
    ctx.log(`All batches done in ${fetchSec}s`);

    for (const quarter of quarters) {
      await runQuarterQualityGate(ctx, quarter);
    }

    const wallMin = ((Date.now() - started) / 60000).toFixed(1);
    await endRun(ctx, {
      status: 'success',
      rowsUpserted: totalSph + totalEh,
      qualityGate: missingOnly ? 'skipped' : 'passed',
      message: `Backfill ${quarters.length}Q: ${totalSph} SPH rows, ${totalEh} entity holdings (${wallMin} min)`,
      counts: { sph: totalSph, eh: totalEh, tasks: tasks.length, workers },
    });

    console.log(`\n  ✅ Parallel backfill complete in ${wallMin} min`);
    console.log(`     ${totalSph} ≥1% holder rows · ${totalEh} curated holdings`);
    console.log('     Next: npm run db:compute-si:all\n');
  } catch (err) {
    await endRun(ctx, { status: 'failed', qualityGate: 'skipped', message: err.message });
    console.error('\n  ❌ Parallel backfill failed:', err.message);
    process.exit(1);
  } finally {
    setSiFetchOptions({ skipPuppeteer: false, timeoutMs: 20_000 });
    await closeSIBrowser().catch(() => {});
  }
}

async function runPipelineQuarter(quarter) {
  console.log(`  📊 Quarter: ${quarter}`);
  const ctx = await startRun('superinvestor', { quarter });
  const workers = resolveConcurrency(0);

  try {
    const resolver = await loadResolver(ctx);
    ctx.log(`Loading stock universe${missingOnly ? ' (missing SHP only)' : ''}...`);
    const stocks = await loadStocksForQuarter(quarter);
    ctx.log(`${stocks.length} stocks to process`);

    if (stocks.length === 0) {
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

    ctx.log(`Fetching SHP (${workers} workers)...`);
    const fetchStarted = Date.now();
    let completed = 0;

    const fetchResults = await mapPool(stocks, workers, async (stock) => {
      const bundle = await fetchSHP(stock, quarter);
      completed++;
      if (completed % 50 === 0 || completed === stocks.length) {
        const elapsed = ((Date.now() - fetchStarted) / 1000).toFixed(0);
        ctx.log(`  … ${completed}/${stocks.length} stocks (${elapsed}s)`);
      }
      return {
        stock,
        holders: bundle.holders,
        summary: bundle.summary,
        sourceUrl: bundle.sourceUrl,
      };
    });

    const stats = await finalizeQuarter(ctx, quarter, fetchResults, resolver);

    await endRun(ctx, {
      status: 'success',
      rowsUpserted: stats.sph + stats.eh,
      qualityGate: stats.sph > 0 ? (missingOnly ? 'skipped' : 'passed') : 'skipped',
      message: `Q${quarter}: ${stats.sph} ≥1% holders (${stats.matched} curated)`,
      counts: { sph: stats.sph, eh: stats.eh, matched: stats.matched, unmatched: stats.unmatched, promoters: stats.promoters },
    });

    console.log('\n  ✅ Pipeline 4 complete');
    console.log(`     ${stats.sph} ≥1% holders · ${stats.eh} curated holdings`);
    console.log('     Next: npm run db:compute-si\n');
  } catch (err) {
    await endRun(ctx, { status: 'failed', qualityGate: 'skipped', message: err.message });
    console.error('\n  ❌ Pipeline 4 failed:', err);
    process.exit(1);
  } finally {
    setSiFetchOptions({ skipPuppeteer: false, timeoutMs: 20_000 });
    await closeSIBrowser().catch(() => {});
  }
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 4 — Super Investor Holdings + 1% Club');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  if (dryRun) console.log('  ⚠️  DRY RUN — no DB writes');
  if (missingOnly) console.log('  🔧 MISSING-ONLY — skip stocks/quarters already in DB');
  if (backfillQuarters > 1) console.log(`  ⏱️  Backfill target: ${maxMinutesArg || 20} min wall-clock`);

  requireDb();

  if (backfillQuarters > 1 && !quarterOverride) {
    const quarters = recentCalendarQuarters(backfillQuarters).slice().reverse();
    await runParallelBackfill(quarters);
    return;
  }

  const workers = resolveConcurrency(0);
  console.log(`  ⚡ Concurrency: ${workers}`);
  setSiFetchThrottle(workers > 1 ? 0 : 800);

  const quarter = quarterOverride || inferLatestQuarter();
  await runPipelineQuarter(quarter);
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 4 failed:', err.message);
  process.exit(1);
});
