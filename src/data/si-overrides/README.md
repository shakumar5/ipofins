# Super-investor pipeline overrides

Hand-curated JSON when NSE/BSE or provider fetches return empty during an outage.

## Files

| File pattern | Pipeline | Shape |
|--------------|----------|--------|
| `superinvestor-{quarter}.json` | `pipeline:superinvestor` | `{ stockSlug, holderName, holderType, shares, pctOfCompany, sourceUrl }` |
| `sast-{date}.json` | `pipeline:sast-sweep` | `{ stockSlug, filerName, postPct, filingDate, sourceUrl }` |

`quarter` is ISO date of quarter start, e.g. `2026-04-01`.

Overrides merge on conflict (override wins). See `scripts/lib/si-overrides.mjs`.
