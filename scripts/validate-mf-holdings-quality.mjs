#!/usr/bin/env node
/**
 * MF holdings quality gate — DB + export JSON + cross-checks.
 *
 * Hard fail → exit 1 (blocks export / monthly pipeline / deploy)
 * Warn      → logged only (data quality debt, not blockers)
 *
 * Run: npm run validate:mf-holdings-quality
 * Flags:
 *   --json-only   skip Neon DB checks
 *   --db-only     skip export JSON checks
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  isInternationalEquityFund,
  meetsListingCodePolicy,
  sanitizeListingCodes,
} from './lib/listing-codes.mjs';
import { isDbConfigured, sql, withDbRetry } from './lib/db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');
const BY_SLUG = join(DATA, 'fund-holdings-by-slug');
const META_PATH = join(DATA, 'fund-holdings-meta.json');
const ALIASES_PATH = join(DATA, 'fund-holdings-aliases.json');
const COUNTS_PATH = join(DATA, 'fund-holdings-by-slug-counts.json');
const HUB_ALL = join(DATA, 'mf-hub', 'all.json');
const HUB_BEST = join(DATA, 'mf-hub', 'best.json');

const args = new Set(process.argv.slice(2));
const jsonOnly = args.has('--json-only');
const dbOnly = args.has('--db-only');

const hard = [];
const warn = [];

function fail(msg) {
  hard.push(msg);
  console.error(`  ✗ ${msg}`);
}

function note(msg) {
  warn.push(msg);
  console.warn(`  ⚠ ${msg}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function listingKey(row) {
  const { isin, nseSymbol, bseCode } = sanitizeListingCodes(row);
  if (isin) return `isin:${isin}`;
  if (nseSymbol) return `nse:${nseSymbol}`;
  if (bseCode) return `bse:${bseCode}`;
  return '';
}

function runSubValidator(scriptName) {
  const script = join(ROOT, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit', cwd: ROOT });
  if ((result.status ?? 1) !== 0) {
    fail(`${scriptName} failed`);
  }
}

// ─── Group B: Export JSON ───────────────────────────────────────────────────

function validateExportJson() {
  console.log('\n── Export JSON ──');

  if (!existsSync(BY_SLUG)) {
    fail('Missing public/data/fund-holdings-by-slug/');
    return;
  }

  runSubValidator('validate-fund-holdings-integrity.mjs');
  runSubValidator('validate-holdings-listing-codes.mjs');

  const meta = readJson(META_PATH) || { stockCounts: {}, slugs: [] };
  const aliases = readJson(ALIASES_PATH) || {};
  const countsFile = readJson(COUNTS_PATH) || {};
  const hubAll = readJson(HUB_ALL);
  const hubBest = readJson(HUB_BEST);

  const bySlugCounts = {};
  const files = readdirSync(BY_SLUG).filter((f) => f.endsWith('.json'));
  let emptyFiles = 0;
  let inFileDups = 0;
  let badPct = 0;
  let nullPct = 0;
  let listingViolations = 0;

  for (const fileName of files) {
    const slug = fileName.replace(/\.json$/, '');
    const data = readJson(join(BY_SLUG, fileName));
    if (!data) {
      fail(`unreadable by-slug file: ${fileName}`);
      continue;
    }
    const stocks = Array.isArray(data.stocks) ? data.stocks : [];
    bySlugCounts[slug] = stocks.length;

    if (stocks.length === 0) {
      emptyFiles++;
      const referenced =
        (meta.stockCounts && Number(meta.stockCounts[slug]) > 0) ||
        Object.values(aliases).includes(slug) ||
        slug in aliases;
      if (referenced) {
        fail(`empty by-slug file referenced by meta/aliases: ${slug}`);
      } else {
        note(`empty by-slug file (unreferenced): ${slug}`);
      }
      continue;
    }

    const international = isInternationalEquityFund(slug, data.name || '');
    const seen = new Map();

    for (const row of stocks) {
      const key = listingKey(row);
      if (key) {
        if (seen.has(key)) {
          inFileDups++;
          if (inFileDups <= 15) {
            fail(`${slug}: duplicate holding ${key} (${row.name || 'unnamed'})`);
          }
        } else {
          seen.set(key, true);
        }
      }

      const pct = row.pct;
      if (pct == null || pct === '') {
        nullPct++;
      } else {
        const n = Number(pct);
        if (!Number.isFinite(n)) {
          badPct++;
          if (badPct <= 10) fail(`${slug}: non-numeric pct for ${row.name || 'row'}`);
        } else if (n < 0) {
          badPct++;
          if (badPct <= 10) fail(`${slug}: negative pct (${n}) for ${row.name || 'row'}`);
        } else if (n > 100) {
          note(`${slug}: pct > 100 (${n}) for ${row.name || 'row'}`);
        }
      }

      if (!meetsListingCodePolicy(row, { fundSlug: slug, internationalFund: international })) {
        listingViolations++;
      }
    }
  }

  if (inFileDups > 15) {
    fail(`…and ${inFileDups - 15} more in-file duplicate holding(s)`);
  }
  if (listingViolations > 0) {
    // Already covered by validate-holdings-listing-codes; keep as belt-and-suspenders.
    fail(`${listingViolations} Indian by-slug row(s) missing ISIN/NSE/BSE`);
  }

  // hasHoldings / meta / counts file three-way consistency
  for (const [slug, metaCount] of Object.entries(meta.stockCounts || {})) {
    const n = Number(metaCount) || 0;
    if (n <= 0) continue;
    const fileCount = bySlugCounts[slug]
      ?? bySlugCounts[aliases[slug]]
      ?? bySlugCounts[aliases[slug?.replace?.(/-holdings$/, '')]]
      ?? 0;
    if (fileCount === 0) {
      fail(`meta stockCounts[${slug}]=${n} but by-slug file missing/empty`);
    }
  }

  for (const [slug, count] of Object.entries(countsFile)) {
    const fileCount = bySlugCounts[slug] || 0;
    if (Number(count) !== fileCount) {
      fail(`by-slug-counts.json ${slug}: counts=${count} file=${fileCount}`);
    }
  }

  for (const [listable, canonical] of Object.entries(aliases)) {
    if (!listable || !canonical) continue;
    const targetExists =
      existsSync(join(BY_SLUG, `${canonical}.json`)) ||
      existsSync(join(BY_SLUG, `${listable}.json`));
    if (!targetExists) {
      // Alias pointing at a catalog slug with no holdings export (e.g. remapped twin).
      note(`alias ${listable} → ${canonical} has no by-slug file`);
    }
  }

  function checkHub(rows, label) {
    if (!Array.isArray(rows)) {
      note(`${label} missing or not an array`);
      return;
    }
    for (const row of rows) {
      if (!row?.hasHoldings) continue;
      const detail = String(row.detailSlug || '');
      if (!detail) {
        fail(`${label}: hasHoldings row missing detailSlug (${row.slug || '?'})`);
        continue;
      }
      const fileCount = bySlugCounts[detail] || 0;
      if (fileCount <= 0) {
        if (isInternationalEquityFund(detail)) {
          note(`${label}: international ${detail} hasHoldings but empty by-slug (Phase B)`);
          continue;
        }
        fail(`${label}: hasHoldings but empty/missing by-slug for ${detail}`);
        continue;
      }
      const hubCount = Number(row.stockCount) || 0;
      if (fileCount > 0 && hubCount !== fileCount) {
        if (isInternationalEquityFund(detail)) {
          note(`${label}: international ${detail} hub=${hubCount} file=${fileCount} (Phase B)`);
          continue;
        }
        fail(`${label}: ${detail} hub=${hubCount} file=${fileCount}`);
      }
    }
  }
  checkHub(hubAll, 'mf-hub/all.json');
  checkHub(hubBest, 'mf-hub/best.json');

  ok(
    `JSON scanned ${files.length} by-slug files` +
      (emptyFiles ? ` (${emptyFiles} empty)` : '') +
      (nullPct ? `; ${nullPct} null pct row(s) noted` : ''),
  );
  if (nullPct > 0) {
    note(`${nullPct} by-slug row(s) with null/empty pct`);
  }
}

// ─── Group A: Database ──────────────────────────────────────────────────────

async function validateDb() {
  console.log('\n── Database ──');
  if (!isDbConfigured()) {
    note('DATABASE_URL not set — skipping DB checks');
    return;
  }

  const dupHoldings = await withDbRetry(
    () => sql`
      SELECT fund_id, stock_id, month::text AS month, COUNT(*)::int AS cnt
      FROM fund_holdings
      GROUP BY fund_id, stock_id, month
      HAVING COUNT(*) > 1
      LIMIT 20
    `,
    { label: 'dup fund_holdings' },
  );
  if (dupHoldings.length) {
    fail(`fund_holdings duplicate (fund,stock,month): ${dupHoldings.length}+ group(s)`);
  } else {
    ok('no duplicate fund_holdings (fund_id, stock_id, month)');
  }

  const orphanFunds = await withDbRetry(
    () => sql`
      SELECT COUNT(*)::int AS cnt
      FROM fund_holdings fh
      LEFT JOIN funds f ON f.id = fh.fund_id
      WHERE f.id IS NULL
    `,
    { label: 'orphan fund_id' },
  );
  if (Number(orphanFunds[0]?.cnt) > 0) {
    fail(`fund_holdings orphan fund_id: ${orphanFunds[0].cnt}`);
  } else {
    ok('no orphan fund_holdings.fund_id');
  }

  const orphanStocks = await withDbRetry(
    () => sql`
      SELECT COUNT(*)::int AS cnt
      FROM fund_holdings fh
      LEFT JOIN stocks s ON s.id = fh.stock_id
      WHERE fh.stock_id IS NOT NULL AND s.id IS NULL
    `,
    { label: 'orphan stock_id' },
  );
  if (Number(orphanStocks[0]?.cnt) > 0) {
    fail(`fund_holdings orphan stock_id: ${orphanStocks[0].cnt}`);
  } else {
    ok('no orphan fund_holdings.stock_id');
  }

  const nullStockIds = await withDbRetry(
    () => sql`
      SELECT COUNT(*)::int AS cnt FROM fund_holdings WHERE stock_id IS NULL
    `,
    { label: 'null stock_id' },
  );
  if (Number(nullStockIds[0]?.cnt) > 0) {
    fail(`fund_holdings with NULL stock_id: ${nullStockIds[0].cnt}`);
  } else {
    ok('no NULL stock_id in fund_holdings');
  }

  const dupIsin = await withDbRetry(
    () => sql`
      SELECT UPPER(TRIM(isin)) AS isin, COUNT(*)::int AS cnt
      FROM stocks
      WHERE NULLIF(TRIM(isin), '') IS NOT NULL
      GROUP BY 1
      HAVING COUNT(*) > 1
      LIMIT 25
    `,
    { label: 'dup ISIN' },
  );
  if (dupIsin.length) {
    fail(`stocks duplicate ISIN groups: ${dupIsin.length}+ (sample ${dupIsin[0].isin}×${dupIsin[0].cnt})`);
  } else {
    ok('no duplicate stock ISINs');
  }

  const dupNse = await withDbRetry(
    () => sql`
      SELECT UPPER(TRIM(nse_symbol)) AS nse, COUNT(*)::int AS cnt
      FROM stocks
      WHERE NULLIF(TRIM(isin), '') IS NULL
        AND NULLIF(TRIM(nse_symbol), '') IS NOT NULL
      GROUP BY 1
      HAVING COUNT(*) > 1
      LIMIT 25
    `,
    { label: 'dup NSE' },
  );
  if (dupNse.length) {
    fail(`stocks duplicate NSE (no ISIN) groups: ${dupNse.length}+`);
  } else {
    ok('no duplicate NSE-only stock groups');
  }

  const badPctDb = await withDbRetry(
    () => sql`
      SELECT COUNT(*)::int AS cnt
      FROM fund_holdings
      WHERE pct_to_nav IS NOT NULL AND pct_to_nav < 0
    `,
    { label: 'neg pct' },
  );
  if (Number(badPctDb[0]?.cnt) > 0) {
    fail(`fund_holdings negative pct_to_nav: ${badPctDb[0].cnt}`);
  } else {
    ok('no negative pct_to_nav in DB');
  }

  const [latest] = await withDbRetry(
    () => sql`SELECT MAX(month)::text AS month FROM fund_holdings`,
    { label: 'latest month' },
  );
  const latestMonth = latest?.month;
  if (!latestMonth) {
    fail('fund_holdings is empty');
    return;
  }
  ok(`latest fund_holdings month: ${latestMonth}`);

  const [monthStats] = await withDbRetry(
    () => sql`
      SELECT
        COUNT(*)::int AS rows,
        COUNT(DISTINCT fund_id)::int AS funds,
        COUNT(DISTINCT stock_id)::int AS stocks
      FROM fund_holdings
      WHERE month = ${latestMonth}::date
    `,
    { label: 'latest month stats' },
  );
  if (Number(monthStats?.funds) < 50) {
    fail(`latest month has only ${monthStats?.funds} funds (expected ≥50)`);
  } else {
    ok(
      `latest month: ${monthStats.rows} rows, ${monthStats.funds} funds, ${monthStats.stocks} stocks`,
    );
  }

  // MoM drop warning
  const months = await withDbRetry(
    () => sql`
      SELECT month::text AS month, COUNT(DISTINCT fund_id)::int AS funds, COUNT(*)::int AS rows
      FROM fund_holdings
      GROUP BY month
      ORDER BY month DESC
      LIMIT 2
    `,
    { label: 'mom months' },
  );
  if (months.length === 2) {
    const [cur, prev] = months;
    if (prev.funds > 0) {
      const drop = (prev.funds - cur.funds) / prev.funds;
      if (drop > 0.15) {
        note(
          `fund count dropped ${(drop * 100).toFixed(1)}% ${prev.month}(${prev.funds}) → ${cur.month}(${cur.funds})`,
        );
      }
    }
    if (prev.rows > 0) {
      const drop = (prev.rows - cur.rows) / prev.rows;
      if (drop > 0.2) {
        note(
          `holding rows dropped ${(drop * 100).toFixed(1)}% ${prev.month}(${prev.rows}) → ${cur.month}(${cur.rows})`,
        );
      }
    }
  }
}

// ─── Group C: Cross-check DB ↔ JSON ─────────────────────────────────────────

async function validateCrossCheck() {
  console.log('\n── Cross-check DB ↔ JSON ──');
  if (!isDbConfigured() || !existsSync(BY_SLUG)) {
    note('Skipping cross-check (need DB + by-slug export)');
    return;
  }

  const [latest] = await withDbRetry(
    () => sql`SELECT MAX(month)::text AS month FROM fund_holdings`,
    { label: 'cross latest month' },
  );
  if (!latest?.month) return;

  const dbFunds = await withDbRetry(
    () => sql`
      SELECT f.slug, COUNT(DISTINCT fh.stock_id)::int AS cnt
      FROM fund_holdings fh
      JOIN funds f ON f.id = fh.fund_id
      WHERE fh.month = ${latest.month}::date
        AND f.is_active = true
        AND f.slug LIKE '%-direct-plan'
      GROUP BY f.slug
    `,
    { label: 'db fund counts' },
  );

  let compared = 0;
  let mismatches = 0;
  let missingFiles = 0;
  let intlSparse = 0;

  for (const row of dbFunds) {
    const slug = String(row.slug);
    const dbCount = Number(row.cnt) || 0;
    const path = join(BY_SLUG, `${slug}.json`);
    if (!existsSync(path)) {
      // International / overlay-only funds may exist only via parser slug variants
      if (isInternationalEquityFund(slug)) {
        intlSparse++;
        continue;
      }
      missingFiles++;
      if (missingFiles <= 10) {
        fail(`DB fund ${slug} (${dbCount} stocks) has no by-slug file`);
      }
      continue;
    }
    const data = readJson(path);
    const fileCount = Array.isArray(data?.stocks) ? data.stocks.length : 0;
    compared++;
    if (fileCount === dbCount) continue;

    // Phase B: international / overseas funds often have fewer exportable Indian
    // listings than DB rows (foreign ISINs dropped). Never hard-fail these.
    if (isInternationalEquityFund(slug)) {
      intlSparse++;
      note(
        `DB↔JSON international overlay ${slug}: db=${dbCount} file=${fileCount} (Phase B)`,
      );
      continue;
    }

    const absDiff = Math.abs(fileCount - dbCount);
    const pctDiff = dbCount > 0 ? absDiff / dbCount : 1;

    // Severe drift only — small gaps are normal until FORCE_EXPORT rewrites by-slug from DB.
    if (fileCount === 0 && dbCount > 0) {
      mismatches++;
      if (mismatches <= 15) {
        fail(`DB↔JSON empty file but DB has rows ${slug}: db=${dbCount}`);
      }
    } else if (fileCount < dbCount && pctDiff > 0.25 && absDiff > 10) {
      mismatches++;
      if (mismatches <= 15) {
        fail(`DB↔JSON severe data loss ${slug}: db=${dbCount} file=${fileCount}`);
      }
    } else {
      note(`DB↔JSON drift ${slug}: db=${dbCount} file=${fileCount} (re-export to sync)`);
    }
  }

  if (missingFiles > 10) {
    fail(`…and ${missingFiles - 10} more DB funds missing by-slug files`);
  }
  if (mismatches > 15) {
    fail(`…and ${mismatches - 15} more DB↔JSON count mismatches`);
  }

  if (intlSparse) {
    note(`${intlSparse} international fund(s) rely on overlay / sparse DB (Phase B)`);
  }

  ok(`cross-checked ${compared} DB direct-plan funds for ${latest.month}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  MF Holdings Quality Gate');
  console.log('═══════════════════════════════════════════════════════════');

  if (!dbOnly) validateExportJson();
  if (!jsonOnly) await validateDb();
  if (!jsonOnly && !dbOnly) await validateCrossCheck();

  console.log('\n── Summary ──');
  console.log(`  Hard failures: ${hard.length}`);
  console.log(`  Warnings:      ${warn.length}`);
  if (hard.length) {
    for (const msg of hard) console.error(`  ✗ ${msg}`);
    console.error('\nvalidate:mf-holdings-quality FAILED — fix hard issues before deploy.\n');
    process.exit(1);
  }

  console.log('\n  ✓ MF holdings quality gate PASSED\n');
}

main().catch((err) => {
  console.error('\n  ❌ Quality gate crashed:', err.message);
  process.exit(1);
});
