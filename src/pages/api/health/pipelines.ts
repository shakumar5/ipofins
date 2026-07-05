import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

export const prerender = false;

const PIPELINES = [
  'superinvestor',
  'sast-sweep',
  'mf-holdings',
  'nav-daily',
  'ipo-sync',
  'ipo-subscription',
  'ipo-gmp',
  'ipo-performance',
  'daily-nav-ipo',
];

export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const sql = requireDb();
    const rows = await sql`
      SELECT DISTINCT ON (pipeline)
        pipeline, status, started_at, finished_at,
        rows_upserted, quality_gate, message
      FROM pipeline_runs
      WHERE pipeline = ANY(${PIPELINES})
      ORDER BY pipeline, started_at DESC
    `;

    const typed = rows as {
      pipeline: string;
      status: string;
      started_at: string;
      finished_at: string | null;
      rows_upserted: number | null;
      quality_gate: string | null;
      message: string | null;
    }[];

    const byPipeline = Object.fromEntries(typed.map((r) => [r.pipeline, r]));
    const staleThresholdMs = 48 * 60 * 60 * 1000;
    const now = Date.now();

    const summary = PIPELINES.map((name) => {
      const run = byPipeline[name];
      if (!run) return { pipeline: name, status: 'unknown', stale: true };
      const finished = run.finished_at ? new Date(run.finished_at + 'Z').getTime() : 0;
      return {
        pipeline: name,
        status: run.status,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        rowsUpserted: run.rows_upserted,
        qualityGate: run.quality_gate,
        message: run.message,
        stale: !finished || now - finished > staleThresholdMs,
      };
    });

    const healthy = summary.every((s) => s.status === 'success' && !s.stale);

    return new Response(
      JSON.stringify({ healthy, checkedAt: new Date().toISOString(), pipelines: summary }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
