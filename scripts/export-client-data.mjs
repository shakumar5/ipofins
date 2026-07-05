/**
 * Export large client payloads to public/data/*.json (once per build/dev).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';
import { spawnSync } from 'node:child_process';
import { nodeExtraArgs } from './lib/node-runner.mjs';
import { buildHolderPositionsRecord } from './lib/holder-positions-export.mjs';
import { buildSmartMoneyExports } from './lib/smart-money-export.mjs';
import { buildSmartMoneySignalsExport } from './lib/smart-money-signals-export.mjs';
import { buildSectorIntelligenceExport } from './lib/sector-intelligence-export.mjs';
import {
  assertSlimListRow,
  detailSignalRow,
  searchIndexEntry,
  signalCategoryDetailFileName,
  signalCategoryFileName,
  signalSearchFileName,
  slimSignalRow,
} from './lib/signal-export-utils.mjs';
import { finalizeSignalsOnDisk } from './lib/finalize-signals-on-disk.mjs';
import { unpackMonthHoldings, latestMonthForFund } from './lib/holdings-month.mjs';
import { buildMfHubExports, loadMutualFundsJson } from './lib/mf-hub-export.mjs';
import {
  loadHoldingsMetaFromDb,
  buildHoldingsMetaFromJson,
  enrichHoldingsMetaWithOverlap,
  mergeHoldingsMeta,
} from './lib/mf-hub-holdings-meta.mjs';
import { filterMutualFundsToCurated } from './lib/canonical-fund-filter.mjs';
import {
  loadAllFundOverlapsFromDb,
  loadFundsWithOverlapsFromDb,
} from './lib/fund-overlap-export.mjs';
import {
  buildFundHoldingsAliases,
  buildFundHoldingsIndexFromHub,
  loadFundHoldingsIndexFromDb,
  serializeHoldingsMetaForDisk,
} from './lib/fund-holdings-export.mjs';
import {
  EMPTY_TOP_STOCKS,
  exportTopStocksFromDb,
  writeTopStocksJson,
} from './lib/finalize-top-stocks-export.mjs';
import { sql, isDbConfigured, withDbRetry, formatDbError } from './lib/db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const PUBLIC_DIR = join(ROOT, 'public');

function neonTlsHint() {
  if (platform() !== 'win32') return '';
  if (process.execArgv.includes('--use-system-ca')) return '';
  return ' On Windows, run: npm run export:client-data (uses --use-system-ca for Neon TLS).';
}

function logStep(label) {
  console.log(`  ▶ ${label}…`);
  const start = Date.now();
  return (detail = '') => {
    const sec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`    ✓ ${label}${detail ? ` — ${detail}` : ''} (${sec}s)`);
  };
}

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function sortMonthLabels(months) {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split(' ');
    const [mb, yb] = b.split(' ');
    if (ya !== yb) return Number(ya) - Number(yb);
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
  });
}

function compactHoldings(raw) {
  const holdings = {};
  for (const [slug, fund] of Object.entries(raw.holdings || {})) {
    const entry = { name: fund.name, amc: fund.amc };
    for (const [key, val] of Object.entries(fund)) {
      if (key === 'name' || key === 'amc') continue;
      const { stocks } = unpackMonthHoldings(val);
      if (stocks.length) entry[key] = stocks.map((h) => ({
        name: h.name,
        isin: h.isin || '',
        sector: h.sector || '',
        pct: h.pct ?? 0,
      }));
    }
    holdings[slug] = entry;
  }
  return {
    months: raw.months || [],
    amcs: raw.amcs || {},
    holdings,
  };
}

/** Prefer the source with more parsed stocks per fund/month (JSON parse often beats DB top-N rows). */
function mergeHoldingsPreferMoreStocks(primary, supplemental) {
  if (!supplemental?.holdings) return primary;
  if (!primary?.holdings) return supplemental;
  const merged = {
    ...primary,
    months: sortMonthLabels([...new Set([...(primary.months || []), ...(supplemental.months || [])])]),
    amcs: { ...(supplemental.amcs || {}), ...(primary.amcs || {}) },
    holdings: { ...primary.holdings },
  };
  const months = merged.months;
  for (const [slug, fund] of Object.entries(supplemental.holdings)) {
    for (const month of months) {
      const fromExtra = unpackMonthHoldings(fund[month]);
      if (!fromExtra.stocks.length) continue;
      if (!merged.holdings[slug]) {
        merged.holdings[slug] = { name: fund.name, amc: fund.amc };
      }
      const entry = merged.holdings[slug];
      const fromPrimary = unpackMonthHoldings(entry[month]);
      if (fromExtra.stocks.length > fromPrimary.stocks.length) {
        entry[month] = fromExtra.stocks.map((h) => ({
          name: h.name,
          isin: h.isin || '',
          sector: h.sector || '',
          pct: h.pct ?? 0,
        }));
      }
    }
  }
  return merged;
}

function writeFundHoldingsBySlugExports(holdings) {
  const dir = join(OUT_DIR, 'fund-holdings-by-slug');
  mkdirSync(dir, { recursive: true });
  const months = holdings.months || [];
  let count = 0;
  for (const [slug, fund] of Object.entries(holdings.holdings || {})) {
    const month = latestMonthForFund(fund, months);
    if (!month) continue;
    const { stocks } = unpackMonthHoldings(fund[month]);
    if (!stocks.length) continue;
    writeFileSync(
      join(dir, `${slug}.json`),
      JSON.stringify({
        slug,
        month,
        stocks: stocks.map((h) => ({
          name: h.name,
          stockSlug: h.stockSlug || '',
          sector: h.sector || '',
          pct: h.pct ?? 0,
        })),
      }),
    );
    count++;
  }
  console.log(`  ✓ fund-holdings-by-slug/ (${count} funds)`);
}

async function loadHoldingsFromDb() {
  return withDbRetry(async () => {
    const rows = await sql`
    SELECT
      f.slug,
      f.name AS fund_name,
      a.name AS amc_name,
      a.slug AS amc_slug,
      TRIM(TO_CHAR(fh.month, 'FMMonth YYYY')) AS month_label,
      s.name AS stock_name,
      s.slug AS stock_slug,
      COALESCE(s.isin, '') AS isin,
      COALESCE(sec.name, '') AS sector,
      fh.pct_to_nav AS pct
    FROM fund_holdings fh
    JOIN funds f ON f.id = fh.fund_id AND f.is_active = true
    JOIN amcs a ON a.id = f.amc_id
    JOIN stocks s ON s.id = fh.stock_id
    LEFT JOIN sectors sec ON sec.id = s.sector_id
    ORDER BY fh.month, a.name, f.name
  `;

  const monthsSet = new Set();
  const holdings = {};
  const amcFunds = new Map();
  const amcSlugs = new Map();

  for (const r of rows) {
    const slug = String(r.slug);
    const month = String(r.month_label).trim();
    const amc = String(r.amc_name);
    const amcSlug = String(r.amc_slug);
    const fundName = String(r.fund_name);
    monthsSet.add(month);
    amcSlugs.set(amc, amcSlug);

    if (!holdings[slug]) {
      holdings[slug] = { name: fundName, amc };
      if (!amcFunds.has(amc)) amcFunds.set(amc, new Set());
      amcFunds.get(amc).add(fundName);
    }
    if (!holdings[slug][month]) holdings[slug][month] = [];
    holdings[slug][month].push({
      name: String(r.stock_name),
      stockSlug: String(r.stock_slug),
      isin: String(r.isin),
      sector: String(r.sector),
      pct: r.pct != null ? Number(r.pct) : 0,
    });
  }

  const amcs = {};
  for (const [amc, names] of amcFunds) amcs[amc] = [...names].sort();

  const compact = compactHoldings({
    months: sortMonthLabels([...monthsSet]),
    amcs,
    holdings,
  });

  compact.amcSlugs = Object.fromEntries(amcSlugs);
  return compact;
  }, { label: 'Load holdings from DB' });
}

function buildPortfolioOverlapExport(holdings) {
  const month = holdings.months?.[holdings.months.length - 1];
  if (!month) return { month: '', funds: [], holdings: {} };

  const funds = [];
  const holdingsBySlug = {};

  for (const [slug, fund] of Object.entries(holdings.holdings || {})) {
    const rows = fund[month];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    funds.push({ slug, name: fund.name, amc: fund.amc || '' });
    holdingsBySlug[slug] = rows.map((h) => ({
      name: h.name,
      isin: h.isin || '',
      pct: h.pct ?? 0,
    }));
  }

  funds.sort((a, b) => a.name.localeCompare(b.name));
  return { month, funds, holdings: holdingsBySlug };
}

function loadHoldingsFromJson() {
  const path = join(ROOT, 'src', 'data', 'fund-holdings.json');
  if (!existsSync(path)) return null;
  return compactHoldings(JSON.parse(readFileSync(path, 'utf-8')));
}

function monthFileSlug(month) {
  return String(month).toLowerCase().replace(/\s+/g, '-');
}

function writeJson(name, data) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(data));
  const kb = (readFileSync(path).length / 1024).toFixed(0);
  console.log(`  ✓ ${name} (${kb} KB)`);
}

/** Map fund-overlap-index slugs to keys present in fund-overlaps-by-fund.json (via aliases). */
function alignFundOverlapExports(aliases = {}) {
  const indexPath = join(OUT_DIR, 'fund-overlap-index.json');
  const byFundPath = join(OUT_DIR, 'fund-overlaps-by-fund.json');
  if (!existsSync(indexPath) || !existsSync(byFundPath)) return;

  const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
  const byFund = JSON.parse(readFileSync(byFundPath, 'utf-8'));
  const bySlug = byFund.bySlug || {};
  if (!Array.isArray(index) || !index.length || !Object.keys(bySlug).length) return;

  const resolveSlug = (slug) => {
    for (const candidate of fundOverlapSlugCandidates(slug, aliases)) {
      if (bySlug[candidate]) return candidate;
    }
    return null;
  };

  const seen = new Set();
  const aligned = [];
  let changed = false;

  for (const fund of index) {
    const resolved = resolveSlug(String(fund.slug));
    if (!resolved) continue;
    if (resolved !== fund.slug) changed = true;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    aligned.push({ slug: resolved, name: String(fund.name) });
  }

  aligned.sort((a, b) => a.name.localeCompare(b.name));
  const indexSlugSet = new Set(aligned.map((f) => f.slug));

  const resolveRowSlug = (raw) => {
    const slug = String(raw);
    if (indexSlugSet.has(slug)) return slug;
    for (const candidate of fundOverlapSlugCandidates(slug, aliases)) {
      if (indexSlugSet.has(candidate)) return candidate;
    }
    return resolveSlug(slug) && indexSlugSet.has(resolveSlug(slug)) ? resolveSlug(slug) : slug;
  };

  let rowsNormalized = 0;
  for (const rows of Object.values(bySlug)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const next = resolveRowSlug(row.slug);
      if (next !== row.slug) {
        row.slug = next;
        rowsNormalized++;
      }
    }
  }

  if (!changed && aligned.length === index.length && rowsNormalized === 0) return;

  writeJson('fund-overlap-index.json', aligned);
  if (rowsNormalized > 0) writeJson('fund-overlaps-by-fund.json', byFund);
  console.log(
    `  ℹ Aligned fund-overlap index (${aligned.length} funds)${rowsNormalized ? `; normalized ${rowsNormalized} row slug(s)` : ''}`,
  );
}

function fundOverlapSlugCandidates(slug, aliases = {}) {
  const candidates = new Set([slug]);
  if (aliases[slug]) candidates.add(aliases[slug]);
  for (const [from, to] of Object.entries(aliases)) {
    if (from === slug || to === slug) {
      candidates.add(from);
      candidates.add(to);
    }
  }
  return [...candidates];
}

/** Fail export when index slugs cannot resolve to fund-overlaps-by-fund keys. */
function verifyFundOverlapExports(aliases = {}) {
  const indexPath = join(OUT_DIR, 'fund-overlap-index.json');
  const byFundPath = join(OUT_DIR, 'fund-overlaps-by-fund.json');
  const hasIndex = existsSync(indexPath);
  const hasByFund = existsSync(byFundPath);
  if (!hasIndex && !hasByFund) return;
  if (hasIndex !== hasByFund) {
    throw new Error(
      'Fund overlap export incomplete: fund-overlap-index.json and fund-overlaps-by-fund.json must exist together.',
    );
  }

  const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
  const bySlug = JSON.parse(readFileSync(byFundPath, 'utf-8')).bySlug || {};
  if (!Array.isArray(index) || !index.length) return;

  const missing = index.filter(
    (fund) => !fundOverlapSlugCandidates(String(fund.slug), aliases).some((slug) => bySlug[slug]?.length),
  );
  if (missing.length) {
    const sample = missing.slice(0, 3).map((f) => f.slug).join(', ');
    throw new Error(
      `Fund overlap slug mismatch: ${missing.length} index fund(s) have no rows in fund-overlaps-by-fund.json (e.g. ${sample}). Run db:compute-overlaps and re-export.`,
    );
  }
}

function writeHoldingsCompareExports(holdings) {
  const amcSlugMap = holdings.amcSlugs || {};
  const index = {
    months: holdings.months,
    amcs: Object.entries(holdings.amcs || {}).map(([name, fundNames]) => ({
      name,
      slug: amcSlugMap[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      fundCount: fundNames.length,
    })),
  };
  writeJson('holdings-compare-index.json', index);

  const amcDir = join(OUT_DIR, 'holdings-compare', 'amc');
  mkdirSync(amcDir, { recursive: true });

  const byAmc = new Map();
  for (const [slug, fund] of Object.entries(holdings.holdings || {})) {
    const amc = fund.amc;
    if (!amc) continue;
    const amcSlug = amcSlugMap[amc] || amc.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!byAmc.has(amcSlug)) byAmc.set(amcSlug, {});
    byAmc.get(amcSlug)[slug] = fund;
  }

  for (const [amcSlug, amcHoldings] of byAmc) {
    const fileName = `holdings-compare/amc/${amcSlug}.json`;
    writeJson(fileName, { holdings: amcHoldings });
  }

  // Legacy monolithic file kept for older deployments — clients use per-AMC chunks only.
  // writeJson('holdings-compare.json', legacy);
}

function writeSplitByMonth(subdir, indexName, indexPayload, months, monthPayload) {
  const dir = join(OUT_DIR, subdir);
  mkdirSync(dir, { recursive: true });
  writeJson(indexName, indexPayload);
  for (const month of months) {
    const slug = monthFileSlug(month);
    const path = join(subdir, `${slug}.json`);
    const full = join(OUT_DIR, path);
    writeFileSync(full, JSON.stringify(monthPayload(month)));
    const kb = (readFileSync(full).length / 1024).toFixed(0);
    console.log(`  ✓ ${path} (${kb} KB)`);
  }
}

/** One JSON file per month × category — list tier (slim) + detail tier + search index. */
function writeSignalsByCategory(signals) {
  const dir = join(OUT_DIR, 'smart-money-signals');
  mkdirSync(dir, { recursive: true });
  writeJson('smart-money-signals-index.json', {
    months: signals.months,
    categories: signals.categories,
    layout: 'by-category',
    scoringModel: 'stock-cap-v2',
    dataTier: 'list+detail+search',
    exportedAt: new Date().toISOString(),
  });

  for (const month of signals.months) {
    const searchBySlug = new Map();

    for (const category of signals.categories) {
      const fullRows = signals.rows.filter((r) => r.month === month && r.category === category);
      const listRows = fullRows.map(slimSignalRow);
      for (const row of listRows) {
        assertSlimListRow(row, `${month}/${category}`);
      }

      const listName = signalCategoryFileName(month, category);
      const listRel = join('smart-money-signals', listName);
      writeFileSync(join(OUT_DIR, listRel), JSON.stringify({ month, category, rows: listRows }));
      console.log(
        `  ✓ ${listRel} (${(readFileSync(join(OUT_DIR, listRel)).length / 1024).toFixed(0)} KB, ${listRows.length} rows)`,
      );

      const detailRows = fullRows.map(detailSignalRow).filter(Boolean);
      if (detailRows.length) {
        const detailName = signalCategoryDetailFileName(month, category);
        const detailRel = join('smart-money-signals', detailName);
        writeFileSync(join(OUT_DIR, detailRel), JSON.stringify({ month, category, rows: detailRows }));
        console.log(
          `  ✓ ${detailRel} (${(readFileSync(join(OUT_DIR, detailRel)).length / 1024).toFixed(0)} KB)`,
        );
      }

      for (const row of listRows) {
        const entry = searchIndexEntry(row, { month, category });
        const prev = searchBySlug.get(row.stockSlug);
        if (!prev || entry.convictionScore > prev.convictionScore) {
          searchBySlug.set(row.stockSlug, entry);
        }
      }
    }

    const searchName = signalSearchFileName(month);
    const searchRel = join('smart-money-signals', searchName);
    const searchPayload = {
      month,
      stocks: [...searchBySlug.values()].sort((a, b) => b.convictionScore - a.convictionScore),
    };
    writeFileSync(join(OUT_DIR, searchRel), JSON.stringify(searchPayload));
    console.log(
      `  ✓ ${searchRel} (${(readFileSync(join(OUT_DIR, searchRel)).length / 1024).toFixed(0)} KB, ${searchPayload.stocks.length} stocks)`,
    );

    const legacy = join(dir, `${monthFileSlug(month)}.json`);
    if (existsSync(legacy)) {
      unlinkSync(legacy);
      console.log(`  ✓ removed legacy monolith smart-money-signals/${monthFileSlug(month)}.json`);
    }
  }
}

/** Split committed monolith signal files when DB export is unavailable. */
function splitMonolithSignalsOnDisk() {
  const indexPath = join(OUT_DIR, 'smart-money-signals-index.json');
  if (!existsSync(indexPath)) return;

  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const dir = join(OUT_DIR, 'smart-money-signals');
  if (!existsSync(dir)) return;

  if (index.layout === 'by-category') {
    for (const month of index.months || []) {
      const legacy = join(dir, `${monthFileSlug(month)}.json`);
      if (existsSync(legacy)) {
        unlinkSync(legacy);
        console.log(`  ✓ removed legacy monolith smart-money-signals/${monthFileSlug(month)}.json`);
      }
    }
    return;
  }

  let splitAny = false;
  for (const month of index.months || []) {
    const monolithPath = join(dir, `${monthFileSlug(month)}.json`);
    if (!existsSync(monolithPath)) continue;

    const payload = JSON.parse(readFileSync(monolithPath, 'utf8'));
    const rows = payload.rows || [];
    for (const category of index.categories || []) {
      const catRows = rows
        .filter((r) => r.month === month && r.category === category)
        .map(slimSignalRow);
      const fileName = signalCategoryFileName(month, category);
      const full = join(dir, fileName);
      writeFileSync(full, JSON.stringify({ month, category, rows: catRows }));
      const kb = (readFileSync(full).length / 1024).toFixed(0);
      console.log(`  ✓ smart-money-signals/${fileName} (${kb} KB, ${catRows.length} rows)`);
    }
    unlinkSync(monolithPath);
    console.log(`  ✓ split monolith → category files for ${month}`);
    splitAny = true;
  }

  if (splitAny) {
    writeJson('smart-money-signals-index.json', {
      ...index,
      layout: 'by-category',
      scoringModel: 'stock-cap-v2',
      exportedAt: index.exportedAt || new Date().toISOString(),
    });
  }
}

/** Ensure search index + dataTier when list files exist but DB export was skipped. */
function migrateSignalsExportTiersOnDisk() {
  const indexPath = join(OUT_DIR, 'smart-money-signals-index.json');
  if (!existsSync(indexPath)) return;

  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  finalizeSignalsOnDisk();

  if (index.dataTier === 'list+detail+search') return;

  writeJson('smart-money-signals-index.json', {
    ...index,
    layout: index.layout || 'by-category',
    dataTier: 'list+detail+search',
    exportedAt: index.exportedAt || new Date().toISOString(),
  });
  console.log('  ✓ smart-money-signals-index.json → dataTier list+detail+search');
}

/** Fail the build when Smart Money client JSON is missing or empty. */
function hasExistingSmartMoneyExports() {
  try {
    verifySmartMoneyExports();
    return true;
  } catch {
    return false;
  }
}

/** Fail the build when Smart Money client JSON is missing or empty. */
function verifySmartMoneyExports() {
  const requiredFiles = [
    'smart-money-tracker-index.json',
    'smart-money-signals-index.json',
    'sector-intelligence.json',
  ];
  const missing = requiredFiles.filter((name) => !existsSync(join(OUT_DIR, name)));
  if (missing.length) {
    throw new Error(
      `Missing required Smart Money exports: ${missing.join(', ')}. Run npm run export:client-data with DATABASE_URL set.`,
    );
  }

  const signalsDir = join(OUT_DIR, 'smart-money-signals');
  const signalFiles = existsSync(signalsDir)
    ? readdirSync(signalsDir).filter((name) => name.endsWith('.json'))
    : [];
  if (signalFiles.length === 0) {
    throw new Error('smart-money-signals/ is empty — signals export failed or was skipped.');
  }

  const trackerDir = join(OUT_DIR, 'smart-money-tracker');
  const trackerFiles = existsSync(trackerDir)
    ? readdirSync(trackerDir).filter((name) => name.endsWith('.json'))
    : [];
  if (trackerFiles.length === 0) {
    throw new Error('smart-money-tracker/ is empty — tracker export failed or was skipped.');
  }

  const sector = JSON.parse(readFileSync(join(OUT_DIR, 'sector-intelligence.json'), 'utf8'));
  if (!Array.isArray(sector?.rows) || sector.rows.length === 0) {
    throw new Error('sector-intelligence.json has no rows — sector export failed or was skipped.');
  }
}

async function exportOnePercentHolderPositions() {
  const record = await buildHolderPositionsRecord();
  writeJson('one-percent-holder-positions.json', record);
  return Object.keys(record).length;
}

async function main() {
  const totalStart = Date.now();
  console.log('\n  Export client data → public/data/\n');
  if (platform() === 'win32' && !process.execArgv.includes('--use-system-ca')) {
    console.warn('  ⚠ Windows: use npm run export:client-data so Neon TLS works (--use-system-ca).');
  }
  mkdirSync(OUT_DIR, { recursive: true });

  let holdings = null;
  const jsonHoldingsPath = join(ROOT, 'src', 'data', 'fund-holdings.json');
  const holdingsSource = process.env.EXPORT_HOLDINGS || 'auto';
  const preferJson =
    holdingsSource === 'json'
    || (holdingsSource === 'auto' && existsSync(jsonHoldingsPath));

  const doneHoldings = logStep('Load holdings');
  if (preferJson) {
    holdings = loadHoldingsFromJson();
    if (holdings) console.log('  ℹ Holdings from fund-holdings.json (fast path)');
  }
  if (!holdings && isDbConfigured() && holdingsSource !== 'json') {
    try {
      holdings = await loadHoldingsFromDb();
    } catch (e) {
      console.warn('  ⚠ DB holdings export failed:', e.message);
    }
  }
  if (!holdings) {
    holdings = loadHoldingsFromJson();
    if (holdings) console.log('  ℹ Using fund-holdings.json fallback');
  }
  if (!holdings) throw new Error('No holdings data source available');
  const jsonHoldings = existsSync(jsonHoldingsPath) ? loadHoldingsFromJson() : null;
  if (jsonHoldings && holdings) {
    holdings = mergeHoldingsPreferMoreStocks(holdings, jsonHoldings);
    console.log('  ℹ Merged fund-holdings.json where it has fuller portfolios');
  }
  doneHoldings(`${holdings.months?.length || 0} months, ${Object.keys(holdings.holdings || {}).length} funds`);

  const doneCompare = logStep('Holdings compare + overlap');
  writeHoldingsCompareExports(holdings);
  writeFundHoldingsBySlugExports(holdings);
  const portfolioOverlap = buildPortfolioOverlapExport(holdings);
  writeJson('portfolio-overlap.json', portfolioOverlap);
  // fund-overlap-index.json is written only with fund-overlaps-by-fund.json (DB step below).
  // Do not write it from holdings keys — parser slugs differ from funds.slug (-direct-plan).
  doneCompare(`${portfolioOverlap.funds.length} funds`);

  const doneFundOverlap = logStep('Fund overlap pages (DB)');
  if (isDbConfigured()) {
    try {
      const [overlapFunds, bySlug] = await Promise.all([
        withDbRetry(() => loadFundsWithOverlapsFromDb(sql), { label: 'Fund overlap index' }),
        withDbRetry(() => loadAllFundOverlapsFromDb(sql), { label: 'Fund overlap pairs' }),
      ]);
      if (overlapFunds.length) {
        writeJson('fund-overlap-index.json', overlapFunds);
        writeJson('fund-overlaps-by-fund.json', {
          month: portfolioOverlap.month || '',
          bySlug,
        });
        doneFundOverlap(`${overlapFunds.length} funds, ${Object.keys(bySlug).length} with rows`);
      } else {
        console.warn('  ⚠ fund_overlaps empty — run db:compute-overlaps; fund overlap pages unchanged');
        doneFundOverlap('skipped (no fund_overlaps rows)');
      }
    } catch (e) {
      console.warn('  ⚠ Fund overlap DB export failed:', e.message);
      console.warn('  ℹ Keeping previous fund-overlap JSON (if any) — index is not overwritten from holdings');
      doneFundOverlap('skipped (DB error)');
    }
  } else {
    console.log('  ℹ DB not configured — fund overlap pages use existing export or stay empty');
    doneFundOverlap('skipped (no DB)');
  }

  const mfFundsAll = loadMutualFundsJson(ROOT);
  const mfFunds = holdings
    ? filterMutualFundsToCurated(mfFundsAll, holdings)
    : mfFundsAll;
  if (mfFunds.length && mfFunds.length < mfFundsAll.length) {
    console.log(`  ℹ mf-hub table: ${mfFunds.length} curated funds (${mfFundsAll.length - mfFunds.length} excluded)`);
  }
  if (mfFunds.length) {
    const doneHoldingsPages = logStep('fund holdings pages export');
    const overlapSlugs = portfolioOverlap.funds.map((f) => f.slug).filter(Boolean);
    const jsonHoldingsMeta = buildHoldingsMetaFromJson(holdings);
    let holdingsMeta = jsonHoldingsMeta;
    if (isDbConfigured()) {
      try {
        const dbMeta = await withDbRetry(
          () => loadHoldingsMetaFromDb(sql),
          { label: 'mf-hub holdings meta' },
        );
        holdingsMeta = mergeHoldingsMeta(dbMeta, jsonHoldingsMeta);
        const dbOnly = Object.keys(dbMeta.stockCounts || {}).length;
        const merged = Object.keys(holdingsMeta.stockCounts || {}).length;
        if (merged > dbOnly) {
          console.log(`  ℹ Merged parser holdings meta (+${merged - dbOnly} slugs not in DB match)`);
        }
      } catch (e) {
        console.warn('  ⚠ mf-hub holdings meta from DB failed:', e.message);
        console.log('  ℹ Using parser fund-holdings.json for holdings meta');
      }
    }
    const enrichedMeta = enrichHoldingsMetaWithOverlap(holdingsMeta, overlapSlugs);

    let holdingsIndex = [];
    if (isDbConfigured()) {
      try {
        holdingsIndex = await withDbRetry(
          () => loadFundHoldingsIndexFromDb(sql, overlapSlugs),
          { label: 'Fund holdings index' },
        );
      } catch (e) {
        console.warn('  ⚠ Fund holdings index from DB failed:', e.message);
      }
    }
    const pageSlugSet = new Set(holdingsIndex.map((f) => f.slug));

    const doneMfHub = logStep('mf-hub export');
    const hub = buildMfHubExports(mfFunds, enrichedMeta, {
      amcCount: Object.keys(holdings.amcs || {}).length,
      fundCount: Object.values(enrichedMeta.stockCounts).length,
      latestMonth: holdings.months?.[holdings.months.length - 1] || '',
      overlapSlugs,
      pageSlugSet,
    });
    if (!holdingsIndex.length) {
      holdingsIndex = buildFundHoldingsIndexFromHub(hub.all, mfFunds);
      for (const row of holdingsIndex) pageSlugSet.add(row.slug);
      console.log('  ℹ Fund holdings index from mf-hub fallback');
    }
    if (holdingsIndex.length) {
      writeJson('fund-holdings-index.json', holdingsIndex);
      const aliases = buildFundHoldingsAliases(
        hub.all,
        holdingsIndex.map((f) => f.slug),
      );
      writeJson('fund-holdings-aliases.json', aliases);
      alignFundOverlapExports(aliases);
      doneHoldingsPages(
        `${holdingsIndex.length} pages, ${Object.keys(aliases).length} aliases`,
      );
    } else {
      doneHoldingsPages('skipped (no holdings pages)');
    }
    mkdirSync(join(OUT_DIR, 'mf-hub'), { recursive: true });
    writeJson('mf-hub/meta.json', hub.meta);
    writeJson('mf-hub/best.json', hub.best);
    writeJson('mf-hub/all.json', hub.all);
    writeJson('fund-holdings-meta.json', serializeHoldingsMetaForDisk(enrichedMeta, hub.all));
    doneMfHub(`${mfFunds.length} funds`);
  }

  if (isDbConfigured()) {
    try {
      const doneSmDb = logStep('Smart Money exports (DB — parallel)');
      const smStart = Date.now();

      const [trackerResult, signals, sectors] = await Promise.all([
        withDbRetry(() => buildSmartMoneyExports(sql), { label: 'Smart Money tracker export' }),
        withDbRetry(() => buildSmartMoneySignalsExport(sql), { label: 'Smart Money signals export' }),
        withDbRetry(() => buildSectorIntelligenceExport(sql), { label: 'Sector intelligence export' }),
      ]);

      const { tracker } = trackerResult;
      writeSplitByMonth(
        'smart-money-tracker',
        'smart-money-tracker-index.json',
        {
          months: tracker.months,
          categories: tracker.categories,
          sectors: tracker.sectors,
        },
        tracker.months.map((m) => m.label),
        (month) => {
          const block = tracker.byMonth[month];
          return {
            month: block.month,
            prevMonth: block.prevMonth,
            increased: block.increased,
            decreased: block.decreased,
            fresh_entry: block.fresh_entry,
            complete_exit: block.complete_exit,
          };
        },
      );
      writeSignalsByCategory(signals);
      writeJson('sector-intelligence.json', sectors);

      const smSec = ((Date.now() - smStart) / 1000).toFixed(1);
      doneSmDb(
        `tracker ${tracker.months.length}mo · signals ${signals.months?.length || 0}mo · sectors ${sectors.rows?.length || 0} rows (${smSec}s)`,
      );
      try {
        await withDbRetry(() => sql`SELECT refresh_super_investor_views()`, {
          label: 'Refresh super-investor materialized views',
        });
        console.log('    ✓ Super-investor materialized views refreshed');
      } catch (refreshErr) {
        console.warn('  ⚠ MV refresh skipped:', refreshErr.message);
      }
    } catch (e) {
      if (hasExistingSmartMoneyExports()) {
        console.warn(`  ⚠ Smart Money DB export failed — using existing public/data files: ${e.message}`);
        console.warn('  ℹ Re-run when Neon is reachable to refresh signals.');
      } else {
        throw new Error(formatDbError(e, { step: 'Smart Money export', windowsTlsHint: neonTlsHint() }));
      }
    }
  } else {
    console.log('  ℹ DB not configured — checking for monolith signal files to split');
  }

  if (isDbConfigured()) {
    const doneOpcPositions = logStep('1% Club holder positions index');
    try {
      const keys = await withDbRetry(() => exportOnePercentHolderPositions(), {
        label: '1% Club holder positions',
      });
      doneOpcPositions(`${keys} holder keys`);
    } catch (e) {
      console.warn('  ⚠ 1% Club holder positions export failed:', e.message);
      doneOpcPositions('skipped');
    }
  }

  const doneTopStocks = logStep('Top Stocks export');
  try {
    if (isDbConfigured()) {
      const topStocks = await exportTopStocksFromDb();
      writeTopStocksJson(topStocks);
      doneTopStocks(topStocks.hasData ? 'ok' : 'empty');
    } else {
      writeTopStocksJson(EMPTY_TOP_STOCKS);
      doneTopStocks('skipped (no DB)');
    }
  } catch (e) {
    console.warn('  ⚠ Top Stocks export failed:', e.message);
    writeTopStocksJson(EMPTY_TOP_STOCKS);
    doneTopStocks('fallback empty');
  }

  const doneFinalize = logStep('Finalize + verify');
  splitMonolithSignalsOnDisk();
  migrateSignalsExportTiersOnDisk();
  const aliasesPath = join(OUT_DIR, 'fund-holdings-aliases.json');
  const aliases = existsSync(aliasesPath)
    ? JSON.parse(readFileSync(aliasesPath, 'utf-8'))
    : {};
  if (Object.keys(aliases).length) {
    alignFundOverlapExports(aliases);
  }
  verifyFundOverlapExports(aliases);
  verifySmartMoneyExports();
  doneFinalize();

  const totalSec = ((Date.now() - totalStart) / 1000).toFixed(1);
  writeFileSync(
    join(OUT_DIR, '.export-stamp.json'),
    JSON.stringify({ exportedAt: new Date().toISOString(), durationSec: Number(totalSec) }),
  );

  const insights = spawnSync(
    process.execPath,
    [...nodeExtraArgs(), join(dirname(fileURLToPath(import.meta.url)), 'generate-insights-articles.mjs')],
    { stdio: 'inherit', cwd: join(dirname(fileURLToPath(import.meta.url)), '..'), env: process.env },
  );
  if ((insights.status ?? 1) !== 0) {
    console.warn('  ⚠ Insights article generation failed — build will retry');
  }

  console.log(`\n  ✅ Export complete (${totalSec}s total)\n`);
}

main().catch((e) => {
  console.error('❌ export-client-data failed:', e.message);
  if (platform() === 'win32' && !process.execArgv.includes('--use-system-ca')) {
    console.error('   Tip: use npm run export:client-data (not raw node) for Neon TLS on Windows.');
  }
  console.error('   Quick test: node --use-system-ca db/test-connection.mjs');
  process.exit(1);
});
