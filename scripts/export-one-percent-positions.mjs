#!/usr/bin/env node
/** Export /data/one-percent-holder-positions.json for 1% Club name search. */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildHolderPositionsRecord } from './lib/holder-positions-export.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'one-percent-holder-positions.json');

const record = await buildHolderPositionsRecord();
mkdirSync(join(ROOT, 'public', 'data'), { recursive: true });
writeFileSync(OUT, JSON.stringify(record));
console.log(`Wrote ${Object.keys(record).length} holder keys -> ${OUT}`);
