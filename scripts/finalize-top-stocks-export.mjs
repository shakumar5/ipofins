#!/usr/bin/env node
/**
 * Export top-stocks.json when full client export was skipped or cache lacks the file.
 * Run: node scripts/finalize-top-stocks-export.mjs
 */
import { finalizeTopStocksExport } from './lib/finalize-top-stocks-export.mjs';

await finalizeTopStocksExport();