#!/usr/bin/env node
/**
 * Sync curated GMP values from data/ipo-gmp-curated.json → ipo_gmp_history + ipo_gmp_community.
 * Run: npm run pipeline:gmp
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { startRun, endRun } from '../lib/pipeline-run-logger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GMP_FILE = join(ROOT, 'data/ipo-gmp-curated.json');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  return readFileSync(envPath, 'utf-8').match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? null;
}

async function main() {
  const ctx = await startRun('ipo-gmp');
  const url = loadDatabaseUrl();
  if (!url) {
    console.error('❌ DATABASE_URL not set');
    await endRun(ctx, { status: 'failed', qualityGate: 'skipped', message: 'DATABASE_URL not set' });
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(GMP_FILE, 'utf-8'));
  const entries = raw.entries ?? [];
  if (!entries.length) {
    console.log('No GMP entries in curated file.');
    await endRun(ctx, { status: 'success', qualityGate: 'skipped', rowsUpserted: 0, message: 'No entries' });
    return;
  }

  const sql = neon(url);
  const today = new Date().toISOString().slice(0, 10);
  let synced = 0;
  let skipped = 0;

  try {
    for (const { slug, gmp } of entries) {
      if (!slug || gmp == null || !Number.isFinite(Number(gmp))) {
        skipped++;
        continue;
      }

      const rows = await sql`SELECT id FROM ipos WHERE slug = ${slug} LIMIT 1`;
      const ipo = rows[0];
      if (!ipo) {
        console.warn(`  ⚠ IPO not found: ${slug}`);
        skipped++;
        continue;
      }

      const gmpNum = Number(gmp);
      await sql`
        INSERT INTO ipo_gmp_history (ipo_id, date, gmp)
        VALUES (${ipo.id}, ${today}::date, ${gmpNum})
        ON CONFLICT (ipo_id, date) DO UPDATE SET gmp = EXCLUDED.gmp
      `;

      try {
        await sql`
          INSERT INTO ipo_gmp_community (ipo_id, gmp, source_url, is_verified)
          VALUES (${ipo.id}, ${gmpNum}, ${'curated:ipo-gmp-curated.json'}, TRUE)
        `;
      } catch {
        // ipo_gmp_community requires migration 012 — history row is sufficient for the site
      }

      synced++;
      console.log(`  ✓ ${slug}: ₹${gmpNum}`);
    }

    console.log(`\nGMP sync complete — ${synced} updated, ${skipped} skipped.`);
    await endRun(ctx, {
      status: 'success',
      qualityGate: 'passed',
      rowsUpserted: synced,
      message: `${synced} GMP rows synced`,
    });
  } catch (err) {
    await endRun(ctx, { status: 'failed', qualityGate: 'skipped', message: err.message });
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
