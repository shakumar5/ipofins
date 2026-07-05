#!/usr/bin/env node
/**
 * Run independent pre-Astro build steps in parallel.
 * Usage: node scripts/parallel-prebuild.mjs [--site]
 *   --site  Skip insights article generation (build:site)
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteOnly = process.argv.includes('--site');

function run(relPath) {
  const script = join(ROOT, relPath);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${relPath} exited with code ${code}`));
    });
  });
}

const parallel = [
  'scripts/generate-og-images.mjs',
  'scripts/verify-top-stocks-export.mjs',
];

if (!siteOnly) {
  parallel.push('scripts/generate-insights-articles.mjs');
}

console.log(`  parallel-prebuild: ${parallel.length} task(s) in parallel${siteOnly ? ' (site-only)' : ''}`);
await Promise.all(parallel.map(run));

if (!siteOnly) {
  await run('scripts/verify-insights-articles.mjs');
}

console.log('  ✓ parallel-prebuild complete');
