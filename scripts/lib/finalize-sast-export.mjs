/**
 * Ensure public/data/sast-updates*.json exist on every build.
 *
 * The rich weekly feed is produced by scripts/export-sast-updates.mjs during the
 * monthly / manual SAST workflow and carried between deploys via the public/data
 * cache. When that cache key changes (e.g. a scripts/lib edit bumps the hash), a
 * normal push-to-main deploy would ship without the feed and the page returns 404.
 *
 * This finalizer guarantees the files exist: when a valid feed is already present it
 * is preserved, otherwise a feed is rebuilt from the sast_filings table (populated by
 * the SAST sweep). Falls back to a valid empty payload when no DB is configured.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { isDbConfigured, sql, withDbRetry } from './db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, 'public', 'data');
export const SAST_FULL_PATH = join(DATA_DIR, 'sast-updates.json');
export const SAST_CURATED_PATH = join(DATA_DIR, 'sast-updates-curated.json');

const HISTORY_DAYS = 90;

export function emptySastPayload() {
  return {
    generatedAt: new Date().toISOString(),
    lookbackDays: HISTORY_DAYS,
    historyDays: HISTORY_DAYS,
    curatedMatchCount: 0,
    totalCount: 0,
    items: [],
  };
}

function readJsonFile(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function isValidSastPayload(payload) {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    Array.isArray(payload.items) &&
    typeof payload.generatedAt === 'string' &&
    payload.generatedAt.length > 0
  );
}

function writeJsonFile(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload));
}

function inferExchange(sourceUrl) {
  if (!sourceUrl) return null;
  const u = String(sourceUrl).toLowerCase();
  if (u.includes('bseindia')) return 'BSE';
  if (u.includes('nseindia')) return 'NSE';
  return null;
}

function slugifyEntity(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
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

function toIsoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function toNum(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeNature(nature) {
  const s = String(nature || '').toLowerCase();
  if (s === 'acquisition') return 'acquisition';
  if (s === 'disposal') return 'disposal';
  return 'other';
}

function itemId(filingDate, symbolOrName, filerName, prePct, postPct) {
  const sym = String(symbolOrName || '').toUpperCase();
  const filer = String(filerName || '').toLowerCase().trim();
  return `${filingDate}|${sym}|${filer}|${prePct ?? ''}|${postPct ?? ''}`;
}

async function buildSastFeedFromDb() {
  const rows = await withDbRetry(
    () => sql`
      SELECT
        sf.filing_date,
        sf.filer_name,
        sf.pre_pct,
        sf.post_pct,
        sf.transaction_nature,
        sf.source_url,
        sf.entity_id,
        s.name        AS stock_name,
        s.slug        AS stock_slug,
        s.nse_symbol  AS nse_symbol,
        te.slug         AS entity_slug,
        te.display_name AS entity_display_name,
        te.name         AS entity_name
      FROM sast_filings sf
      JOIN stocks s ON s.id = sf.stock_id
      LEFT JOIN tracked_entities te ON te.id = sf.entity_id
      WHERE sf.filing_date >= CURRENT_DATE - make_interval(days => ${HISTORY_DAYS}::int)
      ORDER BY (sf.entity_id IS NOT NULL) DESC, sf.filing_date DESC
    `,
    { label: 'SAST feed export' },
  );

  const generatedAt = new Date().toISOString();
  const items = rows.map((r) => {
    const filingDate = toIsoDate(r.filing_date);
    const prePct = toNum(r.pre_pct);
    const postPct = toNum(r.post_pct);
    const nseSymbol = r.nse_symbol || null;
    const stockName = r.stock_name || '';
    const isCuratedMatch = r.entity_id != null;
    return {
      id: itemId(filingDate, nseSymbol || stockName, r.filer_name, prePct, postPct),
      filingDate,
      exchange: inferExchange(r.source_url),
      stockName,
      stockSlug: r.stock_slug ?? (stockName ? slugifyEntity(stockName) : null),
      nseSymbol,
      filerName: trimFilerName(r.filer_name),
      entitySlug: r.entity_slug ?? null,
      entityDisplayName: r.entity_display_name ?? r.entity_name ?? null,
      matchConfidence: null,
      prePct,
      postPct,
      transactionNature: normalizeNature(r.transaction_nature),
      sourceUrl: r.source_url ?? null,
      isCuratedMatch,
      firstSeenAt: generatedAt,
    };
  });

  const curatedItems = items.filter((i) => i.isCuratedMatch);
  const meta = {
    generatedAt,
    lookbackDays: HISTORY_DAYS,
    historyDays: HISTORY_DAYS,
    curatedMatchCount: curatedItems.length,
    totalCount: items.length,
  };

  return {
    full: { ...meta, items },
    curated: { ...meta, totalCount: curatedItems.length, items: curatedItems },
  };
}

/** @returns {Promise<boolean>} true when files were (re)written from the DB */
export async function finalizeSastExport() {
  const existingFull = readJsonFile(SAST_FULL_PATH);
  const existingCurated = readJsonFile(SAST_CURATED_PATH);
  if (isValidSastPayload(existingFull) && isValidSastPayload(existingCurated)) {
    console.log('  ✓ sast-updates*.json already present');
    return false;
  }

  if (!isDbConfigured()) {
    if (!existsSync(SAST_FULL_PATH)) writeJsonFile(SAST_FULL_PATH, emptySastPayload());
    if (!existsSync(SAST_CURATED_PATH)) writeJsonFile(SAST_CURATED_PATH, emptySastPayload());
    console.log('  ℹ sast-updates*.json — wrote empty stub(s) (no DATABASE_URL)');
    return false;
  }

  try {
    const { full, curated } = await buildSastFeedFromDb();
    writeJsonFile(SAST_FULL_PATH, full);
    writeJsonFile(SAST_CURATED_PATH, curated);
    console.log(
      `  ✓ sast-updates*.json rebuilt from DB (${full.totalCount} total, ${curated.totalCount} curated)`,
    );
    return true;
  } catch (err) {
    if (!existsSync(SAST_FULL_PATH)) writeJsonFile(SAST_FULL_PATH, emptySastPayload());
    if (!existsSync(SAST_CURATED_PATH)) writeJsonFile(SAST_CURATED_PATH, emptySastPayload());
    console.warn('  ⚠ SAST finalize failed:', err.message);
    return false;
  }
}
