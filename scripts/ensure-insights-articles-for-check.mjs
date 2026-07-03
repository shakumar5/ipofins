#!/usr/bin/env node
/**
 * Astro check imports learn-articles.ts -> insights-articles.generated.json.
 * That file is generated at build time; ensure it exists before `npm run check` on CI.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'data', 'insights-articles.generated.json');
const DATA_MARKER = join(ROOT, 'public', 'data', 'smart-money-tracker-index.json');

function writeEmptyStub() {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, '[]\n', 'utf8');
  console.log('  insights-articles.generated.json - wrote empty stub for typecheck');
}

if (existsSync(OUT)) {
  process.exit(0);
}

if (existsSync(DATA_MARKER)) {
  const gen = spawnSync(process.execPath, [join(ROOT, 'scripts', 'generate-insights-articles.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if ((gen.status ?? 1) === 0 && existsSync(OUT)) {
    console.log('  insights-articles.generated.json - generated for typecheck');
    process.exit(0);
  }
  console.warn('  insights generation failed before typecheck - using empty stub');
}

writeEmptyStub();
