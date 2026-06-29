# IPOFins / Finverse — project context

Update this file weekly. Include @CONTEXT.md at session start for accurate agent context.

## Current branch workflow

- **Never merge to `main` from agent sessions** — commit and push on the active feature branch only.
- Prod deploy: trigger **Build & Deploy** GitHub Action from the feature branch with force export when needed.

## Current sprint (Jun 2026)

- 1% Club: unified holder search + detail pages, XBRL 1% parse fix, ISIN/NSE/BSE identity
- Super investors: entity holdings, signals, conviction scores
- Branch: `fix/investor-search`

## Stack

- Astro 4.x (static, prerender by default)
- TypeScript strict, Node.js 22, Tailwind CSS v4
- PostgreSQL 16 on Neon — schema in `db/migrations/`
- Client data: exported to `public/data/` at build time (not committed)

## Schema reference

- Migrations: `db/migrations/001_initial_schema.sql` through `010_stock_shp_summary.sql`
- Verify: `node db/verify-schema.mjs`
- Uses `stock_id` on stocks, fund_holdings, entity_holdings, shareholding_pattern_holders

## Key materialized views

| View | Use |
|---|---|
| mv_smart_money_latest | Smart money signals — not raw fund_holdings |
| mv_entity_signal_latest | Super investor stock signals |
| mv_one_percent_club_latest | 1% Club top holders |
| mv_super_investor_latest | Super investor portfolio summary |
| mv_trending_entities | Trending entities |

Refresh: `npm run db:refresh-si-views` or `/refresh-mvs` command.

## Data pipelines

| Script | Purpose |
|---|---|
| npm run pipeline:daily | NAV + IPO daily |
| npm run pipeline:monthly | AMFI fund holdings |
| npm run pipeline:superinvestor | SHP / super investor ingestion |
| npm run db:compute-si:all | Recompute entity values + SI signals |
| npm run export:client-data | Export Neon to public/data |
| npm run validate:si-data | SI / 1% Club data quality checks |

## Known data quirks

- AMFI disclosures: available by ~15th of following month
- BSE SHP filings: within 21 days of quarter end
- XBRL 1.0 percentage values mis-parsed as 100% — fixed in shp-xbrl-parser.mjs + db:fix-shp-pct-100

## Decisions

- node:sqlite built into Node 22 — not better-sqlite3
- PAN: hash only if stored — DPDP compliance
- Parameterised SQL only — no string concatenation
- Holder detail URLs: /1-percent-club/holder/{slug}