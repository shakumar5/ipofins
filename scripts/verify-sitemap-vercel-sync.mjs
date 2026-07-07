#!/usr/bin/env node
/**
 * Local proof: Astro sitemap-0.xml in .vercel/output/static is removed after reorganize sync.
 * No full Astro build required — simulates CI prebuilt deploy layout.
 *
 * Run: npm run test:sitemap-vercel-sync
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CANONICAL_SITEMAP_INDEX,
  isAstroDefaultSitemapFile,
  removeAstroDefaultSitemapFiles,
  syncGcsSitemapsToVercelStatic,
  writeSitemapIndexSync,
  writeUrlsetSync,
} from './lib/sitemap-utils.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'sitemap-sync-test-'));
const dist = join(tmp, 'dist');
const vercelStatic = join(tmp, '.vercel', 'output', 'static');
mkdirSync(dist, { recursive: true });
mkdirSync(vercelStatic, { recursive: true });

writeFileSync(
  join(dist, 'sitemap-0.xml'),
  '<?xml version="1.0"?><urlset><url><loc>https://ipofins.com/ipo/foo/</loc></url></urlset>',
);
writeFileSync(
  join(vercelStatic, 'sitemap-0.xml'),
  '<?xml version="1.0"?><urlset><url><loc>https://ipofins.com/ipo/foo/</loc></url></urlset>',
);
writeFileSync(
  join(vercelStatic, 'sitemap-0-0.xml'),
  '<?xml version="1.0"?><urlset><url><loc>https://ipofins.com/tools/</loc></url></urlset>',
);

const bucketUrls = ['https://ipofins.com/', 'https://ipofins.com/ipo'];
writeUrlsetSync(writeFileSync, join(dist, 'sitemap-ipos.xml'), bucketUrls);
const indexChildren = CANONICAL_SITEMAP_INDEX.filter((n) => n !== 'sitemap-portfolio-overlap.xml');
writeSitemapIndexSync(writeFileSync, join(dist, 'sitemap-index.xml'), indexChildren, '2026-07-07');
removeAstroDefaultSitemapFiles(dist);

assert.equal(existsSync(join(dist, 'sitemap-0.xml')), false, 'dist should drop sitemap-0.xml');
assert.equal(existsSync(join(dist, 'sitemap-index.xml')), true, 'dist should have sitemap-index.xml');
assert.equal(existsSync(join(vercelStatic, 'sitemap-0.xml')), true);
assert.equal(existsSync(join(vercelStatic, 'sitemap-0-0.xml')), true);
assert.equal(existsSync(join(vercelStatic, 'sitemap-index.xml')), false);

const { synced, removed } = syncGcsSitemapsToVercelStatic(tmp, { distDir: dist });

console.log('verify-sitemap-vercel-sync.mjs');
console.log(`  synced to .vercel/output/static: ${synced.join(', ')}`);
console.log(`  removed Astro defaults from .vercel/output/static: ${removed}`);

assert.ok(synced.includes('sitemap-index.xml'));
assert.ok(removed >= 2, `expected >= 2 Astro files removed, got ${removed}`);
assert.equal(existsSync(join(vercelStatic, 'sitemap-0.xml')), false, 'sitemap-0.xml must be gone');
assert.equal(existsSync(join(vercelStatic, 'sitemap-0-0.xml')), false, 'sitemap-0-0.xml must be gone');
assert.equal(existsSync(join(vercelStatic, 'sitemap-index.xml')), true, 'sitemap-index.xml must exist');
assert.equal(existsSync(join(vercelStatic, 'sitemap-ipos.xml')), true, 'bucket sitemap must exist');

const leaked = readdirSync(vercelStatic).filter(isAstroDefaultSitemapFile);
assert.deepEqual(leaked, [], `no Astro default sitemaps left: ${leaked.join(', ')}`);

rmSync(tmp, { recursive: true, force: true });
console.log('  ✓ PASS — Vercel static sync removes sitemap-0.xml and ships sitemap-index.xml');
