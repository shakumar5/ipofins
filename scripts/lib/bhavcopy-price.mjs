/**
 * NSE / BSE bhavcopy — quarter-end close prices.
 * NSE-listed → NSE file; BSE-only → BSE file (by scrip code).
 * Local files: data/bhavcopy/ or BHAVCOPY_DIR (checked before download).
 *
 * BSE formats supported (best first):
 *   1. UDiFF CM — BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.CSV (official, same as live download)
 *   2. UDiFF EQ — BSE_EQ_BHAVCOPY_DDMMYYYY_T0.csv
 *   3. Legacy   — EQ_ISINCODE_DDMMYY_T0.CSV (SC_CODE / CLOSE)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const NSE_BHAV_URL = (d) =>
  `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${d}_F_0000.csv.zip`;
const BSE_BHAV_URL = (d) =>
  `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${d}_F_0000.CSV`;

/** @type {Map<string, Map<string, number>>} */
const nseDayCache = new Map();
/** @type {Map<string, Map<string, number>>} */
const bseDayCache = new Map();

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** ISO date → YYYYMMDD */
export function isoToYmd(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

/** YYYYMMDD → BSE DDMMYYYY e.g. 20260330 → 30032026 */
function ymdToBseDdMmYyyy(ymd) {
  if (!ymd || ymd.length !== 8) return null;
  return `${ymd.slice(6, 8)}${ymd.slice(4, 6)}${ymd.slice(0, 4)}`;
}

/** YYYYMMDD → BSE DDMMYY e.g. 20260330 → 300326 */
function ymdToBseDdMmYy(ymd) {
  if (!ymd || ymd.length !== 8) return null;
  return `${ymd.slice(6, 8)}${ymd.slice(4, 6)}${ymd.slice(2, 4)}`;
}

function prevYmd(ymd) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6)) - 1;
  const d = Number(ymd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}`;
}

/** Ordered YYYYMMDD dates to try for quarter-end EOD close (newest first). */
export function quarterPriceYmdCandidates(startIso, endIso, priceEndIso = null) {
  const startYmd = isoToYmd(startIso);
  const endYmd = isoToYmd(endIso);
  const primary = isoToYmd(priceEndIso || endIso);
  if (!startYmd || !endYmd || !primary) return [];

  const seen = new Set();
  const out = [];
  const push = (ymd) => {
    if (!ymd || ymd < startYmd || ymd > endYmd || seen.has(ymd)) return;
    seen.add(ymd);
    out.push(ymd);
  };

  push(primary);
  if (primary !== endYmd) push(endYmd);

  let ymd = endYmd;
  for (let i = 0; i < 25; i++) {
    push(ymd);
    ymd = prevYmd(ymd);
    if (ymd < startYmd) break;
  }

  return out;
}

function bhavcopyDirs() {
  const dirs = [];
  if (process.env.BHAVCOPY_DIR) dirs.push(process.env.BHAVCOPY_DIR);
  dirs.push(join(ROOT, 'data', 'bhavcopy'));
  return [...new Set(dirs)];
}

/** All plausible local paths for one trading day. */
function localBhavPaths(exchange, ymd) {
  const paths = [];
  const ddmmyyyy = ymdToBseDdMmYyyy(ymd);
  const ddmmyy = ymdToBseDdMmYy(ymd);

  const explicit =
    exchange === 'nse'
      ? [
          `BhavCopy_NSE_CM_0_0_0_${ymd}_F_0000.csv`,
          `BhavCopy_NSE_CM_0_0_0_${ymd}_F_0000.csv.zip`,
          `nse/BhavCopy_NSE_CM_0_0_0_${ymd}_F_0000.csv`,
          `nse/${ymd}.csv`,
        ]
      : [
          `BhavCopy_BSE_CM_0_0_0_${ymd}_F_0000.CSV`,
          `BhavCopy_BSE_CM_0_0_0_${ymd}_F_0000.csv`,
          `bse/BhavCopy_BSE_CM_0_0_0_${ymd}_F_0000.CSV`,
          `BSE_EQ_BHAVCOPY_${ddmmyyyy}_T0.csv`,
          `bse/BSE_EQ_BHAVCOPY_${ddmmyyyy}_T0.csv`,
          `BSE_EQ_BHAVCOPY_${ddmmyyyy}_T0/BSE_EQ_BHAVCOPY_${ddmmyyyy}_T0.csv`,
          `EQ_ISINCODE_${ddmmyy}_T0.CSV`,
          `EQ_ISINCODE_${ddmmyy}_T0.csv`,
          `bse/EQ_ISINCODE_${ddmmyy}_T0.CSV`,
        ];

  for (const base of bhavcopyDirs()) {
    for (const name of explicit) {
      paths.push(join(base, name));
    }

    // Files in base or nse/bse subdirs whose name contains the date token
    const tokens = exchange === 'nse' ? [ymd] : [ymd, ddmmyyyy, ddmmyy].filter(Boolean);
    for (const rel of ['', exchange === 'nse' ? 'nse' : 'bse']) {
      const dir = join(base, rel);
      if (!existsSync(dir)) continue;
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (!tokens.some((t) => ent.name.includes(t))) continue;
        const p = join(dir, ent.name);
        paths.push(p);
        if (ent.isDirectory()) {
          const inner = join(p, ent.name);
          if (existsSync(inner)) paths.push(inner);
        }
      }
    }
  }

  return [...new Set(paths)];
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function unzipSingleZip(buf) {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) return null;
  const method = buf.readUInt16LE(8);
  const cSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const off = 30 + nameLen + extraLen;
  const data = buf.subarray(off, off + cSize);
  if (method === 8) return inflateRawSync(data);
  if (method === 0) return data;
  return null;
}

function csvTextFromBytes(buf) {
  if (!buf?.length) return null;
  if (buf.readUInt32LE(0) === 0x04034b50) {
    const raw = unzipSingleZip(buf);
    return raw ? raw.toString('utf8') : null;
  }
  const text = buf.toString('utf8');
  const head = text.trimStart().slice(0, 12);
  if (
    head.startsWith('TradDt') ||
    head.startsWith('SYMBOL') ||
    head.startsWith('ISIN') ||
    head.startsWith('SC_CODE')
  ) {
    return text;
  }
  return null;
}

/** Detect bhavcopy CSV variant from header row. */
function detectBhavFormat(headerLine) {
  const h = headerLine.trim();
  if (h.startsWith('TradDt,') && h.includes('FinInstrmId') && h.includes('ClsPric')) return 'udiff-cm';
  if (h.startsWith('ISIN,') && h.includes('FinInstrmId') && h.includes('ClsPric')) return 'udiff-eq';
  if (h.startsWith('SC_CODE,') && h.includes('CLOSE')) return 'legacy-isin';
  if (h.startsWith('SYMBOL,')) return 'nse-legacy';
  return null;
}

/** Parse any supported bhavcopy CSV into { byNse, byBse } maps. */
function parseBhavCsv(csvText) {
  const byNse = new Map();
  const byBse = new Map();
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { byNse, byBse };

  const format = detectBhavFormat(lines[0]);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 4) continue;

    let close = null;
    let sym = null;
    let scrip = null;

    if (format === 'udiff-cm' || format === 'udiff-eq') {
      const seg = cols[idx.Sgmt];
      const typ = cols[idx.FinInstrmTp];
      if (format === 'udiff-cm' && seg && seg !== 'CM') continue;
      if (typ && typ !== 'STK') continue;
      close = Number(cols[idx.ClsPric]);
      sym = cols[idx.TckrSymb];
      scrip = cols[idx.FinInstrmId];
    } else if (format === 'legacy-isin') {
      const typ = String(cols[idx.SC_TYPE] || '').trim();
      if (typ && typ !== 'Q' && typ !== 'EQ' && typ !== 'B' && typ !== 'T') continue;
      close = Number(cols[idx.CLOSE]);
      scrip = cols[idx.SC_CODE];
      sym = cols[idx.SC_NAME];
    } else if (format === 'nse-legacy') {
      close = Number(cols[idx.CLOSE] ?? cols[idx['CLOSE PRICE']]);
      sym = cols[idx.SYMBOL];
      scrip = cols[idx['SERIES']];
    } else {
      continue;
    }

    if (!Number.isFinite(close) || close <= 0) continue;
    const nseKey = String(sym || '').trim().toUpperCase();
    const bseKey = String(scrip || '').trim();
    if (nseKey && nseKey.length <= 20 && !/^\d+$/.test(nseKey)) byNse.set(nseKey, close);
    if (bseKey && /^\d+$/.test(bseKey)) byBse.set(bseKey, close);
  }

  return { byNse, byBse };
}

function readLocalBhav(exchange, ymd) {
  for (const path of localBhavPaths(exchange, ymd)) {
    if (!existsSync(path)) continue;
    try {
      const text = csvTextFromBytes(readFileSync(path));
      if (!text) continue;
      const parsed = parseBhavCsv(text);
      const map = exchange === 'nse' ? parsed.byNse : parsed.byBse;
      if (map.size > 0) return map;
    } catch {
      /* try next path */
    }
  }
  return null;
}

async function fetchBytes(url, referer) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: referer, Accept: '*/*' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function loadNseDay(ymd) {
  if (nseDayCache.has(ymd)) return nseDayCache.get(ymd);

  const local = readLocalBhav('nse', ymd);
  if (local) {
    nseDayCache.set(ymd, local);
    return local;
  }

  const zip = await fetchBytes(NSE_BHAV_URL(ymd), 'https://www.nseindia.com/');
  if (!zip || zip.readUInt32LE(0) !== 0x04034b50) {
    nseDayCache.set(ymd, null);
    return null;
  }
  const text = csvTextFromBytes(zip);
  if (!text) {
    nseDayCache.set(ymd, null);
    return null;
  }
  const { byNse } = parseBhavCsv(text);
  nseDayCache.set(ymd, byNse.size ? byNse : null);
  return nseDayCache.get(ymd);
}

async function loadBseDay(ymd) {
  if (bseDayCache.has(ymd)) return bseDayCache.get(ymd);

  const local = readLocalBhav('bse', ymd);
  if (local) {
    bseDayCache.set(ymd, local);
    return local;
  }

  const buf = await fetchBytes(BSE_BHAV_URL(ymd), 'https://www.bseindia.com/');
  const text = buf ? csvTextFromBytes(buf) : null;
  if (!text) {
    bseDayCache.set(ymd, null);
    return null;
  }
  const { byBse } = parseBhavCsv(text);
  bseDayCache.set(ymd, byBse.size ? byBse : null);
  return bseDayCache.get(ymd);
}

async function closeInRange(exchange, key, range) {
  const candidates = quarterPriceYmdCandidates(
    range.startIso,
    range.endIso,
    range.priceEndIso,
  );
  for (const ymd of candidates) {
    const day = exchange === 'nse' ? await loadNseDay(ymd) : await loadBseDay(ymd);
    if (!day) continue;
    const px = day.get(exchange === 'nse' ? key.toUpperCase() : String(key).trim());
    if (px != null && px > 0) return px;
  }
  return null;
}

/**
 * Quarter-end close from official bhavcopy.
 * NSE symbol → NSE file; BSE-only (no NSE symbol) → BSE file by scrip code.
 */
export async function fetchBhavcopyQuarterEndClose(nseSymbol, quarterStart, bseCode = null, range) {
  const nse = String(nseSymbol || '').trim().toUpperCase();
  const bse = String(bseCode || '').trim();
  if (!range?.startIso || !range?.endIso) return null;

  if (nse) return closeInRange('nse', nse, range);
  if (bse) return closeInRange('bse', bse, range);
  return null;
}

export function clearBhavcopyCache() {
  nseDayCache.clear();
  bseDayCache.clear();
}
