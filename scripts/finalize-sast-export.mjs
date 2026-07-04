#!/usr/bin/env node
/**
 * Ensure public/data/sast-updates*.json exist when the export cache dropped them.
 * Preserves an existing valid feed; otherwise rebuilds from the sast_filings table.
 * Run: node scripts/finalize-sast-export.mjs
 */
import { finalizeSastExport } from './lib/finalize-sast-export.mjs';

await finalizeSastExport();
