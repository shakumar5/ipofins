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
psql $DATABASE_URL -f db/migrations/001_initial_schema.sql
psql $DATABASE_URL -f db/migrations/002_indexes.sql
psql $DATABASE_URL -f db/migrations/003_materialized_views.sql

# Option B: Copy-paste into Neon SQL Editor (console.neon.tech → SQL Editor)
```

### 4. Seed from Existing JSON
```bash
npm run db:seed
```

### 5. Compute Smart Money Signals
```bash
npm run db:compute-signals    # Holdings changes + stock signals
npm run db:compute-overlaps   # Fund overlap scores
# OR both:
npm run db:compute-all
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
```

## Monthly Data Pipeline

After loading new holdings data each month:

```bash
# 1. Parse new Excel files → seed holdings into DB
node scripts/parse-holdings.mjs        # Writes JSON (existing)
node db/seed/seed-from-json.mjs        # Seeds into Neon

# 2. Compute derived analytics
npm run db:compute-all

# 3. Build site (reads from DB at build time)
npm run build
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

## Scripts

| Command | Description |
|---------|-------------|
| `npm run db:seed` | Import existing JSON data into Neon |
| `npm run db:compute-signals` | Compute holdings changes + stock signals |
| `npm run db:compute-overlaps` | Compute fund overlap scores |
| `npm run db:compute-all` | Run all computations |
