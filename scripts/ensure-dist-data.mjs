#!/usr/bin/env node
/**
 * Copy exported public/data into dist/data (and Vercel static output when present).
 * Run after astro build, before dist verification scripts.
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureDistDataSynced } from './lib/dist-data-sync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

if (!existsSync(join(ROOT, 'dist'))) {
  console.log('  ℹ ensure-dist-data: no dist/ — skip');
  process.exit(0);
}

try {
  const { synced } = ensureDistDataSynced(ROOT);
  if (synced.length) {
    console.log(`  ✓ Synced public/data → ${synced.join(', ')}`);
  } else {
    console.log('  ✓ dist/data already complete');
  }
} catch (e) {
  console.error(`  ✗ ensure-dist-data failed: ${e.message}`);
  process.exit(1);
}
