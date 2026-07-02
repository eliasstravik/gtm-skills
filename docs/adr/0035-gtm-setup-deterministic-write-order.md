# ADR 0035: `gtm-setup` uses an in-memory setup model and deterministic write order

## Status

Accepted

## Context

`gtm-setup` creates a GTM Context Project with several interdependent IDs, indexes, markdown files, local registry entries, and git operations. Organization IDs, Person IDs, Workspace IDs, optional Business Unit IDs, and optional Team IDs must be known before files are written because `gtm.yaml`, markdown paths, and local registry state reference them.

The setup flow should avoid writing local active state that points at a broken or partially scaffolded project. It should also make generated projects predictable and easy to test.

## Decision

`gtm-setup` should first build an in-memory setup model, then write files in a deterministic order.

Setup write order:

1. Collect required setup answers and resolve IDs and paths:
   - Organization ID
   - Person ID
   - Workspace ID
   - optional Business Unit ID
   - optional Team ID
2. Ask optional enrichment questions, including source links and quick context, and classify source links before saving them as defined in ADR 0048.
3. If links are provided and research tools are available, draft source-assisted context, ask the user to resolve important conflicting or unclear claims as defined in ADR 0044, and show the ADR 0043 confirmation preview so the user can apply all, edit, apply selected sections, keep sparse templates, or add more links/context and retry. Unresolved optional enrichment clarification is non-blocking as defined in ADR 0045.
4. Ensure `~/.gtm/registry.json` exists.
5. Create the Organization repo folder.
6. Initialize git if needed.
7. Write `.gitignore`.
8. Write `AGENTS.md`.
9. Write `CLAUDE.md` containing `@AGENTS.md`.
10. Write `gtm.yaml`, omitting unknown optional fields as defined in ADR 0039.
11. Write `organization.md`.
12. Write optional `business-units/<business-unit-id>.md` using the ADR 0040 template.
13. Write optional `teams/<team-id>.md` using the ADR 0040 template.
14. Write `people/<person-id>.md`.
15. Write `workspaces/<workspace-id>/context.md`.
16. Update local registry active project/person/workspace.
17. Create the initial git commit, including confirmed source-assisted enrichment if the user approved it.

After the write/commit sequence, print the setup summary defined in ADR 0037.

Rules:

1. Do not write files until the setup model has resolved all required IDs and paths.
2. `gtm.yaml` may be written before referenced markdown files as long as all referenced files are created before setup completes.
3. Update local active state only after the shared scaffold exists.
4. Create the initial commit last.
5. If the initial commit fails, keep the scaffolded files and report the blocker rather than rolling back the project.

ADR 0036 defines idempotent and non-destructive behavior when `gtm-setup` is run against an existing or partially scaffolded project. ADR 0038 defines the generated `.gitignore` template and repair behavior for missing ignore rules. ADR 0041 defines source-assisted setup enrichment. ADR 0042 defines whether confirmed enrichment is included in the initial commit. ADR 0043 defines the enrichment confirmation preview. ADR 0044 defines user clarification for conflicting or unclear enrichment claims. ADR 0045 defines non-blocking behavior for unresolved optional enrichment clarification. ADR 0046 defines required setup questions vs optional enrichment questions. ADR 0048 defines source-link classification before saving. ADR 0068 generalizes safe/reviewed durable GTM context auto-commit behavior after setup. ADR 0069 generalizes non-rollback behavior for auto-commit failures. ADR 0070 generalizes auto-commit isolation from unrelated working-tree changes. ADR 0071 keeps push separate from local auto-commit. ADR 0072 defines assistive uncertainty previews.

## Consequences

- Generated projects are predictable and easier to test.
- Local active state does not point at a missing project.
- `gtm.yaml` references are based on stable IDs known up front.
- Setup can provide clearer partial-failure behavior.
