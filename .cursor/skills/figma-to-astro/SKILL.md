---
name: figma-to-astro
description: Translate Figma frames to Astro components using DESIGN.md tokens (Figma MCP).
---

# Figma to Astro

1. Read `DESIGN.md`; map colours to Tailwind theme tokens only.
2. Use Figma MCP (see `.cursor/mcp.json.example`) for specs.
3. Output Astro + Tailwind v4; `font-mono` for numbers.
4. Prefer existing components before new primitives.
