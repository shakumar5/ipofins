# Cursor automation drafts (create via /automate in Agents Window)

## 1. Nightly SI validation (staging)

- **Trigger:** Schedule (weeknights IST)
- **Action:** Run `npm run validate:si-data` on staging; open GitHub issue if failures.

## 2. Post-merge export reminder

- **Trigger:** Git push to `feature/*`
- **Action:** Comment on PR reminding to run `npm run db:refresh-si-views` after SHP pipeline changes.

## 3. Pipeline failure triage

- **Trigger:** Manual or CI failure webhook
- **Action:** Invoke `pipeline-debugger` subagent with last `ingestion_runs` error payload.
