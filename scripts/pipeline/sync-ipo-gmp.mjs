#!/usr/bin/env node
/**
 * Sync IPO GMP → ipo_gmp_history (+ ipo_gmp_community when available).
 *
 * 1. Scrape unofficial GMP from InvestorGain JSON API (scripts/lib/gmp-sources.mjs)
 * 2. Merge manual overrides from data/ipo-gmp-curated.json (same slug wins over scrape)
 * 3. Match IPO names → Neon slugs and upsert today's row
 *
 * Run: npm run pipeline:gmp
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { startRun, endRun } from '../lib/pipeline-run-logger.mjs';
import { fetchInvestorgainGMP, GMP_SOURCE_INVESTOR_GAIN } from '../lib/gmp-sources.mjs';
import { fuzzyMatch } from '../lib/ipo-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GMP_FILE = join(ROOT, 'data/ipo-gmp-curated.json');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  return readFileSync(envPath, 'utf-8').match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? null;
}

function loadCuratedEntries() {
  if (!existsSync(GMP_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(GMP_FILE, 'utf-8'));
    return raw.entries ?? [];
  } catch {
    return [];
  }
}

function matchIpoByName(name, ipos) {
  return ipos.find((ipo) => fuzzyMatch(ipo.name, name)) ?? null;
}

async function upsertGmpRow(sql, { ipoId, gmp, today, sourceUrl }) {
  await sql`
    INSERT INTO ipo_gmp_history (ipo_id, date, gmp)
    VALUES (${ipoId}, ${today}::date, ${gmp})
    ON CONFLICT (ipo_id, date) DO UPDATE SET gmp = EXCLUDED.gmp
  `;

  try {
    await sql`
      INSERT INTO ipo_gmp_community (ipo_id, gmp, source_url, is_verified)
      VALUES (${ipoId}, ${gmp}, ${sourceUrl}, TRUE)
    `;
  } catch {
    // migration 012 optional — history row is enough for the site
  }
}

async function main() {
  const ctx = await startRun('ipo-gmp');
  const url = loadDatabaseUrl();
  if (!url) {
    console.error('❌ DATABASE_URL not set');
    await endRun(ctx, { status: 'failed', qualityGate: 'skipped', message: 'DATABASE_URL not set' });
    process.exit(1);
  }

  const sql = neon(url);
  const today = new Date().toISOString().slice(0, 10);
  const ipos = await sql`SELECT id, slug, name FROM ipos`;

  /** @type {Map<string, { slug?: string, name?: string, gmp: number, sourceUrl: string }>} */
  const pending = new Map();

  let scrapeCount = 0;
  try {
    const scraped = await fetchInvestorgainGMP();
    for (const { name, gmp, sourceUrl } of scraped) {
      const ipo = matchIpoByName(name, ipos);
      const key = ipo?.slug ?? `name:${name.toLowerCase()}`;
      pending.set(key, {
        slug: ipo?.slug,
        name,
        gmp,
        sourceUrl: sourceUrl || GMP_SOURCE_INVESTOR_GAIN,
      });
      scrapeCount++;
    }
  } catch (err) {
    console.warn(`  ⚠️ GMP scrape failed: ${err.message}`);
    if (pending.size === 0 && loadCuratedEntries().length === 0) {
      await endRun(ctx, {
        status: 'failed',
        qualityGate: 'skipped',
        message: `Scrape failed and no curated fallback: ${err.message}`,
      });
      process.exit(1);
    }
  }

  for (const { slug, gmp } of loadCuratedEntries()) {
    if (!slug || gmp == null || !Number.isFinite(Number(gmp))) continue;
    pending.set(slug, {
      slug,
      gmp: Number(gmp),
      sourceUrl: 'curated:ipo-gmp-curated.json',
    });
  }

  if (pending.size === 0) {
    console.log('No GMP entries to sync.');
    await endRun(ctx, { status: 'success', qualityGate: 'skipped', rowsUpserted: 0, message: 'No entries' });
    return;
  }

  let synced = 0;
  let skipped = 0;
  let unmatched = 0;

  try {
    for (const entry of pending.values()) {
      let ipo = null;
      if (entry.slug) {
        ipo = ipos.find((i) => i.slug === entry.slug) ?? null;
      }
      if (!ipo && entry.name) {
        ipo = matchIpoByName(entry.name, ipos);
      }
      if (!ipo) {
        console.warn(`  ⚠ No DB match: ${entry.slug || entry.name}`);
        unmatched++;
        continue;
      }

      const gmpNum = Number(entry.gmp);
      if (!Number.isFinite(gmpNum)) {
        skipped++;
        continue;
      }

      await upsertGmpRow(sql, {
        ipoId: ipo.id,
        gmp: gmpNum,
        today,
        sourceUrl: entry.sourceUrl,
      });

      synced++;
      console.log(`  ✓ ${ipo.slug}: ₹${gmpNum} (${entry.sourceUrl.startsWith('curated') ? 'curated' : 'scraped'})`);
    }

    console.log(
      `\nGMP sync complete — ${synced} upserted (${scrapeCount} scraped), ${skipped} skipped, ${unmatched} unmatched.`,
    );
    await endRun(ctx, {
      status: synced > 0 ? 'success' : 'failed',
      qualityGate: synced > 0 ? 'passed' : 'failed',
      rowsUpserted: synced,
      message: `${synced} GMP rows synced (${scrapeCount} from scrape)`,
    });

    if (synced === 0) process.exit(1);
  } catch (err) {
    await endRun(ctx, { status: 'failed', qualityGate: 'skipped', message: err.message });
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
