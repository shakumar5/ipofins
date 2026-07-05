/**
 * IPOFins — Structured Pipeline Logger
 *
 * Outputs JSON-structured log lines to stdout so that CI/CD systems
 * (GitHub Actions, Vercel Build Logs) can parse, filter, and alert on them.
 *
 * Usage:
 *   import { createLogger } from './logger.mjs';
 *   const log = createLogger('pipeline:monthly');
 *   log.info('Starting MF holdings sync', { month: '2026-06' });
 *   log.success('Holdings upserted', { rows: 12400 });
 *   log.warn('Missing AMC', { amc: 'HDFC Mutual Fund' });
 *   log.error('DB write failed', { error: err.message });
 *
 * Output format (one JSON object per line — NDJSON):
 *   {"ts":"2026-07-05T10:30:00.000Z","level":"INFO","pipeline":"pipeline:monthly","msg":"Starting...","data":{}}
 */

const LEVELS = { DEBUG: 0, INFO: 1, SUCCESS: 2, WARN: 3, ERROR: 4 };

/**
 * Create a structured logger scoped to a pipeline name.
 * @param {string} pipelineName  e.g. 'pipeline:monthly', 'pipeline:superinvestor'
 * @param {{ minLevel?: keyof typeof LEVELS, pretty?: boolean }} [opts]
 */
export function createLogger(pipelineName, opts = {}) {
  const minLevel = LEVELS[opts.minLevel ?? 'INFO'] ?? LEVELS.INFO;
  const pretty = opts.pretty ?? (process.env.CI !== '1' && process.env.LOG_FORMAT !== 'json');

  function write(level, msg, data = {}) {
    if (LEVELS[level] < minLevel) return;

    if (pretty) {
      // Human-friendly console output for local development
      const ts = new Date().toISOString().slice(11, 19);
      const icons = { DEBUG: '·', INFO: '→', SUCCESS: '✓', WARN: '⚠', ERROR: '✗' };
      const icon = icons[level] ?? ' ';
      const extra = Object.keys(data).length
        ? ' ' + Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
        : '';
      console.log(`  [${ts}] ${icon} ${msg}${extra}`);
    } else {
      // JSON output for CI/CD log parsers
      process.stdout.write(
        JSON.stringify({
          ts: new Date().toISOString(),
          level,
          pipeline: pipelineName,
          msg,
          ...(Object.keys(data).length ? { data } : {}),
        }) + '\n',
      );
    }
  }

  return {
    debug: (msg, data) => write('DEBUG', msg, data),
    info:  (msg, data) => write('INFO',  msg, data),
    success: (msg, data) => write('SUCCESS', msg, data),
    warn:  (msg, data) => write('WARN',  msg, data),
    error: (msg, data) => write('ERROR', msg, data),

    /** Log elapsed time since a start Date. */
    timing(label, startDate, data = {}) {
      const ms = Date.now() - startDate.getTime();
      write('INFO', `${label} completed`, { ...data, elapsed_ms: ms, elapsed_s: (ms / 1000).toFixed(1) });
    },

    /** Wrap an async step with structured start/end/error logging. */
    async step(label, fn) {
      write('INFO', `${label} — starting`);
      const t = Date.now();
      try {
        const result = await fn();
        write('SUCCESS', `${label} — done`, { elapsed_ms: Date.now() - t });
        return result;
      } catch (err) {
        write('ERROR', `${label} — failed`, { error: err?.message ?? String(err), elapsed_ms: Date.now() - t });
        throw err;
      }
    },
  };
}

/** Singleton convenience logger for quick scripts. */
export const log = createLogger('pipeline');
