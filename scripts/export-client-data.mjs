/**
 * Export large client payloads to public/data/*.json (once per build/dev).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql, isDbConfigured } from './lib/db.mjs';
import { buildSmartMoneyExports } from './lib/smart-money-export.mjs';
import { buildSmartMoneySignalsExport } from './lib/smart-money-signals-export.mjs';
import { buildSectorIntelligenceExport } from './lib/sector-intelligence-export.mjs';
import { slimSignalRow, signalCategoryFileName } from './lib/signal-export-utils.mjs';
import { unpackMonthHoldings } from './lib/holdings-month.mjs';
import { buildMfHubExports, loadMutualFundsJson } from './lib/mf-hub-export.mjs';
import {
  loadHoldingsMetaFromDb,
  buildHoldingsMetaFromJson,
} from './lib/mf-hub-holdings-meta.mjs';
import { filterMutualFundsToCurated } from './lib/canonical-fund-filter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data');
const PUBLIC_DIR = join(ROOT, 'public');

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

async function loadHoldingsFromDb() {
  const rows = await sql`
    SELECT
      f.slug,
      f.name AS fund_name,
      a.name AS amc_name,
      a.slug AS amc_slug,
      TRIM(TO_CHAR(fh.month, 'FMMonth YYYY')) AS month_label,
      s.name AS stock_name,
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

const PORTFOLIO_OVERLAP_SITEMAP_BASE = 'https://ipofins.com/mutual-funds/portfolio-overlap-checker';
const SITEMAP_URLS_PER_FILE = 45_000;

function writePortfolioOverlapSitemaps(funds) {
  const slugs = funds.map((f) => f.slug).sort();
  const urls = [PORTFOLIO_OVERLAP_SITEMAP_BASE];
  for (let i = 0; i < slugs.length; i += 1) {
    for (let j = i + 1; j < slugs.length; j += 1) {
      urls.push(`${PORTFOLIO_OVERLAP_SITEMAP_BASE}/${slugs[i]}-vs-${slugs[j]}`);
    }
  }

  const escapeXml = (v) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const chunks = [];
  for (let i = 0; i < urls.length; i += SITEMAP_URLS_PER_FILE) {
    chunks.push(urls.slice(i, i + SITEMAP_URLS_PER_FILE));
  }

  chunks.forEach((chunk, idx) => {
    const name = `sitemap-overlap-staging-${idx}.xml`;
    const body = chunk
      .map((loc) => `  <url><loc>${escapeXml(loc)}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`)
      .join('\n');
    writeFileSync(
      join(PUBLIC_DIR, name),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    );
    console.log(`  ✓ ${name} (${chunk.length} overlap URLs, staging)`);
  });
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

/** One JSON file per month × category — keeps client payloads small. */
function writeSignalsByCategory(signals) {
  const dir = join(OUT_DIR, 'smart-money-signals');
  mkdirSync(dir, { recursive: true });
  writeJson('smart-money-signals-index.json', {
    months: signals.months,
    categories: signals.categories,
    layout: 'by-category',
    scoringModel: 'stock-cap-v2',
  });

  for (const month of signals.months) {
    for (const category of signals.categories) {
      const rows = signals.rows
        .filter((r) => r.month === month && r.category === category)
        .map(slimSignalRow);
      const fileName = signalCategoryFileName(month, category);
      const rel = join('smart-money-signals', fileName);
      const full = join(OUT_DIR, rel);
      writeFileSync(full, JSON.stringify({ month, category, rows }));
      const kb = (readFileSync(full).length / 1024).toFixed(0);
      console.log(`  ✓ ${rel} (${kb} KB, ${rows.length} rows)`);
    }
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
    });
  }
}

async function main() {
  console.log('\n  Export client data → public/data/\n');
  mkdirSync(OUT_DIR, { recursive: true });

  let holdings = null;
  if (isDbConfigured()) {
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
  writeHoldingsCompareExports(holdings);
  const portfolioOverlap = buildPortfolioOverlapExport(holdings);
  writeJson('portfolio-overlap.json', portfolioOverlap);
  writePortfolioOverlapSitemaps(portfolioOverlap.funds);
  writeJson(
    'fund-overlap-index.json',
    portfolioOverlap.funds.map((f) => ({ slug: f.slug, name: f.name })),
  );

  const mfFundsAll = loadMutualFundsJson(ROOT);
  const mfFunds = holdings
    ? filterMutualFundsToCurated(mfFundsAll, holdings)
    : mfFundsAll;
  if (mfFunds.length && mfFunds.length < mfFundsAll.length) {
    console.log(`  ℹ mf-hub table: ${mfFunds.length} curated funds (${mfFundsAll.length - mfFunds.length} excluded)`);
  }
  if (mfFunds.length) {
    let holdingsMeta = null;
    if (isDbConfigured()) {
      try {
        holdingsMeta = await loadHoldingsMetaFromDb(sql);
      } catch (e) {
        console.warn('  ⚠ mf-hub holdings meta from DB failed:', e.message);
      }
    }
    if (!holdingsMeta) {
      const rawPath = join(ROOT, 'src', 'data', 'fund-holdings.json');
      const rawHoldings = existsSync(rawPath)
        ? JSON.parse(readFileSync(rawPath, 'utf-8'))
        : holdings;
      holdingsMeta = buildHoldingsMetaFromJson(rawHoldings);
      console.log('  ℹ mf-hub holdings meta from JSON fallback');
    }
    const hub = buildMfHubExports(mfFunds, holdingsMeta, {
      amcCount: Object.keys(holdings.amcs || {}).length,
      fundCount: Object.values(holdingsMeta.stockCounts).length,
      latestMonth: holdings.months?.[holdings.months.length - 1] || '',
    });
    mkdirSync(join(OUT_DIR, 'mf-hub'), { recursive: true });
    writeJson('mf-hub/meta.json', hub.meta);
    writeJson('mf-hub/best.json', hub.best);
    writeJson('mf-hub/all.json', hub.all);
  }

  if (isDbConfigured()) {
    try {
      const { tracker } = await buildSmartMoneyExports(sql);
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
      const signals = await buildSmartMoneySignalsExport(sql);
      writeSignalsByCategory(signals);

      const sectors = await buildSectorIntelligenceExport(sql);
      writeJson('sector-intelligence.json', sectors);
    } catch (e) {
      console.warn('  ⚠ Smart money export skipped:', e.message);
    }
  } else {
    console.log('  ℹ DB not configured — checking for monolith signal files to split');
  }

  splitMonolithSignalsOnDisk();

  console.log('');
}

main().catch((e) => {
  console.error('❌ export-client-data failed:', e.message);
  process.exit(1);
});
