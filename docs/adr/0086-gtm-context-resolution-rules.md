# ADR 0086: Resolve GTM context from prompt, CWD, then registry

## Status

Accepted

## Context

ADR 0074 requires organization/person/workspace/context resolution rules before downstream skills are built. ADR 0031's generated `AGENTS.md` template included a registry-first context loading sequence, but it did not define how an agent should choose the active GTM Context Project from an arbitrary working directory.

The eval suite also needs a `GTM_HOME` override so tests can run against temporary directories instead of the user's real `~/.gtm`.

Wayfinder ticket `T-006` asked the CEO to approve the resolution order, `GTM_HOME` behavior, failure wording, ambiguity handling, and canonical location for the rules.

## Decision

When a `gtm-` skill needs GTM context, resolve the GTM Context Project in this order:

1. Use explicit user instruction in the prompt when the user names a GTM project, organization id, project path, workspace, or person.
2. If the current working directory is inside a GTM Context Repository, use the nearest ancestor containing `gtm.yaml` as the project.
3. Otherwise, use the active project in `$GTM_HOME/registry.json`.

`GTM_HOME` is supported. If it is unset, it defaults to `~/.gtm`. Registry and project paths derive from `$GTM_HOME` whenever it is set.

After choosing the project, resolve the context chain:

1. Use any explicit person or workspace from the prompt.
2. Use local registry active person/workspace for the selected project when present.
3. Use the project `default_workspace` from `gtm.yaml` when no local active workspace is set.
4. Read `organization.md`, `people/<person-id>.md`, and `workspaces/<workspace-id>/context.md`.

If no GTM Context Project resolves, stop as a Hard Context Prerequisite failure and route the user to `gtm-setup` with this wording:

> I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

If the registry has multiple projects and none is active, ask the user to choose instead of guessing.

This ADR is the canonical decision record. The generated `AGENTS.md` template created by `gtm-setup` must encode the same context-resolution contract.

## Consequences

- Skills behave predictably in repo-local, prompt-directed, and registry-directed sessions.
- Tests can set `GTM_HOME` to an isolated temporary directory.
- Downstream skills can treat missing project resolution as a Hard Context Prerequisite failure instead of inventing local conventions.
- ADR 0031's old registry-first context-resolution section is superseded by this ADR; its other generated-template safety and workspace rules remain valid.
