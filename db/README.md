# Finverse Database — Neon PostgreSQL

## Quick Setup

### 1. Create Neon Project
1. Go to [https://console.neon.tech](https://console.neon.tech)
2. Create a new project (name: `finverse`)
3. Copy the connection string

### 2. Configure Environment
```bash
# Create .env in project root
echo "DATABASE_URL=postgresql://username:password@ep-xxxx.region.aws.neon.tech/finverse?sslmode=require" > .env
```

### 3. Run Migrations (in order)
```bash
# Option A: Using psql
# Core schema (IPOs, MFs, stocks, holdings, signals):
psql $DATABASE_URL -f db/migrations/001_initial_schema.sql
psql $DATABASE_URL -f db/migrations/002_indexes.sql
psql $DATABASE_URL -f db/migrations/003_materialized_views.sql
psql $DATABASE_URL -f db/migrations/004_fund_portfolio_stats.sql
# Super Investors / 1% Club / PMS / Alternative Funds (additive, optional):
psql $DATABASE_URL -f db/migrations/005_super_investors.sql
psql $DATABASE_URL -f db/migrations/006_super_investor_views.sql

# Option B: Copy-paste into Neon SQL Editor (console.neon.tech → SQL Editor)
```

> Migrations 005/006 are **additive** — they add the `tracked_entities` family of
> tables for `/super-investors`, `/1-percent-club`, `/pms`, `/alternative-funds`
> without altering any existing table. Safe to apply or skip independently of the
> core schema. See `DATA_PIPELINE.md` → "Super Investors …" for the data model.

### 4. Seed from Existing JSON
```bash
npm run db:seed                 # core IPO/MF data from src/data/*.json
# Super-investor / PMS / AIF / SIF rosters (after migration 005):
npm run db:seed-superinvestors  # idempotent — re-run after editing the JSON rosters
```

### 5. Compute Smart Money Signals
```bash
# Mutual-fund smart money:
npm run db:compute-signals    # Holdings changes + stock signals
npm run db:compute-overlaps   # Fund overlap scores
# OR both:
npm run db:compute-all

# Super-investor / PMS / AIF / SIF (after pipeline:superinvestor etc.):
npm run db:compute-si         # entity_changes, entity_stock_signals,
                              # entity_quarterly_stats, entity_overlaps,
                              # entity_conviction + view refresh
npm run db:refresh-si-views   # materialized-view refresh only (cheap, idempotent)
```

## Database Structure

```
┌───────────────┐     ┌─────────────────┐     ┌──────────────┐
│     amcs      │────▶│     funds       │────▶│  fund_navs   │
│               │     │                 │     │  (daily)     │
└───────────────┘     │                 │     └──────────────┘
                      │                 │────▶│ fund_returns │
                      └────────┬────────┘     └──────────────┘
                               │
                      ┌────────▼────────┐
                      │ fund_holdings   │  (monthly snapshots)
                      └────────┬────────┘
                               │
                      ┌────────▼────────┐
                      │holdings_changes │  (computed diffs)
                      └────────┬────────┘
                               │
                      ┌────────▼────────┐
                      │ stock_signals   │  (aggregated per stock per category)
                      └─────────────────┘

┌───────────────┐     ┌─────────────────┐
│    stocks     │────▶│    sectors      │
└───────┬───────┘     └─────────────────┘
        │
        └──────────── sector_allocations (monthly rotation data)

┌───────────────┐     ┌─────────────────┐     ┌──────────────────┐
│     ipos      │────▶│ipo_subscriptions│     │ipo_gmp_history   │
│               │────▶│                 │     │                  │
│               │────▶│ipo_performance  │     │ipo_allotment_stats│
└───────────────┘     └─────────────────┘     └──────────────────┘

┌──────────────────────┐
│  tracked_entities    │──┬─ entity_holdings ──── stocks
│ (super-investors,   │  ├─ entity_changes ────── stocks
│  PMS, AIF, SIF)     │  ├─ entity_conviction ── stocks
└──────────┬───────────┘  ├─ entity_quarterly_stats
           │              ├─ entity_strategies (PMS/SIF)
           │              ├─ tracked_entity_tags
           │              └─ entity_overlaps ──── tracked_entities (self)
           ▼
┌──────────────────────────────┐
│  shareholding_pattern_holders│── stocks  (raw ≥1% holders — 1% Club)
└──────────────────────────────┘
┌──────────────────────────────┐
│  sast_filings                 │── stocks  (intra-quarter event-driven)
└──────────────────────────────┘
┌──────────────────────────────┐
│  entity_stock_signals        │── stocks  (aggregate smart-money signal)
└──────────────────────────────┘
```

## Monthly Data Pipeline

After loading new holdings data each month:

```bash
# 1. Parse new Excel files → seed holdings into DB
node scripts/parse-holdings.mjs        # Writes JSON (existing)
node db/seed/seed-from-json.mjs        # Seeds into Neon

# 2. Compute derived analytics (MF)
npm run db:compute-all
```

## Key Queries

```sql
-- Most bought stocks by Small Cap funds (latest month)
SELECT s.name, sig.fresh_entries, sig.increased_count, sig.conviction_score
FROM stock_signals sig
JOIN stocks s ON s.id = sig.stock_id
WHERE sig.category = 'Small Cap'
  AND sig.month = (SELECT MAX(month) FROM stock_signals)
ORDER BY sig.conviction_score DESC;

-- Fund accumulation trend for a stock
SELECT month, category, total_funds_holding, fresh_entries
FROM stock_signals
WHERE stock_id = (SELECT id FROM stocks WHERE slug = 'reliance-industries')
ORDER BY month, category;

-- Sector rotation (last 3 months)
SELECT sec.name, sa.month, sa.pct_of_total_equity, sa.mom_change
FROM sector_allocations sa
JOIN sectors sec ON sec.id = sa.sector_id
WHERE sa.category = 'ALL'
ORDER BY sa.month DESC, sa.pct_of_total_equity DESC;
```

```sql
-- Stocks with the most super-investor / PMS conviction (latest quarter)
SELECT s.name, s.nse_symbol,
       COUNT(DISTINCT eh.entity_id) AS entity_count,
       AVG(ec.conviction_score) FILTER (WHERE ec.conviction_score IS NOT NULL) AS avg_conviction
FROM entity_holdings eh
JOIN stocks s ON s.id = eh.stock_id
LEFT JOIN entity_conviction ec ON ec.entity_id = eh.entity_id
  AND ec.stock_id = eh.stock_id AND ec.quarter = eh.quarter
WHERE eh.quarter = (SELECT MAX(quarter) FROM entity_holdings)
GROUP BY s.id, s.name, s.nse_symbol
ORDER BY entity_count DESC, avg_conviction DESC NULLS LAST
LIMIT 20;

-- Quarter-over-quarter fresh entries by a specific entity
SELECT s.name, ec.change_type, ec.new_shares, ec.qty_change
FROM entity_changes ec
JOIN stocks s ON s.id = ec.stock_id
WHERE ec.entity_id = (SELECT id FROM tracked_entities WHERE slug = 'westbridge-capital')
  AND ec.quarter = (SELECT MAX(quarter) FROM entity_changes)
  AND ec.change_type IN ('fresh_entry', 'increased')
ORDER BY ec.qty_change DESC;
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run db:seed` | Import existing JSON data into Neon |
| `npm run db:compute-signals` | Compute MF holdings changes + stock signals |
| `npm run db:compute-overlaps` | Compute fund overlap scores |
| `npm run db:compute-all` | Run all MF computations |
| `npm run db:seed-superinvestors` | Seed curated SI/PMS/AIF/SIF rosters from `src/data/*.json` |
| `npm run db:compute-si` | Compute entity changes, signals, conviction, overlaps + refresh views |
| `npm run db:refresh-si-views` | Refresh SI materialized views only (cheap, idempotent) |
| `npm run db:verify` | Verify schema has all expected tables and row counts |

### Quarterly SI pipeline (after migration 005)

Run after the quarterly NSE/BSE shareholding-pattern filings land (~25 days
after quarter-end). See `DATA_PIPELINE.md` → "Super Investors" for full docs.

```bash
# 1. Fetch holdings from NSE/BSE + PMS providers + AIF/SIF sources
npm run pipeline:superinvestor   # shareholding_pattern_holders + entity_holdings
npm run pipeline:pms             # PMS strategy-level entity_holdings
npm run pipeline:altfunds        # AIF/SIF entity_holdings (SAST + disclosures + overrides)
npm run pipeline:sast-sweep      # weekly; run before the others if new SAST filings exist

# 2. Compute derived analytics (one command)
npm run db:compute-si

# 3. Build + deploy (see DATA_PIPELINE.md)
npm run build
```
