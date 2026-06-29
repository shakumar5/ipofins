---
name: scaffold-postgres-migration
description: Scaffold a new PostgreSQL migration in db/migrations with IPOFins conventions (TIMESTAMPTZ, NUMERIC, stock_id).
---

# Scaffold Postgres migration

1. Name: `db/migrations/NNN_short_snake_case.sql` (next sequence number).
2. Use `TIMESTAMPTZ` for all timestamps; `NUMERIC` for money.
3. Reference `stocks(id)` as `stock_id` — never `security_id`.
4. Avoid `SELECT *` in views; name columns explicitly.
5. Add indexes for FKs and filter columns used in pipelines.
6. After authoring: `node scripts/validate-migration.mjs db/migrations/NNN_....sql`
7. Apply (staging only): `node scripts/node-with-ca.mjs scripts/apply-migration.mjs db/migrations/NNN_....sql`
8. Run `node db/verify-schema.mjs`.
