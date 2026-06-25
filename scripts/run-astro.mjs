#!/usr/bin/env node
/**
 * Run Astro CLI with --use-system-ca on Windows (Neon TLS).
 * Usage: node scripts/run-astro.mjs dev|build|preview [...]
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { nodeExtraArgs } from './lib/node-runner.mjs';

const require = createRequire(import.meta.url);
const astroPkgDir = dirname(require.resolve('astro/package.json'));
const astroBin = join(astroPkgDir, 'bin', 'astro.mjs');
const args = process.argv.slice(2);

if (!args.length) {
  console.error('Usage: node scripts/run-astro.mjs <dev|build|preview> [args...]');
  process.exit(1);
}

const result = spawnSync(process.execPath, [...nodeExtraArgs(), astroBin, ...args], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
