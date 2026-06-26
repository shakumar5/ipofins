#!/usr/bin/env node
/**
 * Merge duplicate IPO rows in Neon (same company, different slugs).
 * Safe to run on prod — reassigns subscriptions/GMP/performance, deletes orphan row.
 *
 *   node scripts/node-with-ca.mjs db/seed/dedupe-ipo-duplicates.mjs
 */
import { dedupeIPODuplicatesInDb } from '../../scripts/lib/db-writers.mjs';

const removed = await dedupeIPODuplicatesInDb();
console.log(removed ? `\nDone — merged ${removed} duplicate(s).` : '\nNo duplicate IPO rows found.');
