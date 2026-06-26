#!/usr/bin/env node
/**
 * Refresh Super Investor Materialized Views
 *
 * Convenience script to call refresh_super_investor_views() after any
 * manual data manipulation. The automated pipelines call this via
 * compute-super-investor-signals.mjs, but this script exists for ad-hoc use.
 *
 * Usage: node scripts/node-with-ca.mjs db/refresh-super-investor-views.mjs
 */

import { sql, isDbConfigured } from '../scripts/lib/db.mjs';

async function main() {
  if (!isDbConfigured()) {
    console.error('❌ DATABASE_URL not configured.');
    process.exit(1);
  }

  console.log('Refreshing super-investor materialized views...');
  try {
    await sql`SELECT refresh_super_investor_views()`;
    console.log('✅ All super-investor views refreshed.');
  } catch (err) {
    console.error('❌ Refresh failed (migration 006 may not be applied):', err.message);
    process.exit(1);
  }
}

main();
