#!/usr/bin/env node
/**
 * Fail build if built HTML still references SVG og:image / twitter:image.
 * Run after: npx astro build
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

const REQUIRED_PNGS = ['og-default.png', 'og-ipo.png', 'og-fund.png'];
const SVG_OG_PATTERN = /content="https?:\/\/[^"]*\/og-[^"]+\.svg"/i;

let errors = [];

for (const name of REQUIRED_PNGS) {
  const path = join(PUBLIC, name);
  if (!existsSync(path)) {
    errors.push(`Missing ${name} — run node scripts/generate-og-images.mjs`);
  }
}

if (existsSync(DIST)) {
  const htmlFiles = [];
  function walk(dir, depth = 0) {
    if (depth > 5 || htmlFiles.length > 200) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name.endsWith('.html')) htmlFiles.push(p);
      else if (existsSync(p) && !name.includes('.')) walk(p, depth + 1);
    }
  }
  walk(DIST);

  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    if (SVG_OG_PATTERN.test(html)) {
      errors.push(`SVG og:image in ${file.replace(ROOT, '')}`);
    }
  }
}

if (errors.length) {
  console.error('\n  OG image verification FAILED:\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

console.log('  ✓ OG PNG assets present; built HTML uses PNG social images');
