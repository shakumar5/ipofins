#!/usr/bin/env node
/**
 * Fail CI/build when source files are UTF-16 (breaks Astro + TypeScript).
 * Usage:
 *   node scripts/verify-source-encoding.mjs
 *   node scripts/verify-source-encoding.mjs --fix
 */
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import {
  inspectFileEncoding,
  isTextSourcePath,
  repairFileToUtf8,
} from './lib/source-encoding.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FIX = process.argv.includes('--fix');

const SCAN_ROOTS = ['src', 'scripts', 'db', '.cursor/hooks', '.cursor/rules'];

const SKIP_FILE_RE = /(^|\/)(tmp-|_w\.py$)/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (isTextSourcePath(full) && !SKIP_FILE_RE.test(full.replace(/\\/g, '/'))) {
      out.push(full);
    }
  }
  return out;
}

const broken = [];
const repaired = [];

for (const relRoot of SCAN_ROOTS) {
  const abs = join(ROOT, relRoot);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of walk(abs)) {
    const info = inspectFileEncoding(file);
    if (!info.broken) continue;
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (FIX) {
      const result = repairFileToUtf8(file);
      if (result.repaired) repaired.push({ rel, encoding: result.encoding });
    } else {
      broken.push({ rel, encoding: info.encoding });
    }
  }
}

if (FIX && repaired.length) {
  console.log(`  Repaired ${repaired.length} file(s) to UTF-8:`);
  for (const { rel, encoding } of repaired) {
    console.log(`  ✓ ${rel} (was ${encoding})`);
  }
}

if (!FIX && broken.length) {
  console.error('\n  Source encoding verification FAILED:\n');
  console.error('  These files are UTF-16 (or otherwise not UTF-8). Astro/TS cannot parse them.\n');
  for (const { rel, encoding } of broken) {
    console.error(`  ✗ ${rel} (${encoding})`);
  }
  console.error('\n  Root cause: on Windows, some editors/agents write UTF-16 LE instead of UTF-8.');
  console.error('  Fix locally:  npm run verify:encoding -- --fix');
  console.error('  Then commit the repaired UTF-8 files.\n');
  process.exit(1);
}

if (FIX && !repaired.length && !broken.length) {
  console.log('  All scanned source files are UTF-8.');
}
