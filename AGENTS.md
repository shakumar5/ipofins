# AGENTS.md

## Cursor Cloud specific instructions

IPOFins is a single Astro static site (Node 22, `output: 'static'`, React islands, Tailwind v4). Standard commands live in `package.json` scripts; setup and data flow are documented in `README`-style files (`CONTEXT.md`, `DATA_PIPELINE.md`, `db/README.md`) and `.cursor/rules/`. Notes below cover only non-obvious caveats.

### Services and how to run them
- Dev server: `npm run dev` (serves at `http://localhost:4321`). Type/lint check: `npm run check` (runs `astro check`; DB not required). Both work without a database.
- There is no separate backend — Astro pages query Neon Postgres directly at build/dev time via `src/lib/db.ts` (`requireDb()`), and large payloads are pre-exported to `public/data/*.json`.

### DATABASE_URL is the one hard dependency (often absent here)
- Most data-backed pages (`/`, `/ipo/*`, `/mutual-funds/*`, `/super-investors/*`, `/1-percent-club/*`, `/top-stocks/*`, `/broker/*`) call `requireDb()` and will return **HTTP 500** with `DATABASE_URL is not set` when no Neon connection string is configured. This is expected, not a code bug.
- The pure client-side `/tools/*` calculators (SIP, SWP, EMI, tax, PPF, NPS, retirement, CAGR, etc.) and static content pages render fully **without** a database — use these to verify the dev environment when no DB is available.
- `npm run build`, `npm run build:fast`, and `npm run db:verify` all require a reachable, populated `DATABASE_URL`; they cannot complete without it. To enable DB-backed pages and full builds, add a Neon `DATABASE_URL` secret (see `.env.example`). `db:migrate-si` + `db:seed*` + `db:compute-*` populate a fresh DB.

### Misc
- On Linux the `scripts/node-with-ca.mjs` wrapper (Windows-only `--use-system-ca` shim) is a harmless passthrough; `pipeline:*`/`db:*` scripts still need `DATABASE_URL`.
- Never merge to `main` from agent sessions (see `.cursor/rules/git-workflow.mdc`).
