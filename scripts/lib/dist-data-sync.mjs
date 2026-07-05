/**
 * Keep built output in sync with exported public/data JSON.
 * Astro + @astrojs/vercel sometimes omit large public/data trees from dist/;
 * CI and prebuilt deploys rely on dist/data and .vercel/output/static/data.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const REQUIRED_ROOT_FILES = [
  'smart-money-signals-index.json',
  'sector-intelligence.json',
  'smart-money-tracker-index.json',
  'fund-overlap-index.json',
  'fund-overlaps-by-fund.json',
];

export function publicDataDir(root) {
  return join(root, 'public', 'data');
}

export function distDataDir(root) {
  return join(root, 'dist', 'data');
}

export function vercelStaticDataDir(root) {
  return join(root, '.vercel', 'output', 'static', 'data');
}

export function publicSmartMoneySignalsReady(publicData) {
  const signalsDir = join(publicData, 'smart-money-signals');
  if (!existsSync(signalsDir)) return false;
  return readdirSync(signalsDir).some((name) => name.endsWith('.json'));
}

/** @returns {string[]} missing requirements */
export function publicDataMissingRequirements(root) {
  const publicData = publicDataDir(root);
  const missing = [];

  if (!existsSync(publicData)) {
    missing.push('public/data/');
    return missing;
  }

  for (const name of REQUIRED_ROOT_FILES) {
    if (!existsSync(join(publicData, name))) {
      missing.push(`public/data/${name}`);
    }
  }

  if (!publicSmartMoneySignalsReady(publicData)) {
    missing.push('public/data/smart-money-signals/ (missing or empty)');
  }

  return missing;
}

function distDataIncomplete(root) {
  const distData = distDataDir(root);
  if (!existsSync(distData)) return true;

  for (const name of REQUIRED_ROOT_FILES) {
    if (!existsSync(join(distData, name))) return true;
  }

  const distSignals = join(distData, 'smart-money-signals');
  if (!existsSync(distSignals)) return true;
  if (!readdirSync(distSignals).some((name) => name.endsWith('.json'))) return true;

  return false;
}

export function resolveBuiltDataDir(root) {
  const distData = distDataDir(root);
  if (existsSync(distData)) return distData;
  const vercelData = vercelStaticDataDir(root);
  if (existsSync(vercelData)) return vercelData;
  return distData;
}

/**
 * @returns {{ synced: string[] }} target labels that were synced
 */
export function ensureDistDataSynced(root, { force = false } = {}) {
  const missing = publicDataMissingRequirements(root);
  if (missing.length) {
    throw new Error(`public/data incomplete — ${missing.join(', ')}`);
  }

  const publicData = publicDataDir(root);
  const synced = [];

  if (existsSync(join(root, 'dist')) && (force || distDataIncomplete(root))) {
    const distData = distDataDir(root);
    mkdirSync(distData, { recursive: true });
    cpSync(publicData, distData, { recursive: true, force: true });
    synced.push('dist/data');
  }

  const vercelStatic = join(root, '.vercel', 'output', 'static');
  if (existsSync(vercelStatic)) {
    const vercelData = vercelStaticDataDir(root);
    const vercelIncomplete =
      !existsSync(vercelData)
      || REQUIRED_ROOT_FILES.some((name) => !existsSync(join(vercelData, name)))
      || !publicSmartMoneySignalsReady(vercelData);

    if (vercelIncomplete) {
      mkdirSync(vercelData, { recursive: true });
      cpSync(publicData, vercelData, { recursive: true, force: true });
      synced.push('.vercel/output/static/data');
    }
  }

  return { synced };
}
