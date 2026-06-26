#!/usr/bin/env node
/**
 * Seed BSE-only listed equities into `stocks` for Super Investors / 1% Club.
 *
 * Source: BSE ListofScripData API (~2,400 equities not on NSE). Dual-listed
 * names are skipped (already covered via NSE XBRL in pipeline:superinvestor).
 *
 * Usage: node scripts/node-with-ca.mjs db/seed/seed-bse-listed-equities.mjs
 */

import { sql, isDbConfigured } from '../../scripts/lib/db.mjs';
import { bulkUpsertBseOnlyEquities, closePgPool } from '../../scripts/lib/pg-bulk.mjs';
import { slugify } from '../../scripts/lib/ipo-utils.mjs';

const BSE_LIST_URL =
  'https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.bseindia.com/',
};

async function fetchBseEquityList() {
  const response = await fetch(BSE_LIST_URL, { headers: HEADERS });
  if (!response.ok) throw new Error(`BSE ListofScripData HTTP ${response.status}`);
  return response.json();
}

function parseBseOnlyRows(bseRows, nseIsins) {
  const seen = new Set();
  const rows = [];

  for (const row of bseRows) {
    const isin = String(row.ISIN_NUMBER || '').trim().toUpperCase();
    const code = String(row.SCRIP_CD || '').trim();
    const name = String(row.Scrip_Name || '').trim();
    if (!isin.startsWith('INE') || !code || !name) continue;
    if (nseIsins.has(isin)) continue;
    if (seen.has(isin)) continue;
    seen.add(isin);

    rows.push({
      isin,
      name,
      slug: slugify(name),
      bse_code: code,
    });
  }

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

  console.log('Fetching BSE equity master (ListofScripData)...');
  const bseRows = await fetchBseEquityList();
  console.log(`  ${bseRows.length} BSE equity listings parsed`);

  const nseIsins = new Set(
    (
      await sql`
        SELECT UPPER(isin) AS isin
        FROM stocks
        WHERE NULLIF(TRIM(nse_symbol), '') IS NOT NULL AND isin IS NOT NULL
      `
    ).map((r) => r.isin),
  );

  const bseOnly = parseBseOnlyRows(bseRows, nseIsins);
  console.log(`  ${bseOnly.length} BSE-only equities (not on NSE)`);

  const upserted = await bulkUpsertBseOnlyEquities(bseOnly);
  await closePgPool();

  const [{ total, with_nse, with_bse_only }] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(NULLIF(TRIM(nse_symbol), ''))::int AS with_nse,
      COUNT(*) FILTER (
        WHERE NULLIF(TRIM(bse_code), '') IS NOT NULL
          AND NULLIF(TRIM(nse_symbol), '') IS NULL
      )::int AS with_bse_only
    FROM stocks
  `;

  console.log(`\n✅ BSE-only equity seed complete`);
  console.log(`  Upserted BSE-only:  ${upserted}`);
  console.log(`  stocks table total: ${total} rows`);
  console.log(`  NSE-listed:         ${with_nse}`);
  console.log(`  BSE-only:           ${with_bse_only}`);
  console.log(`  Pipeline universe:  ${with_nse} NSE + ${with_bse_only} BSE-only`);
}

main().catch(async (err) => {
  console.error('❌', err.message);
  await closePgPool().catch(() => {});
  process.exit(1);
});
