# Cursor customization — IPOFins

| Layer | Path |
|-------|------|
| Rules | `.cursor/rules/*.mdc` |
| Skills | `.cursor/skills/*/SKILL.md` |
| Subagents | `.cursor/subagents/*.md` (mirrored to `.cursor/agents/*.md` for Cursor) |
| Commands | `.cursor/commands/*.md` → `/command-name` |
| MCP | Copy `.cursor/mcp.json.example` → `.cursor/mcp.json` (gitignored) |
| Hooks | `.cursor/hooks.json` + `.cursor/hooks/*` |
| Automations | `.cursor/automations/drafts.md` |

## Setup

1. `python scripts/bootstrap_cursor_config.py` — regenerate team config (UTF-8).
2. Copy MCP example and add API keys.
3. Session start: `@CONTEXT.md` `@DESIGN.md` then your task.

## Git

- `.cursor/mcp.json` is gitignored; rules/skills/hooks are committed.
