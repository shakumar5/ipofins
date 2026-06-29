# Refresh materialized views

Run on **staging** unless the user explicitly requests prod.

```bash
npm run db:refresh-si-views
```

Also refresh smart-money MVs (includes `mv_smart_money_latest`) via SQL on staging:

```bash
node scripts/node-with-ca.mjs -e "import { sql } from './scripts/lib/db.mjs'; await sql`SELECT refresh_all_views()`; console.log('refresh_all_views done');"
```

If the one-liner fails, run `SELECT refresh_all_views();` in the Neon SQL editor after monthly MF load.
