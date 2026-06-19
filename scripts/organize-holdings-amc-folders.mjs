#!/usr/bin/env node
/**
 * Organize AMC holdings into subfolders.
 * Supports both `tata/` and `tata_/` naming — filenames inside can be anything.
 */
import { mkdirSync, readdirSync, renameSync, statSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

const HOLDINGS = process.env.HOLDINGS_INPUT_DIR || 'C:/Users/shaik/Downloads/Holdings';

const README = `AMC holdings folder
==================

Put ANY .xlsx/.xls here — filename does not matter.
Parser reads fund name + month from inside the Excel file.

Optional month subfolders: april-2026/, may-2026/
`;

const AMC_PREFIXES = [
  { folder: 'groww_', alt: 'groww', match: (n) => /groww/i.test(n) },
  { folder: 'tata_', alt: 'tata', match: (n) => /^tata_/i.test(n) || /tata.*portfolio/i.test(n) },
  { folder: 'quant_', alt: 'quant', match: (n) => /^quant_/i.test(n) },
  { folder: 'sundaram_', alt: 'sundaram', match: (n) => /^sundaram_/i.test(n) },
  { folder: 'bandhan_', alt: 'bandhan', match: (n) => /^bandhan\s/i.test(n) },
];

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function monthFolder(monthKey) {
  return monthKey === 'april' ? 'april-2026' : monthKey === 'may' ? 'may-2026' : `${monthKey}-2026`;
}

function writeReadme(dir) {
  const p = join(dir, 'README.txt');
  if (!existsSync(p)) writeFileSync(p, README, 'utf8');
}

function organizeInvesco() {
  const invescoRoot = join(HOLDINGS, 'invesco');
  ensureDir(join(invescoRoot, 'april-2026'));
  ensureDir(join(invescoRoot, 'may-2026'));
  writeReadme(invescoRoot);
  const moved = [];
  for (const src of [HOLDINGS, invescoRoot]) {
    if (!existsSync(src)) continue;
    for (const name of readdirSync(src)) {
      if (!/\.xlsx?$/i.test(name)) continue;
      const full = join(src, name);
      if (!statSync(full).isFile()) continue;
      if (!/invesco/i.test(name) && src !== invescoRoot) continue;
      let month = name.match(/_(april|may)_\d{4}_/i)?.[1]?.toLowerCase();
      if (!month && /april|apr/i.test(name)) month = 'april';
      if (!month && /may/i.test(name)) month = 'may';
      const destDir = join(invescoRoot, month ? monthFolder(month) : 'may-2026');
      const dest = join(destDir, name);
      if (full === dest) continue;
      if (existsSync(dest)) { if (src === HOLDINGS) unlinkSync(full); continue; }
      ensureDir(destDir);
      renameSync(full, dest);
      moved.push({ name, to: destDir });
    }
  }
  return moved;
}

function organizeMirae() {
  const miraeDir = join(HOLDINGS, 'mirae');
  ensureDir(miraeDir);
  writeReadme(miraeDir);
  const moved = [];
  for (const name of readdirSync(HOLDINGS)) {
    if (!/\.xlsx?$/i.test(name)) continue;
    const full = join(HOLDINGS, name);
    if (!statSync(full).isFile()) continue;
    if (!/^ma[a-z]{3,4}-/i.test(name) && !/mirae/i.test(name)) continue;
    const dest = join(miraeDir, name);
    if (existsSync(dest)) { unlinkSync(full); continue; }
    renameSync(full, dest);
    moved.push({ name, to: miraeDir });
  }
  return moved;
}

function organizePrefixedAmc() {
  const moved = [];
  for (const { folder, alt, match } of AMC_PREFIXES) {
    const dir = join(HOLDINGS, folder);
    const altDir = join(HOLDINGS, alt);
    ensureDir(dir);
    writeReadme(dir);
    if (existsSync(altDir) && altDir !== dir) {
      for (const name of readdirSync(altDir)) {
        if (!/\.xlsx?$/i.test(name)) continue;
        const full = join(altDir, name);
        if (!statSync(full).isFile()) continue;
        const dest = join(dir, name);
        if (existsSync(dest)) continue;
        renameSync(full, dest);
        moved.push({ name, to: dir });
      }
    }
    for (const name of readdirSync(HOLDINGS)) {
      if (!/\.xlsx?$/i.test(name)) continue;
      if (!match(name)) continue;
      const full = join(HOLDINGS, name);
      if (!statSync(full).isFile()) continue;
      const dest = join(dir, name);
      if (existsSync(dest)) { unlinkSync(full); continue; }
      renameSync(full, dest);
      moved.push({ name, to: dir });
    }
  }
  return moved;
}

const invescoMoved = organizeInvesco();
const miraeMoved = organizeMirae();
const prefixedMoved = organizePrefixedAmc();

console.log('Holdings AMC folder organization');
console.log('  Invesco:', invescoMoved.length);
console.log('  Mirae:', miraeMoved.length);
console.log('  Prefixed AMC (tata_, quant_, groww_, …):', prefixedMoved.length);
for (const m of prefixedMoved) console.log('   ', m.name, '→', m.to);
