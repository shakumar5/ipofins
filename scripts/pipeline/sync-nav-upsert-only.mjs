#!/usr/bin/env node
/** Re-run AMFI upsert only (no returns computation). */
import { fetchAMFINAVs } from '../lib/authorized-sources.mjs';
import { requireDb, upsertFundsFromAMFI } from '../lib/db-writers.mjs';

requireDb();
const funds = await fetchAMFINAVs();
await upsertFundsFromAMFI(funds);
console.log('Done');
