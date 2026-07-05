#!/usr/bin/env node
/**
 * Fix stocks linked to numeric junk sectors (AMC market-cap values mis-filed as sector).
 * Sources correct sector labels from fund-holdings.json when possible.
 *
 * Run: node scripts/node-with-ca.mjs scripts/repair-numeric-stock-sectors.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from './lib/db.mjs';
import { isValidEquitySector, sanitizeSectorName } from './lib/stock-utils.mjs';
import { unpackMonthHoldings } from './lib/holdings-month.mjs';
import { slugify } from './lib/fund-match.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOLDINGS_PATH = join(ROOT, 'src', 'data', 'fund-holdings.json');

function buildIsinSectorMap() {
  const map = new Map();
  if (!existsSync(HOLDINGS_PATH)) return map;

  const data = JSON.parse(readFileSync(HOLDINGS_PATH, 'utf8'));
  for (const fund of Object.values(data.holdings || {})) {
    for (const [key, monthData] of Object.entries(fund)) {
      if (key === 'name' || key === 'amc') continue;
      const { stocks } = unpackMonthHoldings(monthData);
      for (const h of stocks) {
        const isin = String(h.isin || '').trim().toUpperCase();
        const sector = sanitizeSectorName(h.sector);
        if (!isin || !sector) continue;
        map.set(isin, sector);
      }
    }
  }
  return map;
}

async function getOrCreateSectorId(sectorName) {
  const name = sanitizeSectorName(sectorName);
  if (!name) return null;
  const slug = slugify(name);
  if (!slug) return null;
  await sql`INSERT INTO sectors (name, slug) VALUES (${name}, ${slug}) ON CONFLICT (slug) DO NOTHING`;
  const rows = await sql`SELECT id FROM sectors WHERE slug = ${slug} LIMIT 1`;
  return rows[0]?.id ?? null;
}

async function main() {
  const isinSector = buildIsinSectorMap();
  console.log(`  Holdings ISIN→sector map: ${isinSector.size} entries`);

  const badRows = await sql`
    SELECT s.id, s.slug, s.name, s.isin, s.sector_id, sec.name AS bad_sector
    FROM stocks s
    JOIN sectors sec ON sec.id = s.sector_id
    WHERE sec.name ~ '^[0-9]+(\\.[0-9]+)?$'
  `;

  if (!badRows.length) {
    console.log('  ✓ No numeric junk sectors on stocks');
  } else {
    console.log(`  Repairing ${badRows.length} stock(s) with numeric sector labels...`);

    for (const row of badRows) {
      const isin = String(row.isin || '').trim().toUpperCase();
      let sectorName = isin ? isinSector.get(isin) : null;

      if (!sectorName) {
        const peers = await sql`
          SELECT DISTINCT sec.name AS sector_name
          FROM stocks s2
          JOIN sectors sec ON sec.id = s2.sector_id
          WHERE s2.slug = ${row.slug}
            AND sec.name IS NOT NULL
            AND sec.name !~ '^[0-9]+(\\.[0-9]+)?$'
            AND sec.name <> ''
          LIMIT 3
        `;
        sectorName = peers.find((p) => isValidEquitySector(p.sector_name))?.sector_name ?? null;
      }

      const sectorId = sectorName ? await getOrCreateSectorId(sectorName) : null;
      await sql`UPDATE stocks SET sector_id = ${sectorId}, updated_at = NOW() WHERE id = ${row.id}`;
      console.log(`  • ${row.slug}: ${row.bad_sector} → ${sectorName || '(cleared)'}`);
    }

    const deleted = await sql`
      DELETE FROM sectors sec
      WHERE sec.name ~ '^[0-9]+(\\.[0-9]+)?$'
        AND NOT EXISTS (SELECT 1 FROM stocks s WHERE s.sector_id = sec.id)
        AND NOT EXISTS (SELECT 1 FROM sector_allocations sa WHERE sa.sector_id = sec.id)
      RETURNING sec.id, sec.name
    `;
    if (deleted.length) {
      console.log(`  Removed ${deleted.length} orphan junk sector row(s)`);
    }
  }

  let backfilled = 0;
  const missing = await sql`
    SELECT id, slug, isin FROM stocks
    WHERE sector_id IS NULL AND NULLIF(TRIM(isin), '') IS NOT NULL
  `;
  for (const row of missing) {
    const sectorName = isinSector.get(String(row.isin).trim().toUpperCase());
    if (!sectorName) continue;
    const sectorId = await getOrCreateSectorId(sectorName);
    if (!sectorId) continue;
    await sql`UPDATE stocks SET sector_id = ${sectorId}, updated_at = NOW() WHERE id = ${row.id}`;
    backfilled++;
    console.log(`  • ${row.slug}: backfilled → ${sectorName}`);
  }
  if (backfilled) {
    console.log(`  Backfilled ${backfilled} stock sector(s) from holdings`);
  }

  console.log('  ✓ Numeric sector repair complete');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
