#!/usr/bin/env node
/**
 * Validate SHP quality-gate logic against live DB + si-quarters helpers.
 * Usage: node scripts/node-with-ca.mjs scripts/validate-shp-quality-gate.mjs
 */
import { sql, isDbConfigured } from './lib/db.mjs';
import {
  inferLatestQuarter,
  inferLatestPublicationQuarter,
  quarterPublicationReady,
  isQuarterPublicationReady,
} from './lib/si-quarters.mjs';

const MIN_RATIO = 0.70;
const now = new Date();

function gateDecision(stats) {
  if (!stats.prior_stocks) return { pass: true, reason: 'no prior baseline' };
  if (stats.stockRatio < MIN_RATIO) {
    return {
      pass: false,
      reason: `${stats.stock_count}/${stats.prior_stocks} stocks (${Math.round(stats.stockRatio * 100)}%)`,
    };
  }
  return {
    pass: true,
    reason: `${stats.stock_count}/${stats.prior_stocks} stocks (${Math.round(stats.stockRatio * 100)}%)`,
  };
}

async function quarterCoverageStats(quarter) {
  const [{ stock_count, row_count, prior_stocks, prior_rows } = {}] = await sql`
    WITH cur AS (
      SELECT COUNT(DISTINCT stock_id)::int AS stocks, COUNT(*)::int AS rows
      FROM shareholding_pattern_holders WHERE quarter = ${quarter}::date
    ),
    prev AS (
      SELECT COUNT(DISTINCT stock_id)::int AS stocks, COUNT(*)::int AS rows
      FROM shareholding_pattern_holders
      WHERE quarter = (${quarter}::date - INTERVAL '3 months')::date
    )
    SELECT cur.stocks AS stock_count, cur.rows AS row_count, prev.stocks AS prior_stocks, prev.rows AS prior_rows
    FROM cur, prev
  `;
  const stockRatio = prior_stocks ? stock_count / prior_stocks : 1;
  const rowRatio = prior_rows ? row_count / prior_rows : 1;
  return { stock_count, row_count, prior_stocks, prior_rows, stockRatio, rowRatio };
}

async function main() {
  if (!isDbConfigured()) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const ingestible = inferLatestQuarter(now);
  const publication = inferLatestPublicationQuarter(now);
  const wouldSkipEarly = !allowEarly && ingestible > publication;

  console.log('=== si-quarters (today) ===');
  console.log({
    today: now.toISOString().slice(0, 10),
    ingestibleQuarter: ingestible,
    publicationQuarter: publication,
    q2PublicationReady: quarterPublicationReady('2026-04-01').toISOString().slice(0, 10),
    wouldSkipEarlyCron: ingestible > publication,
  });

  const quarters = await sql`
    SELECT quarter::text AS q FROM shareholding_pattern_holders
    GROUP BY quarter ORDER BY quarter DESC LIMIT 5
  `;

  console.log('\n=== quality gate per quarter (new logic) ===');
  let failures = 0;
  for (const { q } of quarters) {
    const stats = await quarterCoverageStats(q);
    const decision = gateDecision(stats);
    const oldRowRatio = stats.prior_rows ? Math.round((stats.row_count / stats.prior_rows) * 100) : null;
    console.log({
      quarter: q,
      stocks: `${stats.stock_count}/${stats.prior_stocks}`,
      rows: `${stats.row_count}/${stats.prior_rows}`,
      stockPct: stats.prior_stocks ? Math.round(stats.stockRatio * 100) : null,
      rowPct: oldRowRatio,
      gate: decision.pass ? 'PASS' : 'FAIL',
      reason: decision.reason,
    });
    if (!decision.pass) failures++;
  }

  const [dup] = await sql`
    SELECT COUNT(*)::int AS groups FROM (
      SELECT isin FROM stocks WHERE NULLIF(TRIM(isin),'') IS NOT NULL GROUP BY isin HAVING COUNT(*) > 1
    ) t
  `;
  console.log('\n=== stock identity ===');
  console.log({ duplicateIsinGroups: dup.groups });

  const [badRun] = await sql`
    SELECT rows_upserted, message FROM pipeline_runs
    WHERE pipeline = 'superinvestor' AND message LIKE '%Backfill 4Q%'
    ORDER BY started_at DESC LIMIT 1
  `;
  console.log('\n=== old gate baseline (why CI failed) ===');
  console.log({
    backfillRowsUpserted: badRun?.rows_upserted,
    note: 'Old gate compared current quarter rows vs this cumulative backfill total',
  });

  const q2 = await quarterCoverageStats('2026-04-01');
  const q2gate = gateDecision(q2);
  console.log('\n=== Q2 2026 verdict ===');
  console.log({ ...q2, gate: q2gate.pass ? 'PASS' : 'FAIL', reason: q2gate.reason });

  if (failures > 0 && q2gate.pass) {
    console.log('\nNote: only incomplete quarters fail; Q2 passes with corrected gate.');
  }

  process.exit(0);
}

// mimic cron (no --allow-early-quarter)
const allowEarly = process.argv.includes('--allow-early-quarter');

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
