#!/usr/bin/env node
import { sql } from '../../scripts/lib/db.mjs';
import { requireDb } from '../../scripts/lib/db-writers.mjs';
import { backfillMarketCapCategory } from '../../scripts/lib/backfill-market-cap-category.mjs';

await requireDb();

console.log('Backfilling market_cap_category...');
const result = await backfillMarketCapCategory(sql);
console.log('  updated', result.updated, 'stocks', result);
