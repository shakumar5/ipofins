---
name: dark-mode-audit
description: Audit Astro/TSX UI for dark mode token usage and contrast.
---

# Dark mode audit

1. Read `DESIGN.md` and `src/styles/global.css`.
2. Find hardcoded `#fff` / `#000` / raw hex — replace with `surface-*` / `dark:` tokens.
3. Verify contrast in light and dark at 375px width.
4. Tables: sticky first column on mobile.
