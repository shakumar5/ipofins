#!/usr/bin/env node
/**
 * Run export-client-data only when outputs are stale or missing.
 * Skip: SKIP_EXPORT=1 | --skip | stamp younger than EXPORT_MAX_AGE_MINUTES (default 180).
 * Force: FORCE_EXPORT=1
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeExtraArgs } from './lib/node-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAMP = join(ROOT, 'public', 'data', '.export-stamp.json');
const REQUIRED = join(ROOT, 'public', 'data', 'smart-money-signals-index.json');
const MAX_AGE_MIN = Number(process.env.EXPORT_MAX_AGE_MINUTES || 180);

function runInsightsGenerate() {
  const gen = spawnSync(
    process.execPath,
    [...nodeExtraArgs(), join(ROOT, 'scripts', 'generate-insights-articles.mjs')],
    { stdio: 'inherit', cwd: ROOT, env: process.env },
  );
  if ((gen.status ?? 1) !== 0) process.exit(gen.status ?? 1);
}

function shouldSkip() {
  if (process.env.SKIP_EXPORT === '1' || process.argv.includes('--skip')) return true;
  if (process.env.FORCE_EXPORT === '1') return false;
  if (!existsSync(STAMP) || !existsSync(REQUIRED)) return false;

  try {
    const stamp = JSON.parse(readFileSync(STAMP, 'utf8'));
    const exportedAt = Date.parse(stamp.exportedAt);
    if (!Number.isFinite(exportedAt)) return false;
    const ageMin = (Date.now() - exportedAt) / 60_000;
    if (ageMin < MAX_AGE_MIN) {
      console.log(`  ⏭ Skipping export — data is ${ageMin.toFixed(0)}m old (fresh for ${MAX_AGE_MIN}m)`);
      console.log('  ℹ Force refresh: FORCE_EXPORT=1 npm run build');
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

if (shouldSkip()) {
  const finalize = spawnSync(
    process.execPath,
    [...nodeExtraArgs(), join(ROOT, 'scripts', 'finalize-signals-on-disk.mjs')],
    { stdio: 'inherit', cwd: ROOT, env: process.env },
  );
  if ((finalize.status ?? 1) !== 0) process.exit(finalize.status ?? 1);

  const topStocks = spawnSync(
    process.execPath,
    [...nodeExtraArgs(), join(ROOT, 'scripts', 'finalize-top-stocks-export.mjs')],
    { stdio: 'inherit', cwd: ROOT, env: process.env },
  );
  if ((topStocks.status ?? 1) !== 0) process.exit(topStocks.status ?? 1);

  const sast = spawnSync(
    process.execPath,
    [...nodeExtraArgs(), join(ROOT, 'scripts', 'finalize-sast-export.mjs')],
    { stdio: 'inherit', cwd: ROOT, env: process.env },
  );
  if ((sast.status ?? 1) !== 0) process.exit(sast.status ?? 1);

  const ensure = spawnSync(
    process.execPath,
    [...nodeExtraArgs(), join(ROOT, 'scripts', 'ensure-portfolio-overlap-sitemaps.mjs')],
    { stdio: 'inherit', cwd: ROOT, env: process.env },
  );
  if ((ensure.status ?? 1) !== 0) process.exit(ensure.status ?? 1);
  runInsightsGenerate();
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [...nodeExtraArgs(), join(ROOT, 'scripts', 'export-client-data.mjs')],
  { stdio: 'inherit', cwd: ROOT, env: process.env },
);

if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

const topStocks = spawnSync(
  process.execPath,
  [...nodeExtraArgs(), join(ROOT, 'scripts', 'finalize-top-stocks-export.mjs')],
  { stdio: 'inherit', cwd: ROOT, env: process.env },
);

if ((topStocks.status ?? 1) !== 0) process.exit(topStocks.status ?? 1);

const sast = spawnSync(
  process.execPath,
  [...nodeExtraArgs(), join(ROOT, 'scripts', 'finalize-sast-export.mjs')],
  { stdio: 'inherit', cwd: ROOT, env: process.env },
);

if ((sast.status ?? 1) !== 0) process.exit(sast.status ?? 1);

runInsightsGenerate();

process.exit(0);
