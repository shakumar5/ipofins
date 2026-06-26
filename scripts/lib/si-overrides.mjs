/**
 * JSON-override fallback for Super Investor / PMS / AIF pipelines.
 *
 * When NSE/BSE endpoints change or a PMS provider's site breaks, the live
 * fetchers may return empty. To keep the products serving data, hand-curated
 * override files can be dropped into `src/data/si-overrides/` and the pipeline
 * merges them with whatever the scrapers found (overrides win on conflict).
 *
 * File naming: `{pipeline}-{quarter}.json`  e.g. `superinvestor-2026-04-01.json`
 * Supported pipelines: superinvestor | pms | altfunds  (SAST is event-driven —
 * an empty result means "no events", not "fetch failed", so no override there).
 *
 * Each pipeline documents its row shape inline. Schemas intentionally match the
 * shape the pipeline already writes to the DB, so no transformation is needed.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERRIDES_DIR = join(__dirname, '..', '..', 'src', 'data', 'si-overrides');

/**
 * Load override rows for a pipeline + quarter.
 *
 * @param {'superinvestor'|'pms'|'altfunds'} pipeline
 * @param {string} quarter  e.g. "2026-04-01"
 * @returns {Array} override rows (empty array if no file / parse error)
 */
export function loadOverrides(pipeline, quarter) {
  if (!pipeline || !quarter) return [];
  const path = join(OVERRIDES_DIR, `${pipeline}-${quarter}.json`);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : data.holdings || data.rows || [];
    console.log(`    📝 Loaded ${rows.length} override rows from ${pipeline}-${quarter}.json`);
    return rows;
  } catch (err) {
    console.log(`    ⚠️ Override file ${path} could not be parsed: ${err.message}`);
    return [];
  }
}

/**
 * Merge scraped rows with override rows. Overrides win on conflicts keyed by
 * `keyFn`. Rows without a key are appended unconditionally.
 *
 * @param {Array} scraped
 * @param {Array} overrides
 * @param {(row)=>string} keyFn
 * @returns {Array}
 */
export function mergeWithOverrides(scraped, overrides, keyFn = () => null) {
  const merged = new Map();
  for (const row of scraped) {
    const k = keyFn(row);
    if (k) merged.set(k, row);
    else merged.set(Symbol(), row);
  }
  for (const row of overrides) {
    const k = keyFn(row);
    if (k) merged.set(k, { ...(merged.get(k) || {}), ...row });
    else merged.set(Symbol(), row);
  }
  return [...merged.values()];
}
