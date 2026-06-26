#!/usr/bin/env node
/**
 * Export SAST updates feed to public/data/
 *   - sast-updates-curated.json  (small, SSR + default tab)
 *   - sast-updates.json          (full 90-day feed, lazy-loaded)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql } from './lib/db.mjs';
import { buildEntityResolver } from './lib/entity-name-resolver.mjs';
import { fetchSASTFilings, closeSIBrowser } from './lib/si-sources.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const OUT_ALL = join(DATA_DIR, 'sast-updates.json');
const OUT_CURATED = join(DATA_DIR, 'sast-updates-curated.json');
const SEEDS_PATH = join(ROOT, 'src', 'data', 'super-investors.json');

const HISTORY_DAYS = 90;
const DEFAULT_LOOKBACK = 7;

const args = process.argv.slice(2);
const lookbackDays = parseInt(
  (args.find((a) => a.startsWith('--days=')) || '').split('=')[1] || String(DEFAULT_LOOKBACK),
  10
);

function slugifyEntity(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
}

function itemId(f) {
  const sym = (f.nseSymbol || f.stockName || '').toUpperCase();
  const filer = (f.filerName || '').toLowerCase().trim();
  return `${f.filingDate}|${sym}|${filer}|${f.prePct ?? ''}|${f.postPct ?? ''}`;
}

function inferExchange(sourceUrl) {
  if (!sourceUrl) return null;
  const u = String(sourceUrl).toLowerCase();
  if (u.includes('bseindia')) return 'BSE';
  if (u.includes('nseindia')) return 'NSE';
  return null;
}

function trimFilerName(name) {
  let s = String(name || '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Unknown filer';

  const estate = s.match(/^(.{3,80}?)\s+has submitted to the exchange/i);
  if (estate) return estate[1].trim();

  if (/^report under regulation/i.test(s)) return 'SAST exchange report';
  if (/^disclosure under regulation/i.test(s)) return 'SAST disclosure';
  if (/has informed the exchange regarding/i.test(s)) {
    const co = s.match(/^(.{3,60}?)\s+has informed/i);
    return co ? co[1].trim() : 'Company SAST disclosure';
  }

  if (s.length > 96) s = `${s.slice(0, 93)}...`;
  return s;
}

function resolveFilerMatch(resolver, filing) {
  const direct = resolver.resolve(filing.filerName);
  if (direct) return direct;

  const subject = filing.subject || filing.filerName || '';
  if (!subject) return null;

  const named = subject.match(
    /(?:name of the acquirer|acquirer|acquired by|disclosed by)[:\s-]+([A-Z][A-Za-z0-9'&.\s(),-]{3,}?)(?:\s+\(|\.|,|\s+has|\s+from)/i
  );
  if (named) {
    const m = resolver.resolve(named[1].trim());
    if (m) return m;
  }

  return resolver.resolve(subject.slice(0, 200));
}

async function loadEntities() {
  if (process.env.DATABASE_URL) {
    try {
      return await sql`SELECT * FROM tracked_entities WHERE is_active = true`;
    } catch (err) {
      console.warn(`  DB entities load failed, using JSON roster: ${err.message}`);
    }
  }

  const seeds = JSON.parse(readFileSync(SEEDS_PATH, 'utf8'));
  return seeds.map((s, i) => ({
    id: i + 1,
    name: s.name,
    slug: slugifyEntity(s.name),
    display_name: s.displayName || s.name,
    type: s.type || 'individual',
    aliases: s.aliases || [],
    is_active: true,
  }));
}

async function loadStockMap() {
  const map = new Map();
  if (!process.env.DATABASE_URL) return map;

  try {
    const rows = await sql`
      SELECT id, name, slug, nse_symbol FROM stocks WHERE nse_symbol IS NOT NULL
    `;
    for (const s of rows) {
      if (s.nse_symbol) map.set(s.nse_symbol.toUpperCase(), s);
    }
  } catch (err) {
    console.warn(`  DB stocks load failed: ${err.message}`);
  }
  return map;
}

function loadExisting() {
  if (!existsSync(OUT_ALL)) {
    return { generatedAt: null, lookbackDays: DEFAULT_LOOKBACK, items: [] };
  }
  try {
    return JSON.parse(readFileSync(OUT_ALL, 'utf8'));
  } catch {
    return { generatedAt: null, lookbackDays: DEFAULT_LOOKBACK, items: [] };
  }
}

function mergeItems(existingItems, freshItems) {
  const byId = new Map();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  for (const item of existingItems) {
    if (item.filingDate && item.filingDate >= cutoffStr) {
      byId.set(item.id, item);
    }
  }

  for (const item of freshItems) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? { ...item, firstSeenAt: prev.firstSeenAt } : item);
  }

  return [...byId.values()].sort((a, b) => {
    if (a.isCuratedMatch !== b.isCuratedMatch) return a.isCuratedMatch ? -1 : 1;
    return (b.filingDate || '').localeCompare(a.filingDate || '');
  });
}

function buildMeta(items, freshItems, curatedMatches) {
  return {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    historyDays: HISTORY_DAYS,
    curatedMatchCount: items.filter((i) => i.isCuratedMatch).length,
    totalCount: items.length,
    newThisRun: freshItems.length,
    curatedNewThisRun: curatedMatches,
  };
}

async function main() {
  console.log('');
  console.log('Export SAST Updates -> public/data/');
  console.log(`  ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log(`  Weekly lookback: ${lookbackDays} days | History: ${HISTORY_DAYS} days`);
  console.log('');

  const existing = loadExisting();
  const entities = await loadEntities();
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const resolver = buildEntityResolver(entities);
  const stockBySymbol = await loadStockMap();

  console.log(`  Entities: ${resolver.indexStats.entityCount} | Stocks: ${stockBySymbol.size}`);

  const filings = await fetchSASTFilings(lookbackDays);
  console.log(`  Fetched ${filings.length} SAST filings`);

  const freshItems = [];
  let curatedMatches = 0;

  for (const f of filings) {
    if (!f.filingDate) continue;

    const match = resolveFilerMatch(resolver, f);
    const entity = match ? entityById.get(match.entityId) : null;
    const sym = (f.nseSymbol || '').toUpperCase();
    const stock = sym ? stockBySymbol.get(sym) : null;
    const stockName = f.stockName || stock?.name || '';
    const stockSlug = stock?.slug ?? (stockName ? slugifyEntity(stockName) : null);

    if (match) curatedMatches++;

    freshItems.push({
      id: itemId(f),
      filingDate: f.filingDate,
      exchange: inferExchange(f.sourceUrl),
      stockName,
      stockSlug,
      nseSymbol: f.nseSymbol || null,
      filerName: trimFilerName(f.filerName),
      entitySlug: entity?.slug ?? null,
      entityDisplayName: entity?.display_name ?? entity?.name ?? null,
      matchConfidence: match?.confidence ?? null,
      prePct: f.prePct,
      postPct: f.postPct,
      transactionNature: f.transactionNature || 'other',
      sourceUrl: f.sourceUrl,
      isCuratedMatch: Boolean(match),
      firstSeenAt: new Date().toISOString(),
    });
  }

  const items = mergeItems(existing.items || [], freshItems);
  const meta = buildMeta(items, freshItems, curatedMatches);
  const curatedItems = items.filter((i) => i.isCuratedMatch);

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUT_ALL, JSON.stringify({ ...meta, items }));
  writeFileSync(OUT_CURATED, JSON.stringify({ ...meta, totalCount: curatedItems.length, items: curatedItems }));

  console.log(`  Wrote ${items.length} total (${freshItems.length} this run, ${curatedMatches} curated)`);
  console.log(`  Curated file: ${curatedItems.length} items -> ${OUT_CURATED}`);
  console.log(`  Full file: ${OUT_ALL}`);
  console.log('');
}

main()
  .catch((err) => {
    console.error('SAST export failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSIBrowser();
  });