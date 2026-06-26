#!/usr/bin/env node
/**
 * Seed the full NSE listed-equity universe into `stocks` for Super Investors / 1% Club.
 *
 * Source: NSE EQUITY_L.csv (~2,300+ equity ISINs). This is independent of mutual-fund
 * holdings — MF overlap is linked later via shared stock_id / ISIN.
 *
 * Usage: node scripts/node-with-ca.mjs db/seed/seed-listed-equities.mjs
 */

import { sql, isDbConfigured } from '../../scripts/lib/db.mjs';
import { bulkUpsertListedEquities, closePgPool } from '../../scripts/lib/pg-bulk.mjs';
import { slugify } from '../../scripts/lib/ipo-utils.mjs';

const EQUITY_CSV_URL = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';

async function fetchEquityList() {
  const response = await fetch(EQUITY_CSV_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/csv,text/plain,*/*',
    },
  });
  if (!response.ok) throw new Error(`NSE EQUITY_L.csv HTTP ${response.status}`);
  return response.text();
}

/** Parse NSE equity master — equity ISINs only (INE…), all listed series. */
function parseEquityCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 7) continue;

    const symbol = parts[0]?.trim().toUpperCase();
    const name = parts[1]?.trim();
    const series = parts[2]?.trim().toUpperCase();
    const isin = parts[6]?.trim().toUpperCase();

    if (!symbol || !name || !isin || !isin.startsWith('INE')) continue;
    // Skip debt / non-equity series if present.
    if (series && !['EQ', 'BE', 'BZ', 'SM', 'ST'].includes(series)) continue;

    const key = isin;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      isin,
      name,
      slug: slugify(name),
      nse_symbol: symbol,
    });
  }

  // Collapse slug collisions (different listings that normalize to the same slug).
  const bySlug = new Map();
  for (const row of rows) {
    const prev = bySlug.get(row.slug);
    if (!prev || row.name.length > prev.name.length) bySlug.set(row.slug, row);
  }
  return [...bySlug.values()];
}

async function main() {
  if (!isDbConfigured()) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  console.log('Fetching NSE EQUITY_L.csv (full listed-equity universe)...');
  const csv = await fetchEquityList();
  const equities = parseEquityCsv(csv);
  console.log(`  ${equities.length} NSE equity listings parsed`);

  const upserted = await bulkUpsertListedEquities(equities);
  await closePgPool();

  const [{ total, with_nse, listed }] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(NULLIF(TRIM(nse_symbol), ''))::int AS with_nse,
      COUNT(*) FILTER (WHERE NULLIF(TRIM(nse_symbol), '') IS NOT NULL)::int AS listed
    FROM stocks
  `;

  console.log(`\n✅ Listed-equity seed complete`);
  console.log(`  Upserted from NSE:  ${upserted}`);
  console.log(`  stocks table total: ${total} rows, ${with_nse} with nse_symbol`);
  console.log(`  Pipeline universe:  run pipeline:superinvestor to scan all ${equities.length}+ listed stocks for SHP`);
}

main().catch(async (err) => {
  console.error('❌', err.message);
  await closePgPool().catch(() => {});
  process.exit(1);
});
