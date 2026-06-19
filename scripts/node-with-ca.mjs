#!/usr/bin/env node
/**
 * Cross-platform node runner.
 * Adds --use-system-ca on Windows only (fixes Neon TLS locally).
 * Usage: node scripts/node-with-ca.mjs path/to/script.mjs [args...]
 */
import { spawnSync } from 'node:child_process';
import { nodeExtraArgs } from './lib/node-runner.mjs';

const scriptArgs = process.argv.slice(2);
if (scriptArgs.length === 0) {
  console.error('Usage: node scripts/node-with-ca.mjs <script> [args...]');
  process.exit(1);
}

const result = spawnSync(process.execPath, [...nodeExtraArgs(), ...scriptArgs], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
