---
name: build-ipo-card
description: Implement or adjust IPO card UI per DESIGN.md (GMP, subscription, staleness).
---

# Build IPO card

1. Extend `IPOCard` or sibling in `src/components/` — no one-off colours.
2. Show GMP median/range, subscription multiple, source count when available.
3. Numeric fields: `font-mono`; status via `RiskBadge`.
4. Loading: `.skeleton` not spinners for primary content.
