# 03 — Database Review: IPOFins PostgreSQL Schema

> Reviewed by: Database Architect (PostgreSQL) + Staff Backend Engineer (Netflix)  
> Database: PostgreSQL 16 on Neon (serverless)  
> Schema: `db/migrations/001_initial_schema.sql` through `010_stock_shp_summary.sql`

---

## SCHEMA OVERVIEW

The database has 10 migration files defining:
- **Core reference tables:** `sectors`, `stocks`, `amcs`, `funds`
- **MF data:** `fund_navs`, `fund_returns`, `fund_holdings`, `holdings_changes`, `fund_overlaps`, `fund_portfolio_stats`
- **Smart money signals:** `stock_signals`, `sector_allocations`, `amc_monthly_stats`
- **IPO data:** `ipos`, `ipo_subscriptions`, `ipo_gmp_history`, `ipo_performance`, `ipo_allotment_stats`
- **Super investors / 1% Club:** `tracked_entities`, `tracked_entity_tags`, `entity_strategies`, `shareholding_pattern_holders`, `sast_filings`, `entity_holdings`, `entity_changes`, `entity_stock_signals`, `entity_quarterly_stats`, `entity_overlaps`, `entity_conviction`, `corporate_actions`, `pipeline_runs`
- **Materialized views:** `mv_smart_money_latest`, `mv_amc_top_holdings`, `mv_sector_rotation`, `mv_accumulation_trends`, `mv_super_investor_latest`, `mv_entity_signal_latest`, `mv_one_percent_club_latest`, `mv_trending_entities`

---

## NORMALIZATION ASSESSMENT

### What's Done Well

✅ **3NF compliance on core tables:** `stocks` → `sectors` (sector_id FK), `funds` → `amcs` (amc_id FK), `fund_holdings` → `funds` + `stocks` (proper junction).

✅ **Separate NAV history table:** `fund_navs(fund_id, date, nav)` with composite PK is correct. Storing NAV history in the fund row would be a fatal denormalization.

✅ **Pre-computed returns in `fund_returns`:** Separating computed returns from raw NAV data is the right pattern. Returns are recalculated from `fund_navs` nightly — this is correct.

✅ **Materialized views for expensive aggregations:** Using `mv_smart_money_latest` instead of querying `stock_signals` + `stocks` + `sectors` live is architecturally sound for a primarily-read-heavy static site.

✅ **`holdings_changes` is a computed snapshot, not derived live:** Storing month-over-month changes explicitly avoids repeated expensive self-joins on `fund_holdings`.

✅ **Pairwise overlap stored with `CHECK (fund_a_id < fund_b_id)`:** Prevents duplicate pairs (A,B) and (B,A). Correct.

### Normalization Issues

**Issue 1 — `ipos.highlights TEXT[]` and `ipos.risks TEXT[]` as arrays**  
Severity: Medium  
Storing arrays directly in PostgreSQL TEXT[] is fine for small, stable data but makes these fields opaque to analytics queries. You cannot easily count "how many IPOs have a specific risk factor" or group by highlights.  
**Recommendation:** For analytics needs, consider a separate `ipo_risk_factors(ipo_id, factor TEXT, severity SMALLINT)` table. The TEXT[] format is acceptable for the current pure-display use case but will limit future risk scoring capabilities.

**Issue 2 — `tracked_entities.aliases TEXT[]`**  
Severity: Low  
Same concern as above. Aliases are used for fuzzy name matching at ingest time. As the entity count grows beyond 200, searching `aliases @> ARRAY['some name']` requires a GIN index to be performant.  
**Recommendation:** Add `CREATE INDEX IF NOT EXISTS idx_te_aliases ON tracked_entities USING GIN(aliases);`

**Issue 3 — `funds.category` and `funds.sub_category` as free-text VARCHAR**  
Severity: Medium  
AMFI category names change periodically (e.g., "Equity Scheme - Large Cap" became the canonical form after SEBI categorization). If these are stored as raw AMFI strings, any AMFI rename propagates as duplicates.  
**Recommendation:** Create a `fund_categories` lookup table with canonical names, AMFI raw name mapping, and a `fund_category_slug`. Migrate `funds.category` to `category_id INT REFERENCES fund_categories(id)`.

**Issue 4 — `amc_monthly_stats.top_sector TEXT`**  
Severity: Low  
Stores the sector name as free text rather than a `sector_id` FK reference. This prevents joins to the sectors table for trend analysis.  
**Recommendation:** Change to `top_sector_id INT REFERENCES sectors(id)` and a computed `top_sector_pct`.

---

## INDEXES ASSESSMENT

### Strengths
- Composite indexes on hot query patterns (`fund_holdings(fund_id, month DESC)`, `stock_signals(month DESC, category, conviction_score DESC)`) — correct.
- Partial index `idx_sph_non_prom ON shareholding_pattern_holders(quarter DESC, is_promoter) WHERE is_promoter = FALSE` — excellent; avoids index bloat from promoter rows which are excluded from most queries.
- Partial index `idx_sph_entity WHERE entity_id IS NOT NULL` — correct, unmatched rows (entity_id IS NULL) don't need to be indexed for entity lookups.

### Missing Indexes

**Missing 1 — `stocks.name` for full-text search**  
The search overlay (`/search`) and `CuratedInvestorSearch` do name-based lookups. Currently `stocks.name` has no index.  
**Fix:** `CREATE INDEX IF NOT EXISTS idx_stocks_name_trgm ON stocks USING GIN(name gin_trgm_ops);` (requires `pg_trgm` extension)  
`CREATE EXTENSION IF NOT EXISTS pg_trgm;`

**Missing 2 — `funds.name` for fund search**  
Same issue — fund search requires full text on `funds.name`.  
**Fix:** Same GIN trigram index pattern.

**Missing 3 — `tracked_entities.aliases` GIN index**  
As noted above — aliases lookup is unindexed.

**Missing 4 — `ipos.open_date` and `ipos.close_date`**  
Queries for "currently live IPOs" filter on `open_date <= NOW() AND close_date >= NOW()`. Neither column is indexed.  
**Fix:** `CREATE INDEX IF NOT EXISTS idx_ipos_open_close ON ipos(open_date, close_date);`

**Missing 5 — `fund_navs` covering index**  
The most common query pattern is "latest NAV for a fund": `SELECT nav FROM fund_navs WHERE fund_id = $1 ORDER BY date DESC LIMIT 1`. The current `idx_navs_fund_date(fund_id, date DESC)` covers this, but adding `nav` to the index as a covering column eliminates the heap fetch.  
**Fix:** `CREATE INDEX IF NOT EXISTS idx_navs_fund_latest ON fund_navs(fund_id, date DESC) INCLUDE (nav);`

**Missing 6 — `entity_holdings.is_preliminary`**  
SAST preliminary holdings are frequently filtered out of main views (`WHERE is_preliminary = FALSE`). Add a partial index.  
**Fix:** `CREATE INDEX IF NOT EXISTS idx_eh_confirmed ON entity_holdings(entity_id, quarter DESC) WHERE is_preliminary = FALSE;`

---

## CONSTRAINTS ASSESSMENT

### Strengths
- FK constraints with `ON DELETE CASCADE` on fact tables — correct, prevents orphaned holdings.
- `UNIQUE(fund_id, stock_id, month)` on `fund_holdings` — prevents duplicate holdings.
- `CHECK (entity_a_id < entity_b_id)` on overlaps — prevents duplicate pairs.

### Missing Constraints

**Missing 1 — `ipos.status` enum constraint**  
`status VARCHAR(20)` has no CHECK constraint. Valid values should be `'upcoming'`, `'live'`, `'allotment'`, `'listing'`, `'listed'`, `'withdrawn'`. A typo in the pipeline could insert `'open'` and break the site's status grouping logic without any DB-level protection.  
**Fix:**
```sql
ALTER TABLE ipos ADD CONSTRAINT ipos_status_check 
CHECK (status IN ('upcoming', 'live', 'allotment', 'listing', 'listed', 'withdrawn'));
```

**Missing 2 — `ipos.type` enum constraint**  
`type VARCHAR(20)` should be constrained to `'mainboard'` or `'sme'`.

**Missing 3 — `holdings_changes.change_type` enum constraint**  
Valid values: `fresh_entry`, `complete_exit`, `increased`, `decreased`, `unchanged`. Currently unconstrained.

**Missing 4 — `tracked_entities.type` enum constraint**  
Valid values: `individual`, `family_office`, `fii`, `dii`, `pms`, `aif`, `sif`. Currently unconstrained.

**Missing 5 — `fund_returns` return range**  
No constraint prevents clearly erroneous values like `returns_1y = 99999.00` (a pipeline bug). Add:
```sql
ALTER TABLE fund_returns ADD CONSTRAINT fund_returns_range_check
CHECK (returns_1y BETWEEN -100 AND 10000);
```

**Missing 6 — `ipos.price_min <= ipos.price_max`**
```sql
ALTER TABLE ipos ADD CONSTRAINT ipos_price_band_check
CHECK (price_min IS NULL OR price_max IS NULL OR price_min <= price_max);
```

**Missing 7 — `shareholding_pattern_holders.pct_of_company` range**  
The `XBRL 1.0 percentage mis-parsed as 100%` bug mentioned in `CONTEXT.md` would have been caught by:
```sql
ALTER TABLE shareholding_pattern_holders ADD CONSTRAINT sph_pct_range
CHECK (pct_of_company BETWEEN 0 AND 100);
```

---

## PARTITIONING ASSESSMENT

### Current State
No partitioning. All tables are single-segment.

### Where Partitioning Would Help

**`fund_navs` — Range partition by year**  
This table will grow by ~500K rows/year (1,000 funds × 250 trading days × avg NAV daily). At 5 years, that's 2.5M rows. Partition by year:
```sql
-- PostgreSQL declarative partitioning
CREATE TABLE fund_navs (
  fund_id INT,
  date DATE NOT NULL,
  nav NUMERIC(12,4) NOT NULL,
  PRIMARY KEY (fund_id, date)
) PARTITION BY RANGE (date);

CREATE TABLE fund_navs_2024 PARTITION OF fund_navs FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE fund_navs_2025 PARTITION OF fund_navs FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE fund_navs_2026 PARTITION OF fund_navs FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```
Most NAV queries are for recent data — partition pruning will dramatically speed up queries.

**`fund_holdings` — Range partition by month**  
Same reasoning. Monthly holding snapshots grow linearly. Partition by year allows pruning old partitions.

**`shareholding_pattern_holders` — Range partition by quarter**  
Quarterly filings accumulate. Most queries target the latest 1–2 quarters.

### Neon-Specific Considerations
Neon serverless may not support declarative partitioning identically to standard PostgreSQL. Verify with Neon documentation before implementing. Alternative: use `CHECK constraint` partitioning or simply maintain data archival scripts that move old rows to archive tables.

---

## MATERIALIZED VIEWS ASSESSMENT

### Strengths
✅ All 8 materialized views have unique indexes enabling `CONCURRENTLY` refresh — this is critical for production zero-downtime refreshes.  
✅ `refresh_all_views()` and `refresh_super_investor_views()` functions consolidate refresh logic.  
✅ Views filter to "latest month/quarter" at definition time — queries against them are O(1) regardless of historical data size.

### Issues

**Issue 1 — `mv_smart_money_latest` has no refresh trigger**  
The view references `(SELECT MAX(month) FROM stock_signals)` — after each monthly data load, this view must be manually refreshed. There is no automated trigger or pipeline step that calls `refresh_all_views()` after data ingestion.  
**Fix:** Add `SELECT refresh_all_views();` as the final step in `scripts/pipeline/03-monthly-mf-holdings.mjs`.

**Issue 2 — `mv_amc_top_holdings` joins on `stock_slug` but unique index is on `(amc_id, stock_slug, month)`**  
If the same stock has two slugs (before/after a deduplication run), this would create duplicate rows in the view. The `UNIQUE` constraint prevents CONCURRENT refresh from failing but the underlying data inconsistency surfaces here.  
**Fix:** Unique index should be on `(amc_id, stock_id, month)` using the canonical `stock_id` FK, not `stock_slug`.

**Issue 3 — `mv_sector_rotation` only covers last 6 months**  
`WHERE sa.month >= (SELECT MAX(month) - INTERVAL '6 months' FROM sector_allocations)` — a user wanting 12-month sector rotation context has to query raw tables. For Bloomberg-level sector intelligence, 12–24 months of history in the view would be more useful.  
**Fix:** Extend to 24 months. At the data volumes involved (sectors × months × categories), this won't meaningfully impact view refresh time.

**Issue 4 — No `mv_ipo_latest` view**  
IPO data is loaded directly from JSON (not via materialized views). The `getAllIPOs()` function reads from a static JSON file. This means IPO queries don't benefit from the same caching architecture as fund data. For consistency and future DB-sourced IPO data, a `mv_ipo_latest` view would align architectures.

---

## SCALABILITY ASSESSMENT

### Current Data Volumes (Estimated)
- `funds`: ~2,000 rows
- `stocks`: ~5,000 rows
- `fund_navs`: ~2.5M rows (growing)
- `fund_holdings`: ~500K rows (monthly snapshots × funds × stocks)
- `shareholding_pattern_holders`: ~200K rows (quarterly × 1,700 stocks × holders)
- `ipos`: ~500 rows

### Bottlenecks at 10x Scale
1. `fund_navs` becomes slow for range queries without partitioning at ~25M rows
2. `fund_holdings` overlaps computation (`compute-overlaps.mjs`) is O(n²) in funds — at 5,000 funds this would be 25M pair comparisons per month
3. `shareholding_pattern_holders` name resolution at 2M rows without GIN trigram index = full table scan

### Neon Serverless Limits
- Cold start penalty on first query after idle: 300–500ms. For build-time queries this is fine. For edge functions (if added), cold starts must be managed with connection pooling (PgBouncer or Neon's built-in pool).
- Concurrent connection limit on free/starter plan: 20. Each `neon()` client creates a connection. If the build runs many parallel page queries, this could be hit.
- **Fix:** Always use a single `neon()` client per build process (current `db.ts` does this correctly).

---

## VERSION 4 ARCHITECTURE RECOMMENDATION

The current schema is Version 3 (Migrations 001–010). Here is a proposed Version 4 architecture for production scale:

### V4 Key Changes

```sql
-- 1. Lookup tables for status/type enums
CREATE TABLE ipo_statuses (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE fund_categories (
  id SERIAL PRIMARY KEY,
  amfi_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  parent_category TEXT,
  sebi_code VARCHAR(20)
);

-- 2. Full-text search support
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE INDEX idx_stocks_name_search ON stocks USING GIN(to_tsvector('english', name));
CREATE INDEX idx_funds_name_search ON funds USING GIN(to_tsvector('english', name));

-- 3. IPO fundamentals table (for richer scoring)
CREATE TABLE ipo_fundamentals (
  ipo_id INT PRIMARY KEY REFERENCES ipos(id) ON DELETE CASCADE,
  revenue_cr NUMERIC(14,2),
  revenue_cagr_3y NUMERIC(6,2),
  ebitda_margin NUMERIC(6,2),
  pat_cr NUMERIC(14,2),
  debt_equity NUMERIC(6,2),
  promoter_holding_pct NUMERIC(5,2),
  pe_ratio NUMERIC(8,2),
  sector_pe NUMERIC(8,2),
  roce NUMERIC(6,2),
  roe NUMERIC(6,2),
  data_source TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User alerts (no-login, UUID-keyed)
CREATE TABLE ipo_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ipo_id INT REFERENCES ipos(id) ON DELETE CASCADE,
  alert_types TEXT[] DEFAULT '{"open","close","allotment"}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribe_token UUID DEFAULT gen_random_uuid(),
  is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_alerts_ipo ON ipo_alerts(ipo_id) WHERE is_active = TRUE;
CREATE INDEX idx_alerts_email ON ipo_alerts(email) WHERE is_active = TRUE;

-- 5. Real-time GMP via community submissions (with audit trail)
CREATE TABLE ipo_gmp_community (
  id BIGSERIAL PRIMARY KEY,
  ipo_id INT REFERENCES ipos(id),
  gmp NUMERIC(8,2) NOT NULL,
  source_url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  is_verified BOOLEAN DEFAULT FALSE,
  ip_hash TEXT -- hashed for deduplication, never stored raw
);

-- 6. Portfolio snapshots for optional user sync
CREATE TABLE user_portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_token UUID DEFAULT gen_random_uuid() UNIQUE, -- anonymous identifier
  name TEXT,
  fund_slugs TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'
);

-- 7. Partitioned NAV history
-- (Implementation via pg_partman or manual partitions as described above)

-- 8. API access log for rate limiting + monetization
CREATE TABLE api_access_log (
  id BIGSERIAL PRIMARY KEY,
  api_key_hash TEXT,
  endpoint TEXT NOT NULL,
  response_time_ms INT,
  status_code SMALLINT,
  called_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (called_at);
```

### V4 Migration Path
1. Apply enum constraints (zero downtime — just ADDs)
2. Add missing indexes (zero downtime — CREATE INDEX CONCURRENTLY)
3. Add `ipo_fundamentals` table (additive)
4. Add `ipo_alerts` table (additive)
5. Migrate `fund_navs` to partitioned table (requires maintenance window or logical replication swap)
6. Add GIN indexes for full-text search (CREATE CONCURRENTLY)

---

## NAMING CONVENTIONS AUDIT

| Convention | Status | Notes |
|---|---|---|
| Table names: snake_case plural | ✅ | `fund_holdings`, `tracked_entities` |
| Column names: snake_case | ✅ | Consistent |
| Index names: `idx_{table}_{columns}` | ✅ | Consistent |
| Materialized views: `mv_{name}` | ✅ | Clear convention |
| PK: `id SERIAL` or composite | ✅ | Consistent |
| Timestamps: `created_at`, `updated_at` TIMESTAMPTZ | ✅ | Present on core tables |
| FK naming: `{referenced_table_singular}_id` | ✅ | `fund_id`, `stock_id`, `entity_id` |
| Boolean columns: `is_` prefix | ✅ | `is_active`, `is_promoter`, `is_preliminary` |

**One inconsistency:** `pipeline_runs.pipeline` is a raw TEXT column rather than an FK to a hypothetical `pipelines` lookup table. As the number of pipeline types grows, this becomes unmaintainable. **Fix:** Add `CHECK (pipeline IN ('superinvestor','1pc-club','pms','altfunds','sast-sweep','mf-holdings','nav-daily'))`.

---

## CACHING STRATEGY

### Current State
- Vercel CDN caches static HTML (build-time)
- `/data/*` files served from Vercel with `Cache-Control: public, max-age=3600, s-maxage=86400`
- Neon has no explicit query caching layer

### Recommended Additions
1. **Redis/Upstash caching** for hot DB queries in Edge Functions (future): Conviction scores, latest month signals — cache for 1 hour with `stale-while-revalidate`.
2. **Materialized view refresh timestamps** in a `mv_refresh_log` table so the UI can show "Smart money data last updated: 3 hours ago."
3. **Browser cache headers on JSON exports** in `public/data/` — currently 1-hour browser cache. For monthly data (fund_holdings), this could safely be 24 hours. For IPO subscription data, should be 15 minutes.

---

## DATA QUALITY ISSUES

| Issue | Table | Severity |
|---|---|---|
| XBRL 1.0 percentage misparse (pct = 100%) | `shareholding_pattern_holders` | Critical — Fixed in pipeline but DB constraint would have caught it |
| Stock deduplication produces orphaned `holdings` rows | `fund_holdings`, `entity_holdings` | High — `reassign-holdings-canonical.mjs` script exists but must be run manually |
| Missing `bse_code` / `nse_symbol` on ~30% of stocks | `stocks` | Medium — Affects price lookup and linking |
| `ipos.stock_id` NULL on unlisted IPOs | `ipos` | Low — Expected but undocumented |
| `entity_holdings.market_value_cr` NULL for most rows | `entity_holdings` | High — Requires bhavcopy data which is optional |
| `fund_returns.last_computed` never updated after initial seed | `fund_returns` | High — Returns data may be perpetually stale |
