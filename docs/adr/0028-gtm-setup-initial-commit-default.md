# ADR 0028: `gtm-setup` creates an initial commit by default

## Status

Accepted

## Context

GTM Context Projects are git repositories by default. Once `gtm-setup` has successfully scaffolded the repository, the user should have a clean baseline commit containing the durable setup files.

Earlier guidance avoided auto-committing by default. The decision is now to commit the scaffold by default after setup finishes, while still avoiding remotes, secrets, local active state, and ephemeral artifacts.

## Decision

After successful setup, `gtm-setup` creates an initial git commit by default.

Default commit message:

```text
Initialize GTM context project
```

Rules:

1. Create the commit only after setup has completed successfully.
2. Commit scaffolded durable context files only, including confirmed source-assisted enrichment when the user approved it during setup.
3. Do not commit `~/.gtm/registry.json`; it lives outside the repo.
4. Do not commit local state or personal override files such as `.gtm.local.json`, `.gtm.local.yaml`, `.local/`, or `CLAUDE.local.md`.
5. Do not commit ephemeral outputs such as `outputs/`, `research/`, `tmp/`, `*.tmp`, or `*.log`.
6. Do not commit secrets or environment files such as `.env` or `.env.*`.
7. Do not create a remote by default.
8. If the project already has commits, do not create another “initial” commit automatically; later safe/reviewed durable context writes follow ADR 0068 rather than creating another setup baseline commit.
9. If git is unavailable or commit fails because user identity is not configured, leave files written and report the exact blocker.

ADR 0035 defines the full `gtm-setup` write order and places the initial commit last. ADR 0038 defines the generated `.gitignore` template that protects these files. ADR 0042 defines when confirmed source-assisted enrichment is included in the initial commit. ADR 0068 defines auto-commit behavior for safe/reviewed durable GTM context writes after setup. ADR 0069 generalizes the non-rollback behavior for auto-commit failures. ADR 0070 keeps later auto-commits scoped to current-action changes. ADR 0071 keeps push separate from local auto-commit. ADR 0072 keeps setup and git-related workflows assistive for nontechnical users.

## Consequences

- New context projects start from a clean, versioned baseline.
- Users can immediately see future changes as diffs.
- Shared repos remain safe because local state, outputs, and secrets are ignored/excluded.
- Setup has one more operation that can fail due to git config; failure should not roll back the scaffold.
- ADR 0068 handles later context-writing commits without treating them as new setup baseline commits.
- ADR 0069 keeps commit failures from undoing successful setup or context writes.
- ADR 0070 prevents later auto-commits from sweeping unrelated working-tree changes.
- ADR 0071 preserves the rule that setup and context writes do not publish to remotes by default.
- ADR 0072 keeps technical setup/git uncertainty user-facing and accept/deny-oriented.
