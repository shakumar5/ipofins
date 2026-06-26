/**
 * Pipeline Run Logger — quality gates + pipeline_runs table writer.
 *
 * Every pipeline (superinvestor, sast-sweep, pms, altfunds) calls startRun() at
 * the top and endRun() at the end. The logger:
 *   1. Inserts a row into pipeline_runs for the /health dashboard.
 *   2. Runs optional quality gates (row-count delta checks).
 *   3. Returns a result object with status + diagnostic info.
 *
 * Quality gates auto-abort the run if data looks wrong. The site keeps serving
 * last-known-good data; the next scheduled run self-heals.
 */

import { sql } from './db.mjs';

/**
 * Start a pipeline run — inserts a row into pipeline_runs with status='running'.
 *
 * @param {string} pipeline  — pipeline identifier (e.g. 'superinvestor', 'sast-sweep')
 * @param {Object} opts
 * @param {string} [opts.quarter] — quarter DATE string, NULL for weekly sweeps
 * @returns {{ runId: number, startedAt: Date, log: (msg: string) => void }}
 */
export async function startRun(pipeline, opts = {}) {
  if (!sql) {
    return { runId: 0, startedAt: new Date(), log: () => {}, _noDb: true };
  }
  const rows = await sql`
    INSERT INTO pipeline_runs (pipeline, quarter, status, started_at, quality_gate)
    VALUES (${pipeline}, ${opts.quarter || null}, 'running', NOW(), 'pending')
    RETURNING id, started_at
  `;
  const run = rows[0];
  return {
    runId: run.id,
    startedAt: new Date(run.started_at + 'Z'),
    log(msg) {
      const ts = new Date().toISOString().slice(11, 19);
      console.log(`    [${ts}] ${msg}`);
    },
  };
}

/**
 * End a pipeline run — update pipeline_runs row with final status + diagnostics.
 *
 * @param {Object} ctx  — context returned by startRun()
 * @param {Object} opts
 * @param {string} opts.status  — 'success' | 'aborted' | 'failed'
 * @param {number} [opts.rowsUpserted]  — total rows written
 * @param {string} [opts.qualityGate]  — 'passed' | 'failed' | 'skipped'
 * @param {string} [opts.message]  — human-readable summary
 * @param {Object} [opts.counts]  — counts JSON for the /health trend chart
 */
export async function endRun(ctx, opts) {
  if (!sql || ctx._noDb) return;
  await sql`
    UPDATE pipeline_runs
    SET status        = ${opts.status},
        finished_at   = NOW(),
        rows_upserted = ${opts.rowsUpserted ?? 0},
        quality_gate  = ${opts.qualityGate ?? 'skipped'},
        message       = ${opts.message ?? null},
        counts_json   = ${opts.counts ? JSON.stringify(opts.counts) : null}
    WHERE id = ${ctx.runId}
  `;
}

/**
 * Quality gate: row-count delta check.
 *
 * Compares the current run's upserted rows against the prior run for the same
 * pipeline. Aborts (returns { pass: false }) if the ratio falls below minRatio.
 *
 * @param {Object} ctx  — context from startRun()
 * @param {Object} opts
 * @param {number} opts.currentRows  — rows upserted this run
 * @param {number} [opts.minRatio=0.70]  — minimum ratio (0.7 = 70% of prior)
 * @param {string} [opts.pipeline]  — override pipeline name for comparison
 * @returns {{ pass: boolean, priorRows: number, ratio: number, reason: string|null }}
 */
export async function qualityGateRowCount(ctx, opts) {
  if (!sql || ctx._noDb) return { pass: true, priorRows: 0, ratio: 1, reason: null };

  const pipelineName = opts.pipeline || ctx._pipeline;
  const minRatio = opts.minRatio ?? 0.70;

  // Look up the most recent SUCCESSFUL run for this pipeline.
  const [prior] = await sql`
    SELECT rows_upserted
    FROM pipeline_runs
    WHERE pipeline = ${pipelineName}
      AND status = 'success'
      AND quality_gate = 'passed'
      AND rows_upserted > 0
    ORDER BY started_at DESC
    LIMIT 1
  `;

  if (!prior || !prior.rows_upserted) {
    // First ever successful run — no baseline to compare against.
    return { pass: true, priorRows: 0, ratio: 1, reason: 'first-run' };
  }

  const priorRows = Number(prior.rows_upserted);
  const ratio = opts.currentRows / priorRows;

  if (ratio < minRatio) {
    return {
      pass: false,
      priorRows,
      ratio: Math.round(ratio * 1000) / 1000,
      reason: `Row count ${opts.currentRows} is only ${Math.round(ratio * 100)}% of prior ${priorRows} (minimum ${Math.round(minRatio * 100)}%)`,
    };
  }

  return { pass: true, priorRows, ratio: Math.round(ratio * 1000) / 1000, reason: null };
}

/**
 * Fetch the latest successful run info for a pipeline (for /health dashboard).
 */
export async function getLatestRun(pipeline) {
  if (!sql) return null;
  const rows = await sql`
    SELECT id, pipeline, quarter, status, started_at, finished_at,
           rows_upserted, quality_gate, message, counts_json
    FROM pipeline_runs
    WHERE pipeline = ${pipeline}
    ORDER BY started_at DESC
    LIMIT 1
  `;
  return rows[0] || null;
}
