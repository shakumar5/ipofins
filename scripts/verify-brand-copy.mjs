#!/usr/bin/env node
/**
 * Fail build if visible/meta brand copy regresses to lowercase or split "F ipofins".
 * Run after: npx astro build
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const BAD_PATTERNS = [
  // Case-sensitive: must match literal lowercase "ipofins", not canonical "IPOFins".
  { re: /<title>[^<]*\| ipofins/, msg: '<title> uses lowercase "| ipofins"' },
  { re: /© 2026 ipofins/, msg: 'Footer copyright uses lowercase "ipofins"' },
  { re: /About ipofins/, msg: 'About page uses lowercase "About ipofins"' },
  { re: /property="og:site_name" content="ipofins"/, msg: 'og:site_name is lowercase' },
  { re: /name="author" content="ipofins"/, msg: 'meta author is lowercase' },
  { re: /<span class="text-white font-bold text-sm">F<\/span>\s*\n\s*<span[^>]*>\s*ipofins/, msg: 'Header logo reads as "F ipofins"' },
];

let errors = [];

if (existsSync(DIST)) {
  const htmlFiles = [];
  function walk(dir, depth = 0) {
    if (depth > 5 || htmlFiles.length > 300) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name.endsWith('.html')) htmlFiles.push(p);
      else if (existsSync(p) && !name.includes('.')) walk(p, depth + 1);
    }
  }
  walk(DIST);

  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    for (const { re, msg } of BAD_PATTERNS) {
      if (re.test(html)) {
        errors.push(`${file.replace(ROOT, '')}: ${msg}`);
      }
    }
  }
}

if (errors.length) {
  console.error('\n  Brand copy verification FAILED:\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

console.log('  ✓ Brand copy verification passed (IPOFins standardized)');
