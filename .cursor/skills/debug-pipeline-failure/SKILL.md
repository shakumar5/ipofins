---
name: debug-pipeline-failure
description: Systematically debug scripts/pipeline failures (ingestion_runs, logs, staging DB).
disable-model-invocation: true
---

# Debug pipeline failure

1. Identify script from `package.json` (`pipeline:*`, `db:*`).
2. Check `ingestion_runs` / `data_quality_issues` in Neon staging.
3. Re-run with `node scripts/node-with-ca.mjs <script>` and capture stderr.
4. Never run destructive pipelines against prod (`.env.prod-backup`).
5. For SI: `npm run validate:si-pipeline` and `npm run validate:si-data`.
6. Invoke subagent `pipeline-debugger` for deep dives.
