#!/usr/bin/env node
/**
 * Local smoke check for fund-overlap navigation, then start Astro dev.
 * Uses exported JSON in public/data/ — no database required.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const overlapIndexPath = join(root, 'public', 'data', 'fund-overlap-index.json');
const aliasesPath = join(root, 'public', 'data', 'fund-holdings-aliases.json');

if (!existsSync(overlapIndexPath)) {
  console.error('Missing public/data/fund-overlap-index.json');
  console.error('Run: npm run dev:sync   (needs DB) or copy prod export into public/data/');
  process.exit(1);
}

const index = JSON.parse(readFileSync(overlapIndexPath, 'utf-8'));
const aliases = existsSync(aliasesPath)
  ? JSON.parse(readFileSync(aliasesPath, 'utf-8'))
  : {};

const sample = index.find((f) => String(f.name).includes('360 ONE Focused'));
if (!sample) {
  console.warn('  ⚠ 360 ONE Focused Fund not in overlap index — pick any fund from /mutual-funds/fund-overlap');
} else {
  const listable = Object.entries(aliases).find(([, canonical]) => canonical === sample.slug)?.[0];
  const urls = [
    `http://localhost:4321/mutual-funds/fund-overlap/${sample.slug}?from=fund-overlap`,
  ];
  if (listable && listable !== sample.slug) {
    urls.push(`http://localhost:4321/mutual-funds/fund-overlap/${listable}?from=fund-overlap`);
  }
  console.log('Fund overlap nav test URLs (after dev starts):');
  for (const url of urls) console.log(`  ${url}`);
  console.log('Flow: View holdings → fund page → Back to overlap (no blank flash).');
}

console.log('\nStarting Astro dev on http://localhost:4321 …\n');

const child = spawn(process.execPath, ['scripts/run-astro.mjs', 'dev'], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
