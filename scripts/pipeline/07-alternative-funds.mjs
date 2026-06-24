#!/usr/bin/env node
/**
 * Pipeline 7 — Alternative Funds Holdings (AIF + SIF)
 *
 * Fetches holdings data for AIF (Cat I/II/III) and SIF (2024 vehicle) entities.
 * Sources, in priority order:
 *   1. SAST Form B filings (from pipeline 08 — this pipeline cross-references
 *      them). Most AIFs (Cat II/III) holding >2% MUST file SAST within 2 trading
 *      days, so this is the PRIMARY data path.
 *   2. Provider voluntary disclosures (Westbridge, Nalanda, Abakkus, …) — the
 *      SECONDARY path; implemented in scripts/lib/aif-sources.mjs. Many AIFs
 *      publish no public page; SAST covers them.
 *   3. Hand-curated `altfunds-{quarter}.json` overrides (see si-overrides.mjs).
 *
 * AIFs often take long-term strategic stakes (PE-style). The pipeline:
 *   1. Cross-references sast_filings for AIF/SIF entities.
 *   2. Promotes any is_preliminary=true SAST matches to confirmed entity_holdings.
 *   3. Fetches provider disclosures (per strategy, for SIFs that have them).
 *   4. Merges JSON overrides as a last resort.
 *
 * Flags:
 *   --quarter=2026-04-01    Process a specific quarter
 *   --dry-run
 *
 * Usage:
 *   node scripts/node-with-ca.mjs scripts/pipeline/07-alternative-funds.mjs
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql, upsertMany } from '../lib/db.mjs';
import { requireDb } from '../lib/db-writers.mjs';
import { startRun, endRun } from '../lib/pipeline-run-logger.mjs';
import { fetchAIFDisclosures } from '../lib/aif-sources.mjs';
import { loadOverrides } from '../lib/si-overrides.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const quarterOverride = (args.find((a) => a.startsWith('--quarter=')) || '').split('=')[1] || null;

/**
 * Fetch voluntary AIF/SIF provider disclosures.
 *
 * Implemented in scripts/lib/aif-sources.mjs — one fetcher per entity slug
 * (Westbridge, Nalanda, ChrysCap, Abakkus, Malabar, Stealview, Schweitzer,
 * UTI-SIF, HDFC-SIF), each handling its own HTML/PDF format and returning []
 * on failure or when a fund has no public page (SAST cross-reference covers
 * it). See DATA_PIPELINE.md for the AIF coverage + override model.
 */

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 7 — Alternative Funds (AIF + SIF)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  if (dryRun) console.log('  ⚠️  DRY RUN — no DB writes');

  requireDb();

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const quarter = quarterOverride || `${year}-${String(Math.floor(month / 3) * 3 + 1).padStart(2, '0')}-01`;
  console.log(`  📊 Quarter: ${quarter}`);

  const ctx = await startRun('altfunds', { quarter });

  try {
    // ── 1. Load AIF + SIF entities ──────────────────────────────
    ctx.log('Loading AIF + SIF entities...');
    const entities = await sql`
      SELECT te.*, es.id AS strategy_id, es.name AS strategy_name
      FROM tracked_entities te
      LEFT JOIN entity_strategies es ON es.entity_id = te.id
      WHERE te.type IN ('aif', 'sif') AND te.is_active = true
      ORDER BY te.id, es.id
    `;

    const byEntity = new Map();
    for (const row of entities) {
      if (!byEntity.has(row.id)) byEntity.set(row.id, { entity: row, strategies: [] });
      if (row.strategy_id) byEntity.get(row.id).strategies.push(row);
    }
    ctx.log(`${byEntity.size} entities loaded (aif + sif)`);

    // ── 2. Cross-reference SAST filings for these entities ────────
    ctx.log('Cross-referencing SAST filings for AIF/SIF entities...');
    const entityIds = [...byEntity.keys()];
    const sastMatches = entityIds.length > 0
      ? await sql`
          SELECT sf.*, te.slug AS entity_slug
          FROM sast_filings sf
          JOIN tracked_entities te ON te.id = sf.entity_id
          WHERE sf.entity_id = ANY(${entityIds})
            AND sf.is_preliminary = true
            AND sf.filing_date >= ${quarter}::date - INTERVAL '3 months'
          ORDER BY sf.filing_date DESC
        `
      : [];
    ctx.log(`Found ${sastMatches.length} SAST filings for tracked AIF/SIF entities`);

    // ── 3. Load stock universe ──────────────────────────────────
    const stockRows = await sql`
      SELECT id, name, slug, nse_symbol, isin FROM stocks WHERE nse_symbol IS NOT NULL
    `;
    // SAST rows already carry stock_id — keep a fast lookup to validate them.
    const stockById = new Map(stockRows.map((s) => [s.id, s]));
    // Provider disclosures + overrides carry names/symbols — resolve to a stock.
    const stockBySymbol = new Map();
    const stockByName = new Map();
    for (const s of stockRows) {
      if (s.nse_symbol) stockBySymbol.set(s.nse_symbol.toUpperCase(), s);
      stockByName.set(s.name.toUpperCase().trim(), s);
    }

    // ── 4. Build entity_holdings from SAST + provider disclosures ─
    const ehRows = [];

    // 4a. From SAST matches.
    for (const sf of sastMatches) {
      if (!stockById.has(sf.stock_id)) continue;

      // Promote SAST match to proper quarterly entity_holding.
      ehRows.push({
        entity_id: sf.entity_id,
        strategy_id: null,
        stock_id: sf.stock_id,
        quarter,
        shares_held: sf.post_shares,
        pct_of_company: sf.post_pct,
        market_value_cr: null,
        is_encumbered: false,
        source: 'sast',
        source_url: sf.source_url,
        is_preliminary: false, // Quarterly pipeline promotes it to confirmed.
      });

      // Mark SAST filing as no longer preliminary.
      if (!dryRun) {
        await sql`UPDATE sast_filings SET is_preliminary = false WHERE id = ${sf.id}`;
      }
    }

    // 4b. From provider disclosures (SIF strategies get their own strategy_id).
    let disclosureCount = 0;
    for (const [, entityObj] of byEntity) {
      const strategies = entityObj.strategies.length > 0 ? entityObj.strategies : [{ strategy_id: null }];
      for (const strategy of strategies) {
        ctx.log(`Fetching ${entityObj.entity.name}${strategy.strategy_name ? ` / ${strategy.strategy_name}` : ''} disclosures...`);
        const holdings = await fetchAIFDisclosures(entityObj.entity, quarter);
        for (const h of holdings) {
          const stock = stockBySymbol.get((h.nseSymbol || '').toUpperCase())
            || stockByName.get((h.stockName || '').toUpperCase().trim());
          if (!stock) continue;

          ehRows.push({
            entity_id: entityObj.entity.id,
            strategy_id: strategy.strategy_id || null,
            stock_id: stock.id,
            quarter,
            shares_held: h.shares,
            pct_of_company: h.pctOfCompany,
            market_value_cr: null,
            is_encumbered: false,
            source: 'aif_disclosure',
            source_url: h.sourceUrl || null,
            is_preliminary: false,
          });
          disclosureCount++;
        }
      }
    }

    // 4c. Merge hand-curated overrides (provider sites may have failed).
    ctx.log('Checking for JSON overrides...');
    const overrides = loadOverrides('altfunds', quarter);
    let overrideCount = 0;
    if (overrides.length > 0) {
      const entityBySlug = new Map();
      for (const [, e] of byEntity) entityBySlug.set(e.entity.slug, e.entity);
      for (const o of overrides) {
        const entity = entityBySlug.get(o.entitySlug);
        if (!entity) continue;
        const stock = stockBySymbol.get((o.nseSymbol || '').toUpperCase())
          || stockByName.get((o.stockName || '').toUpperCase().trim());
        if (!stock) continue;
        ehRows.push({
          entity_id: entity.id,
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
      }
      ctx.log(`  +${overrideCount} override rows merged`);
    }

    ctx.log(`Total alternative-fund holdings: ${ehRows.length}`);

    // ── 5. Write to DB ───────────────────────────────────────────
    if (!dryRun && ehRows.length > 0) {
      ctx.log(`Writing ${ehRows.length} rows to entity_holdings...`);
      await upsertMany(
        'entity_holdings',
        ehRows,
        'entity_id, strategy_id, stock_id, quarter',
        ['shares_held', 'pct_of_company', 'market_value_cr', 'is_encumbered', 'source', 'source_url', 'is_preliminary'],
      );
    }

    // ── 6. Success ───────────────────────────────────────────────
    await endRun(ctx, {
      status: 'success',
      rowsUpserted: ehRows.length,
      qualityGate: 'skipped',
      message: `Alt-funds Q${quarter}: ${ehRows.length} holdings (${sastMatches.length} SAST, ${disclosureCount} disclosures, ${overrideCount} overrides)`,
      counts: { holdings: ehRows.length, sast: sastMatches.length, disclosures: disclosureCount, overrides: overrideCount },
    });

    console.log('\n  ✅ Pipeline 7 (Alternative Funds) complete');
    console.log(`     ${ehRows.length} holdings (${sastMatches.length} from SAST, ${disclosureCount} from disclosures, ${overrideCount} overrides)`);
    console.log(`\n     Next: run db:compute-si to derive changes, signals, conviction.\n`);

  } catch (err) {
    await endRun(ctx, {
      status: 'failed',
      qualityGate: 'skipped',
      message: err.message,
    });
    console.error('\n  ❌ Pipeline 7 failed:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 7 failed:', err.message);
  process.exit(1);
});
