#!/usr/bin/env node
/**
 * Copy Super Investor / 1% Club data from staging Neon → production Neon.
 *
 * Reads:
 *   STAGING_DATABASE_URL  or  .env.staging-backup  (source)
 *   DATABASE_URL          from .env                 (destination — must be prod)
 *
 * Remaps stock_id and entity_id via slug. Does NOT touch ipos/funds/fund_holdings.
 *
 * Usage:
 *   node scripts/node-with-ca.mjs db/seed/sync-si-staging-to-prod.mjs
 *   node scripts/node-with-ca.mjs db/seed/sync-si-staging-to-prod.mjs --dry-run
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 2000;

function cleanUrl(url) {
  return url.replace(/&?channel_binding=require/gi, '').trim();
}

function readUrlFromFile(path) {
  if (!existsSync(path)) return null;
  const line = readFileSync(path, 'utf-8')
    .split('\n')
    .find((l) => l.startsWith('DATABASE_URL='));
  return line ? cleanUrl(line.slice('DATABASE_URL='.length)) : null;
}

const prodUrl = cleanUrl(process.env.DATABASE_URL || readUrlFromFile(join(ROOT, '.env')) || '');
const stagingUrl = cleanUrl(
  process.env.STAGING_DATABASE_URL || readUrlFromFile(join(ROOT, '.env.staging-backup')) || '',
);

if (!prodUrl || !stagingUrl) {
  console.error('❌ Need DATABASE_URL (prod .env) and STAGING_DATABASE_URL or .env.staging-backup');
  process.exit(1);
}

function hostOf(url) {
  try {
    return new URL(url.replace(/^postgresql:/, 'postgres:')).hostname;
  } catch {
    return '?';
  }
}

if (hostOf(prodUrl) === hostOf(stagingUrl)) {
  console.error('❌ Source and destination are the same host — aborting.');
  process.exit(1);
}

console.log(`Source (staging): ${hostOf(stagingUrl)}`);
console.log(`Target (prod):    ${hostOf(prodUrl)}`);
if (DRY_RUN) console.log('DRY RUN — no writes\n');

const src = new pg.Client({ connectionString: stagingUrl });
const dst = new pg.Client({ connectionString: prodUrl });
await src.connect();
await dst.connect();

const SI_TRUNCATE = `
  TRUNCATE TABLE
    entity_conviction,
    entity_overlaps,
    entity_stock_signals,
    entity_changes,
    entity_holdings,
    entity_quarterly_stats,
    shareholding_pattern_holders,
    sast_filings,
    tracked_entity_tags,
    entity_strategies,
    corporate_actions,
    pipeline_runs,
    tracked_entities
  RESTART IDENTITY CASCADE
`;

async function count(client, table) {
  const r = await client.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
  return r.rows[0].c;
}

async function buildSlugMap(srcClient, dstClient, table) {
  const [sRows, dRows] = await Promise.all([
    srcClient.query(`SELECT id, slug FROM ${table} WHERE slug IS NOT NULL`),
    dstClient.query(`SELECT id, slug FROM ${table} WHERE slug IS NOT NULL`),
  ]);
  const dstBySlug = new Map(dRows.rows.map((r) => [r.slug, r.id]));
  const map = new Map();
  let missing = 0;
  for (const r of sRows.rows) {
    const nid = dstBySlug.get(r.slug);
    if (nid != null) map.set(r.id, nid);
    else missing += 1;
  }
  return { map, missing, total: sRows.rows.length };
}

async function buildSiStockSlugMap(srcClient, dstClient) {
  const sRows = (
    await srcClient.query(`
      SELECT DISTINCT s.id, s.slug
      FROM stocks s
      WHERE s.slug IS NOT NULL
        AND s.id IN (
          SELECT stock_id FROM shareholding_pattern_holders
          UNION SELECT stock_id FROM entity_holdings
          UNION SELECT stock_id FROM entity_changes
          UNION SELECT stock_id FROM entity_stock_signals
          UNION SELECT stock_id FROM entity_conviction
        )
    `)
  ).rows;
  const dRows = (await dstClient.query(`SELECT id, slug FROM stocks WHERE slug IS NOT NULL`)).rows;
  const dstBySlug = new Map(dRows.map((r) => [r.slug, r.id]));
  const map = new Map();
  let missing = 0;
  for (const r of sRows) {
    const nid = dstBySlug.get(r.slug);
    if (nid != null) map.set(r.id, nid);
    else missing += 1;
  }
  return { map, missing, total: sRows.length };
}

async function ensureStocks(srcClient, dstClient) {
  const prodSlugs = new Set(
    (await dstClient.query(`SELECT slug FROM stocks WHERE slug IS NOT NULL`)).rows.map((r) => r.slug),
  );
  const candidates = (
    await srcClient.query(`
      SELECT DISTINCT s.name, s.slug, s.nse_symbol, s.bse_code, s.isin, s.sector_id, s.market_cap_category
      FROM stocks s
      WHERE s.slug IS NOT NULL
        AND s.id IN (
          SELECT stock_id FROM shareholding_pattern_holders
          UNION SELECT stock_id FROM entity_holdings
          UNION SELECT stock_id FROM entity_changes
          UNION SELECT stock_id FROM entity_stock_signals
          UNION SELECT stock_id FROM entity_conviction
        )
    `)
  ).rows;
  const missing = candidates.filter((r) => !prodSlugs.has(r.slug));
  if (!missing.length) {
    console.log('  stocks: all SHP slugs present on prod');
    return;
  }
  console.log(`  stocks: inserting ${missing.length} missing rows on prod`);
  if (DRY_RUN) return;
  for (const r of missing) {
    await dstClient.query(
      `INSERT INTO stocks (name, slug, nse_symbol, bse_code, isin, sector_id, market_cap_category)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (slug) DO NOTHING`,
      [r.name, r.slug, r.nse_symbol, r.bse_code, r.isin, r.sector_id, r.market_cap_category],
    );
  }
}

async function copyTrackedEntities() {
  const rows = (await src.query(`SELECT * FROM tracked_entities ORDER BY id`)).rows;
  console.log(`\n▶ tracked_entities: ${rows.length} rows`);
  if (DRY_RUN) return;
  for (const r of rows) {
    await dst.query(
      `INSERT INTO tracked_entities (
        name, slug, display_name, type, tier, aliases, focus, bio, location,
        website, photo, registration_id, aum_cr, fee_structure, parent_org,
        tracked_since, is_active, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      ON CONFLICT (slug) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        type = EXCLUDED.type,
        tier = EXCLUDED.tier,
        aliases = EXCLUDED.aliases,
        focus = EXCLUDED.focus,
        bio = EXCLUDED.bio,
        location = EXCLUDED.location,
        updated_at = NOW()`,
      [
        r.name,
        r.slug,
        r.display_name,
        r.type,
        r.tier,
        r.aliases,
        r.focus,
        r.bio,
        r.location,
        r.website,
        r.photo,
        r.registration_id,
        r.aum_cr,
        r.fee_structure,
        r.parent_org,
        r.tracked_since,
        r.is_active,
        r.created_at,
        r.updated_at,
      ],
    );
  }
}

async function copySimpleTable(table, columns, remap = {}) {
  const total = await count(src, table);
  console.log(`\n▶ ${table}: ${total} rows`);
  if (!total || DRY_RUN) return;

  const colList = columns.join(', ');
  const rows = (await src.query(`SELECT ${colList} FROM ${table}`)).rows;
  for (const r of rows) {
    const vals = columns.map((c) => {
      if (remap[c]) return remap[c](r[c], r);
      return r[c];
    });
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    await dst.query(
      `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
       ON CONFLICT DO NOTHING`,
      vals,
    );
  }
}

async function copyShareholdingHolders(stockMap, entityMap) {
  const total = await count(src, 'shareholding_pattern_holders');
  console.log(`\n▶ shareholding_pattern_holders: ${total} rows (batched)`);
  if (!total || DRY_RUN) return;

  const COLS = 11;
  const INSERT_BATCH = 200;
  let offset = 0;
  let inserted = 0;
  let skipped = 0;

  while (offset < total) {
    const batch = (
      await src.query(
        `SELECT stock_id, holder_name, holder_type, shares, pct_of_company,
                source, source_url, is_promoter, entity_id, match_confidence, quarter
         FROM shareholding_pattern_holders
         ORDER BY id
         LIMIT $1 OFFSET $2`,
        [BATCH, offset],
      )
    ).rows;

    const mapped = [];
    for (const r of batch) {
      const stockId = stockMap.get(r.stock_id);
      if (!stockId) {
        skipped += 1;
        continue;
      }
      const entityId = r.entity_id ? entityMap.get(r.entity_id) ?? null : null;
      mapped.push([
        stockId,
        r.holder_name,
        r.holder_type,
        r.shares,
        r.pct_of_company,
        r.source,
        r.source_url,
        r.is_promoter,
        entityId,
        r.match_confidence,
        r.quarter,
      ]);
    }

    for (let i = 0; i < mapped.length; i += INSERT_BATCH) {
      const chunk = mapped.slice(i, i + INSERT_BATCH);
      const values = [];
      const params = [];
      chunk.forEach((row, ri) => {
        const base = ri * COLS;
        values.push(
          `(${row.map((_, ci) => `$${base + ci + 1}`).join(',')})`,
        );
        params.push(...row);
      });
      await dst.query(
        `INSERT INTO shareholding_pattern_holders (
          stock_id, holder_name, holder_type, shares, pct_of_company,
          source, source_url, is_promoter, entity_id, match_confidence, quarter
        ) VALUES ${values.join(',')}
        ON CONFLICT (stock_id, holder_name, quarter) DO UPDATE SET
          holder_type = EXCLUDED.holder_type,
          shares = EXCLUDED.shares,
          pct_of_company = EXCLUDED.pct_of_company,
          entity_id = EXCLUDED.entity_id,
          match_confidence = EXCLUDED.match_confidence`,
        params,
      );
      inserted += chunk.length;
    }

    offset += BATCH;
    process.stdout.write(`\r  … ${Math.min(offset, total)} / ${total}`);
  }
  console.log(`\n  inserted/updated: ${inserted}, skipped (no stock map): ${skipped}`);
}

try {
  console.log('\nStaging counts:');
  for (const t of [
    'tracked_entities',
    'shareholding_pattern_holders',
    'entity_holdings',
    'entity_changes',
    'entity_stock_signals',
  ]) {
    console.log(`  ${t}: ${await count(src, t)}`);
  }

  console.log('\nProd counts (before):');
  for (const t of ['tracked_entities', 'shareholding_pattern_holders', 'entity_holdings']) {
    try {
      console.log(`  ${t}: ${await count(dst, t)}`);
    } catch {
      console.log(`  ${t}: (table missing — run db:migrate-si first)`);
    }
  }

  if (!DRY_RUN) {
    console.log('\n▶ Truncating prod SI tables…');
    await dst.query(SI_TRUNCATE);
    await ensureStocks(src, dst);
    await copyTrackedEntities();
  }

  const stockMapInfo = await buildSiStockSlugMap(src, dst);
  const entityMapInfo = await buildSlugMap(src, dst, 'tracked_entities');
  console.log(
    `\nID maps: stocks ${stockMapInfo.map.size}/${stockMapInfo.total} (${stockMapInfo.missing} unmapped), ` +
      `entities ${entityMapInfo.map.size}/${entityMapInfo.total}`,
  );

  if (stockMapInfo.missing > 0) {
    console.error('❌ Unmapped SI stocks on prod — re-run sync after ensureStocks or db:seed-listed-equities.');
    process.exit(1);
  }

  const stockMap = stockMapInfo.map;
  const entityMap = entityMapInfo.map;

  if (!DRY_RUN) {
    const tags = (await src.query(`SELECT entity_id, tag FROM tracked_entity_tags`)).rows;
    for (const r of tags) {
      const eid = entityMap.get(r.entity_id);
      if (!eid) continue;
      await dst.query(
        `INSERT INTO tracked_entity_tags (entity_id, tag) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [eid, r.tag],
      );
    }
    console.log(`\n▶ tracked_entity_tags: ${tags.length} rows`);

    await copyShareholdingHolders(stockMap, entityMap);

    const eh = (await src.query(`SELECT * FROM entity_holdings`)).rows;
    console.log(`\n▶ entity_holdings: ${eh.length} rows`);
    for (const r of eh) {
      const entityId = entityMap.get(r.entity_id);
      const stockId = stockMap.get(r.stock_id);
      if (!entityId || !stockId) continue;
      await dst.query(
        `INSERT INTO entity_holdings (
          entity_id, strategy_id, stock_id, quarter, shares_held, pct_of_company,
          market_value_cr, is_encumbered, source, source_url, is_preliminary
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (entity_id, strategy_id, stock_id, quarter) DO UPDATE SET
          shares_held = EXCLUDED.shares_held,
          pct_of_company = EXCLUDED.pct_of_company,
          market_value_cr = EXCLUDED.market_value_cr`,
        [
          entityId,
          r.strategy_id,
          stockId,
          r.quarter,
          r.shares_held,
          r.pct_of_company,
          r.market_value_cr,
          r.is_encumbered,
          r.source,
          r.source_url,
          r.is_preliminary,
        ],
      );
    }

    const ec = (await src.query(`SELECT * FROM entity_changes`)).rows;
    console.log(`\n▶ entity_changes: ${ec.length} rows`);
    for (const r of ec) {
      const entityId = entityMap.get(r.entity_id);
      const stockId = stockMap.get(r.stock_id);
      if (!entityId || !stockId) continue;
      await dst.query(
        `INSERT INTO entity_changes (
          entity_id, strategy_id, stock_id, quarter, prev_quarter, change_type,
          prev_shares, new_shares, qty_change, pct_change, value_change_cr
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (entity_id, strategy_id, stock_id, quarter) DO UPDATE SET
          change_type = EXCLUDED.change_type,
          pct_change = EXCLUDED.pct_change,
          value_change_cr = EXCLUDED.value_change_cr`,
        [
          entityId,
          r.strategy_id,
          stockId,
          r.quarter,
          r.prev_quarter,
          r.change_type,
          r.prev_shares,
          r.new_shares,
          r.qty_change,
          r.pct_change,
          r.value_change_cr,
        ],
      );
    }

    const ess = (await src.query(`SELECT * FROM entity_stock_signals`)).rows;
    console.log(`\n▶ entity_stock_signals: ${ess.length} rows`);
    for (const r of ess) {
      const stockId = stockMap.get(r.stock_id);
      if (!stockId) continue;
      await dst.query(
        `INSERT INTO entity_stock_signals (
          stock_id, quarter, investors_holding, fresh_entries, complete_exits,
          increased_count, decreased_count, net_value_change, total_value_held, conviction_score
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (stock_id, quarter) DO UPDATE SET
          investors_holding = EXCLUDED.investors_holding,
          fresh_entries = EXCLUDED.fresh_entries,
          conviction_score = EXCLUDED.conviction_score`,
        [
          stockId,
          r.quarter,
          r.investors_holding,
          r.fresh_entries,
          r.complete_exits,
          r.increased_count,
          r.decreased_count,
          r.net_value_change,
          r.total_value_held,
          r.conviction_score,
        ],
      );
    }

    const eqs = (await src.query(`SELECT * FROM entity_quarterly_stats`)).rows;
    console.log(`\n▶ entity_quarterly_stats: ${eqs.length} rows`);
    for (const r of eqs) {
      const entityId = entityMap.get(r.entity_id);
      if (!entityId) continue;
      await dst.query(
        `INSERT INTO entity_quarterly_stats (
          entity_id, strategy_id, quarter, total_holdings, portfolio_value_cr,
          top5_concentration, hhi, turnover_ratio, large_cap_pct, mid_cap_pct, small_cap_pct
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (entity_id, strategy_id, quarter) DO UPDATE SET
          total_holdings = EXCLUDED.total_holdings,
          portfolio_value_cr = EXCLUDED.portfolio_value_cr`,
        [
          entityId,
          r.strategy_id,
          r.quarter,
          r.total_holdings,
          r.portfolio_value_cr,
          r.top5_concentration,
          r.hhi,
          r.turnover_ratio,
          r.large_cap_pct,
          r.mid_cap_pct,
          r.small_cap_pct,
        ],
      );
    }

    const pr = (await src.query(`SELECT * FROM pipeline_runs ORDER BY id`)).rows;
    console.log(`\n▶ pipeline_runs: ${pr.length} rows`);
    for (const r of pr) {
      await dst.query(
        `INSERT INTO pipeline_runs (
          pipeline, quarter, status, started_at, finished_at, rows_upserted, quality_gate, message, counts_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          r.pipeline,
          r.quarter,
          r.status,
          r.started_at,
          r.finished_at,
          r.rows_upserted,
          r.quality_gate,
          r.message,
          r.counts_json,
        ],
      );
    }
  }

  console.log('\nProd counts (after):');
  if (!DRY_RUN) {
    for (const t of [
      'tracked_entities',
      'shareholding_pattern_holders',
      'entity_holdings',
      'entity_changes',
      'entity_stock_signals',
    ]) {
      console.log(`  ${t}: ${await count(dst, t)}`);
    }
    console.log('\n✅ SI data sync complete. Run: npm run db:refresh-si-views');
  } else {
    console.log('  (dry run — no changes written)');
  }
} catch (err) {
  console.error('\n❌ Sync failed:', err.message);
  process.exit(1);
} finally {
  await src.end();
  await dst.end();
}
