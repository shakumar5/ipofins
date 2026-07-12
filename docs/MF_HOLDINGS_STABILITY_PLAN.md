# MF Holdings Pipeline — Stability Plan

Reference for keeping mutual fund holdings stable across monthly pipeline runs, exports, and production deploys. Updated July 2026 after list/detail count mismatches, international fund DB issues, and export/meta split-brain.

---

## Lessons from what went wrong (don't repeat)

| Mistake | What to do instead |
|--------|---------------------|
| **Two count sources** — meta used `total_stocks`, detail used by-slug rows | One rule: **UI count = `stocks.length` in by-slug file** |
| **Export overwrote reconcile** — meta written after sync, with old DB logic | **By-slug first → meta/hub from by-slug → validate → deploy** |
| **"DB authoritative" without international in DB** | International rows must **round-trip in DB**, not rely on parser overlay |
| **"Fixed in code" = fixed in prod** | Code merge + **fresh export + deploy** are separate steps |
| **Assumed data wasn't in DB** | Verify DB/backups before explaining; international funds can have `fund_holdings` rows |
| **Math.max between parser + DB meta** | Never inflate list count above actual exported rows |
| **No CI gate** | Pipeline **fails** if meta ≠ by-slug or listing policy breaks |

---

## Already done (on `main` — no re-work)

- Stock links: **ISIN → NSE → BSE** (no name-based matching)
- Listing code policy: Indian mandatory, international exempt (`listing-codes.mjs` / `listing-codes.ts`)
- International **export overlay** (`overlayInternationalHoldingsFromParser`) when DB export is sparse
- Parser **no top-20 cap** — full portfolio on next parse (`parse-holdings.mjs`)
- TER **CSV fallback** when AMFI API fails
- `reconcile-holdings-meta.mjs` and `validate:fund-holdings-integrity.mjs` scripts exist
- Monthly build uses **`FORCE_EXPORT=1`** (`.github/workflows/pipeline-monthly.yml`)

**Note:** Merged code does not update production fund pages until **export + deploy** runs.

---

## Phase A — Must do before next monthly run

> **Status (Jul 2026):** A1–A3 + quality gate done. Fresh export from prod DB passed `validate:mf-holdings-quality` (0 hard fails). Ready for new-month Excels → `pipeline:monthly` (do not re-run export alone unless needed).

Small code changes + **one export/deploy** after merge. No `--full` holdings reload required.

### A1. Single count source (list = detail)

- Remove `fund_portfolio_stats.total_stocks` / `portfolio_total` as **display** count in:
  - `scripts/lib/mf-hub-holdings-meta.mjs`
  - `src/lib/data/holdings.ts` (server meta queries)
  - `scripts/lib/fund-holdings-export.mjs`
- Build `stockCounts` only from **`fund-holdings-by-slug/*.json` row length**
- Keep `total_stocks` in DB only as optional AMC metadata (not shown in list)

### A2. Fix export order

In `scripts/export-client-data.mjs`:

1. Write `fund-holdings-by-slug/*.json` (from DB + overlay if needed)
2. Build `fund-holdings-meta.json` + `mf-hub/*.json` **from by-slug counts**
3. Run `reconcile-holdings-meta.mjs` **once at the end** (or fold into step 2)
4. Remove `mergeHoldingsMeta` **Math.max** inflation with parser counts for display

### A3. Pipeline quality gate

Add to `scripts/pipeline/03-monthly-mf-holdings.mjs` and/or `.github/workflows/pipeline-monthly.yml` **before deploy**:

- `npm run validate:fund-holdings-integrity` → fail if meta ≠ by-slug
- `npm run validate:holdings-listing-codes` → fail if Indian rows missing ISIN/NSE/BSE

### A4. Prod refresh after A1–A3 merge

1. Merge to `main`
2. Run **Pipeline Monthly** (or `FORCE_EXPORT=1 npm run build` + deploy)
3. Spot-check: Taiwan + one large Indian fund (e.g. Bandhan) — **list count = detail rows**

**Export type needed:** client export (`export-client-data.mjs`), **not** `--full` DB/parse reload.

---

## Phase B — MF data durability (next sprint)

### B1. International holdings in DB

- Allow `stocks` rows with **foreign 12-char ISIN** (no NSE/BSE required)
- Seed `fund_holdings` for Taiwan/global funds the same way as Indian funds
- Treat parser overlay as **fallback only**, not the normal path

**Files:** `scripts/lib/listing-codes.mjs`, `db/seed/seed-holdings-batch.mjs`

### B2. Protect international rows in dedupe

In `db/seed/dedupe-stocks-canonical.mjs`:

- Do **not** purge stocks with non-Indian ISIN that have `fund_holdings`
- Do **not** run `UNIDENTIFIED_STOCK_FILTER` on rows with valid foreign ISIN

### B3. Seed integrity check

After each monthly seed:

- Per fund: `inserted_rows === COUNT(fund_holdings)` for that month
- Log/warn (or fail gate) if parser had more equity rows than DB stored

**Files:** `db/seed/seed-holdings-batch.mjs`

### B4. Slug / alias hardening

- Every `mf-hub` row with `hasHoldings: true` must have non-empty `fund-holdings-by-slug/{detailSlug}.json`
- Alias files copied during export (not only via manual `restore:fund-holdings-from-parser`)

### B5. Client-side count merge (optional cleanup)

- `FundTableLoader.tsx` uses `Math.max(meta, bySlugCounts)` — after A1–A2 this is harmless; optionally simplify to **by-slug only**

---

## Phase C — Operations (avoid "it's fixed but prod is wrong")

### C1. Deploy checklist (every holdings change)

1. Code merged to `main`
2. Export ran (`FORCE_EXPORT=1` or monthly pipeline)
3. Validator passed
4. Spot-check 2–3 funds on prod URL (list count vs detail)

### C2. Don't use for routine ops

- Manual `restore:fund-holdings-from-parser` as default — export should own this
- DB-only export without international path
- `--full` holdings reload unless deliberately backfilling all months

### C3. Architecture reminder

**Prod holdings = DB → export JSON → static build.** Code push alone does not update fund detail pages.

Key paths:

| Purpose | Path |
|--------|------|
| Fund detail page | `public/data/fund-holdings-by-slug/*.json` (build time) |
| List count | `fund-holdings-meta.json`, `mf-hub/all.json`, `fund-holdings-by-slug-counts.json` |
| DB source | `fund_holdings` + `stocks` |
| Export | `scripts/export-client-data.mjs` |
| Monthly pipeline | `scripts/pipeline/03-monthly-mf-holdings.mjs` → seed → export → signals |

---

## Phase D — SHP (after MF is stable one month)

### D1. Stock identity before quarterly SHP

- Dedupe must **remap** `shareholding_pattern_holders.stock_id`, never delete stocks with SHP rows without remapping

### D2. SHP pipeline gate

- Run `validate:si-pipeline` before quarterly deploy
- Alert on large quarter-over-quarter row drops

### D3. Separate universes

- MF international stocks (foreign ISIN) → display only, **not** in SHP fetch universe
- SHP stays NSE/BSE listed Indian equities

### D4. Same export principle

- SHP JSON from DB snapshot; counts consistent with stored rows

**Pipeline:** `scripts/pipeline/04-super-investor-holdings.mjs`, `run-quarterly-si-cron.mjs`

---

## Priority order

```
A1 → A2 → A3 → A4   (ship before monthly run on the 15th)
        ↓
B1 → B2 → B3        (international + seed safety)
        ↓
B4, B5, C1–C3       (hardening + process)
        ↓
D1–D4               (SHP, quarterly)
```

---

## What "stable" means after Phase A

| Check | Expected |
|-------|----------|
| List stock count | = rows on fund detail page |
| Pipeline on mismatch | **Fails**, no bad deploy |
| Indian fund links | ISIN/NSE/BSE only |
| International funds | Full DB parity may still need Phase B |
| Prod after merge | Requires **export + deploy**, not code alone |

---

## Explicitly out of scope

- `HoldingsCompare.tsx` / Holdings Changes page
- Name-based stock slug matching for fund holdings links
- Re-applying reverted meta/count hardening without explicit approval

---

## Related scripts

```bash
npm run export:client-data              # DB → public/data
npm run restore:fund-holdings-from-parser  # emergency sync only
npm run reconcile:holdings-meta         # align meta to by-slug
npm run validate:fund-holdings-integrity
npm run validate:holdings-listing-codes
npm run validate:mf-holdings-quality     # full gate: DB dups/orphans + JSON + cross-check
npm run pipeline:cron:monthly           # monthly MF + SAST
npm run db:seed-holdings                # incremental seed (latest month)
npm run db:seed-holdings:full           # full reload — use only for backfill
```
