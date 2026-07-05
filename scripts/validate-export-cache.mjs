#!/usr/bin/env node
/**
 * CI guard — public/data must be complete before Astro build.
 * Exit 0 when cache is usable; exit 1 so the workflow can force a fresh export.
 */
import { publicDataMissingRequirements } from './lib/dist-data-sync.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const missing = publicDataMissingRequirements(ROOT);

if (missing.length) {
  console.error('  ✗ Export cache incomplete:');
  for (const item of missing) console.error(`    - ${item}`);
  process.exit(1);
}

console.log('  ✓ Export cache complete (smart-money signals + fund overlap + indexes on disk)');
