# ADR 0029: Use `AGENTS.md` as canonical instructions and import it from `CLAUDE.md`

## Status

Accepted

## Context

GTM Context Projects should work across multiple AI coding and agent tools. `AGENTS.md` is the best canonical project instruction file for cross-agent use. Claude Code also reads `CLAUDE.md`, so each GTM Context Project needs a Claude-compatible file without duplicating the same operating instructions.

Web research against Anthropic's Claude Code memory documentation confirmed that `CLAUDE.md` files can import additional files with `@path/to/import` syntax. The docs explicitly show using `@AGENTS.md` to share instructions between tools. Imported files are loaded into context at session start, and relative paths resolve relative to the file containing the import.

Source checked: <https://docs.anthropic.com/en/docs/claude-code/memory>

## Decision

`AGENTS.md` is the canonical agent operating manual for a GTM Context Project.

`CLAUDE.md` should be a minimal Claude Code compatibility file that imports `AGENTS.md` using Claude Code's documented import syntax:

```md
@AGENTS.md
```

If Claude-specific instructions are ever needed, they may be added below the import:

```md
@AGENTS.md

## Claude Code

<!-- Claude-specific notes only. Do not duplicate shared instructions from AGENTS.md. -->
```

`gtm-setup` should create both files:

```text
AGENTS.md   # canonical shared agent instructions
CLAUDE.md   # imports AGENTS.md via @AGENTS.md
```

`AGENTS.md` should contain generic operating rules and context-resolution instructions only. It should not duplicate local active state or generated project state such as active person, active workspace, or current organization.

## Rules

1. Do not duplicate canonical operating instructions in `CLAUDE.md`.
2. Put shared instructions in `AGENTS.md`.
3. Put only Claude-specific overrides or notes below `@AGENTS.md` when needed.
4. Prefer `@AGENTS.md` over a symlink because it is documented by Claude Code and works better cross-platform.
5. Keep `CLAUDE.md` committed because it is shared project context, not local state.
6. Keep generated/local state out of `AGENTS.md`; agents should resolve that state from `~/.gtm/registry.json`, `gtm.yaml`, and the relevant context files.

## Consequences

- Claude Code reads the same canonical instructions as other agents.
- Shared instructions are maintained in one place.
- The repo remains cross-agent friendly without creating divergent instruction files.
