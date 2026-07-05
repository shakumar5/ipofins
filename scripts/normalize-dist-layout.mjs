#!/usr/bin/env node
/**
 * Astro 6 + @astrojs/vercel can leave prerendered pages under dist/client/ while
 * sitemaps and postbuild scripts expect dist/{path}/index.html. Hoist to dist root
 * so verify-sitemaps, reorganize-sitemaps, and `cp dist/*` deploy match production.
 */
import { cpSync, existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const NESTED = join(DIST, 'client');

function hoistNestedClientDir() {
  if (!existsSync(DIST) || existsSync(join(DIST, 'index.html'))) return false;
  if (!existsSync(join(NESTED, 'index.html'))) return false;

  for (const name of readdirSync(NESTED)) {
    const src = join(NESTED, name);
    const dest = join(DIST, name);
    // dist/data is synced from public/data in ensure-dist-data — keep that canonical.
    if (name === 'data' && existsSync(dest)) continue;
    if (existsSync(dest)) {
      cpSync(src, dest, { recursive: true, force: true });
    } else {
      renameSync(src, dest);
    }
  }

  rmSync(NESTED, { recursive: true, force: true });
  return true;
}

if (hoistNestedClientDir()) {
  console.log('  ✓ normalized dist/: hoisted dist/client/ → dist/');
}
