#!/usr/bin/env node
/**
 * Run independent post-Astro build steps — verifications in parallel, sitemap last.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
  'scripts/verify-og-images.mjs',
  'scripts/verify-brand-copy.mjs',
  'scripts/verify-signals-export.mjs',
];

await run('scripts/ensure-dist-data.mjs');

console.log(`  parallel-postbuild: ${parallel.length} verification(s) in parallel`);
await Promise.all(parallel.map(run));

await run('scripts/reorganize-sitemaps.mjs');
await run('scripts/verify-sitemaps.mjs');

console.log('  ✓ parallel-postbuild complete');
