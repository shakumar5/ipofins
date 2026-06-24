#!/usr/bin/env node
/**
 * Pipeline 6 — PMS Holdings
 *
 * Fetches quarterly strategy-level holdings from PMS provider websites + SEBI
 * PMS database. Each PMS provider publishes their holdings on their own site
 * (e.g. Marcellus, Ask, Motilal) within 15 days of quarter-end.
 *
 * Key differences from pipeline 04:
 *   - Source: provider websites, not NSE/BSE Shareholding Pattern.
 *   - Holdings are strategy-level (entity_strategies), not just entity-level.
 *   - Disclosure cadence: provider-chosen dates (not fixed by SEBI calendar).
 *
 * Flags:
 *   --quarter=2026-04-01    Process a specific quarter (default: latest)
 *   --dry-run                Fetch + match only, no DB writes
 *
 * Usage:
 *   node scripts/node-with-ca.mjs scripts/pipeline/06-pms-holdings.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql, upsertMany } from '../lib/db.mjs';
import { requireDb } from '../lib/db-writers.mjs';
import { startRun, endRun } from '../lib/pipeline-run-logger.mjs';
import { fetchPMSHoldings } from '../lib/pms-sources.mjs';
import { loadOverrides } from '../lib/si-overrides.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const quarterOverride = (args.find((a) => a.startsWith('--quarter=')) || '').split('=')[1] || null;

/**
 * Fetch PMS holdings for a single provider + strategy.
 *
 * Implemented in scripts/lib/pms-sources.mjs — one fetcher per provider
 * (Marcellus, ASK, Motilal Oswal, Helios, Equity Intelligence, WhiteOak),
 * each handling its own HTML/PDF format. Returns [] on failure. See
 * DATA_PIPELINE.md for the provider-coverage + override model.
 */

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 6 — PMS Holdings');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  if (dryRun) console.log('  ⚠️  DRY RUN — no DB writes');

  requireDb();

  // Infer quarter (same logic as pipeline 04).
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const quarter = quarterOverride || `${year}-${String(Math.floor(month / 3) * 3 + 1).padStart(2, '0')}-01`;
  console.log(`  📊 Quarter: ${quarter}`);

  const ctx = await startRun('pms', { quarter });

  try {
    // ── 1. Load PMS entities + strategies ────────────────────────
    ctx.log('Loading PMS providers + strategies...');
    const providers = await sql`
      SELECT te.*, es.id AS strategy_id, es.name AS strategy_name, es.slug AS strategy_slug
      FROM tracked_entities te
      LEFT JOIN entity_strategies es ON es.entity_id = te.id
      WHERE te.type = 'pms' AND te.is_active = true
      ORDER BY te.id, es.id
    `;

    // Group strategies by provider.
    const byProvider = new Map();
    for (const row of providers) {
      if (!byProvider.has(row.id)) {
        byProvider.set(row.id, { entity: row, strategies: [] });
      }
      if (row.strategy_id) {
        byProvider.get(row.id).strategies.push(row);
      }
    }
    ctx.log(`${byProvider.size} PMS providers, ${providers.length - byProvider.size} strategies`);

    // ── 2. Load stock universe ───────────────────────────────────
    const stockRows = await sql`
      SELECT id, name, slug, nse_symbol, isin FROM stocks WHERE nse_symbol IS NOT NULL
    `;
    const stockBySymbol = new Map();
    const stockByName = new Map();
    for (const s of stockRows) {
      if (s.nse_symbol) stockBySymbol.set(s.nse_symbol.toUpperCase(), s);
      stockByName.set(s.name.toUpperCase().trim(), s);
    }

    // ── 3. Fetch holdings per provider × strategy ───────────────
    const ehRows = [];
    let totalHoldings = 0;

    for (const [, provider] of byProvider) {
      const strategies = provider.strategies.length > 0 ? provider.strategies : [{ strategy_id: null }];
      for (const strategy of strategies) {
        ctx.log(`Fetching ${provider.entity.name}${strategy.strategy_name ? ` / ${strategy.strategy_name}` : ''}...`);
        const holdings = await fetchPMSHoldings(provider.entity, strategy, quarter);

        for (const h of holdings) {
          const stock = stockBySymbol.get((h.nseSymbol || '').toUpperCase())
            || stockByName.get((h.stockName || '').toUpperCase().trim());
          if (!stock) continue;

          ehRows.push({
            entity_id: provider.entity.id,
            strategy_id: strategy.strategy_id || null,
            stock_id: stock.id,
            quarter,
            shares_held: h.shares,
            pct_of_company: h.pctOfCompany,
            market_value_cr: null,
            is_encumbered: false,
            source: 'pms_disclosure',
            source_url: h.sourceUrl || null,
            is_preliminary: false,
          });
          totalHoldings++;
        }
      }
    }

    // ── 3b. Merge hand-curated overrides (provider sites may have failed) ──
    ctx.log('Checking for JSON overrides...');
    const overrides = loadOverrides('pms', quarter);
    let overrideCount = 0;
    if (overrides.length > 0) {
      const providerBySlug = new Map();
      for (const [, p] of byProvider) providerBySlug.set(p.entity.slug, p.entity);
      for (const o of overrides) {
        const provider = providerBySlug.get(o.providerSlug);
        if (!provider) continue;
        const stock = stockBySymbol.get((o.nseSymbol || '').toUpperCase())
          || stockByName.get((o.stockName || '').toUpperCase().trim());
        if (!stock) continue;
        ehRows.push({
          entity_id: provider.id,
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
        overrideCount++;
        totalHoldings++;
      }
      ctx.log(`  +${overrideCount} override rows merged`);
    }

    ctx.log(`Total PMS holdings parsed: ${totalHoldings}`);

    // ── 4. Write to DB ─────────────────────────────────────────
    if (!dryRun && ehRows.length > 0) {
      ctx.log(`Writing ${ehRows.length} rows to entity_holdings...`);
      await upsertMany(
        'entity_holdings',
        ehRows,
        'entity_id, strategy_id, stock_id, quarter',
        ['shares_held', 'pct_of_company', 'market_value_cr', 'is_encumbered', 'source', 'source_url', 'is_preliminary'],
      );
    }

    // ── 5. Success ──────────────────────────────────────────────
    await endRun(ctx, {
      status: 'success',
      rowsUpserted: ehRows.length,
      qualityGate: 'skipped',
      message: `PMS Q${quarter}: ${ehRows.length} holdings across ${byProvider.size} providers`,
      counts: { holdings: ehRows.length, providers: byProvider.size },
    });

    console.log('\n  ✅ Pipeline 6 (PMS) complete');
    console.log(`     ${ehRows.length} strategy-level holdings written`);
    console.log(`\n     Next: run db:compute-si to derive changes, signals, conviction.\n`);

  } catch (err) {
    await endRun(ctx, {
      status: 'failed',
      qualityGate: 'skipped',
      message: err.message,
    });
    console.error('\n  ❌ Pipeline 6 failed:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 6 failed:', err.message);
  process.exit(1);
});
