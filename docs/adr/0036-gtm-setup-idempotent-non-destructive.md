# ADR 0036: `gtm-setup` is idempotent and non-destructive by default

## Status

Accepted

## Context

`gtm-setup` creates, selects, validates, and repairs GTM Context Projects. Users may run setup multiple times for the same Organization repo, either intentionally to switch active context or accidentally while onboarding.

Because GTM Context Projects are durable shared repositories, setup must not overwrite human-edited context or destroy unknown fields. It should be safe to re-run and should repair missing scaffold pieces when possible.

## Decision

`gtm-setup` must be idempotent and non-destructive by default.

Default behavior on an existing Organization repo:

1. Do not overwrite existing files blindly.
2. Add missing scaffold files and folders only.
3. Merge missing `.gitignore` rules without deleting user-defined ignore rules.
4. Preserve unknown fields in `~/.gtm/registry.json` and `gtm.yaml`.
5. Preserve existing `AGENTS.md`, `organization.md`, `people/<person-id>.md`, and `workspaces/<workspace>/context.md` unless the user explicitly asks to regenerate or update them.
6. If the existing repo is valid, update local active state in `~/.gtm/registry.json` and otherwise leave the repo untouched.
7. If the scaffold is partially missing, offer or perform a repair mode that fills missing required scaffold pieces.
8. If repair writes changes, create a repair commit by default.

Default repair commit message:

```text
Repair GTM context scaffold
```

`gtm-setup` therefore supports three modes:

```text
create new project
select existing project
validate/repair existing project
```

Rules:

- Non-destructive behavior is the default.
- Regeneration or overwrite requires explicit user intent.
- Unknown fields and user-authored sections must be preserved.
- Repair mode should report exactly what it changed.
- Local active state is still user-local and should be updated only after the target project is valid enough to use.
- Repair commits are commit-safe generated scaffold/repair changes under ADR 0068 unless the repair would overwrite, delete, or substantially rewrite human-authored durable context.

ADR 0037 defines the final setup summary that reports created, preserved, and repaired files after setup completes. ADR 0038 defines the standard generated `.gitignore` rules that repair mode should merge when missing. ADR 0039 defines how generated `gtm.yaml` omits unknown optional fields while preserving unknown existing fields. ADR 0068 defines commit-safe durable GTM context writes and auto-commit behavior. ADR 0069 defines non-blocking auto-commit failure behavior. ADR 0070 defines auto-commit isolation from unrelated working-tree changes. ADR 0071 defines that auto-commit does not auto-push by default. ADR 0072 defines assistive uncertainty previews.

## Consequences

- Running setup repeatedly is safe.
- Existing team context is protected from accidental overwrite.
- Setup can double as onboarding, project selection, and scaffold repair.
- Repair behavior is auditable through git commits.
- ADR 0068 keeps safe repair commits aligned with normal durable-context auto-commit behavior.
- ADR 0069 keeps repair writes from being rolled back solely because git commit failed.
- ADR 0070 keeps repair commits scoped to the actual repair changes.
- ADR 0071 keeps repair commits local unless the user separately asks to push.
- ADR 0072 keeps repair uncertainty presented as plain-language accept/deny choices when needed.
