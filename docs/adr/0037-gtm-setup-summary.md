# ADR 0037: `gtm-setup` ends with a setup summary

## Status

Accepted

## Context

`gtm-setup` can create a new GTM Context Project, select an existing project, or validate and repair a partially scaffolded project. ADR 0036 makes setup idempotent and non-destructive by default, which means setup may create some files, preserve others, repair missing pieces, update local active state, and create a git commit.

Users need a clear end state after setup finishes. The summary should make setup feel complete, show exactly what changed, and guide the user toward the next useful GTM skills.

## Decision

`gtm-setup` should always end with a concise setup summary.

For a new project, the summary should look like:

```text
GTM context project ready

Organization
- ID: acme
- Path: ~/.gtm/acme

Active local state
- Person: elias-stravik
- Workspace: default

Files
- Created: AGENTS.md, CLAUDE.md, gtm.yaml, organization.md, people/elias-stravik.md, workspaces/default/context.md
- Skipped existing: none
- Repaired: none

Git
- Initialized repo: yes
- Initial commit: Initialize GTM context project

Enrichment
- Source-assisted enrichment: applied
- Sources used: 4
- Unresolved questions: 0
- Links omitted/redacted for safety: 0
- Safe source labels saved: 0

Next recommended skills
1. define-icp
2. define-personas
```

For an existing or repaired project, the summary should distinguish created, preserved, and repaired files:

```text
Files
- Created: none
- Preserved: organization.md, AGENTS.md
- Repaired: .gitignore
```

Rules:

1. Always print a setup summary after successful setup, selection, validation, or repair.
2. Include Organization ID and repo path.
3. Include active local Person and Workspace.
4. Report files created, skipped/preserved, and repaired.
5. Report git status: whether git was initialized and whether a commit was created.
6. If setup could not create the expected commit, report the blocker in the Git section.
7. Report source-assisted enrichment status: skipped, unavailable, proposed-but-not-applied, partially applied, or applied.
8. Report unresolved enrichment clarification count or concise examples when any optional claims were left unresolved.
9. Report any source links omitted or redacted for safety without printing secret-bearing URLs.
10. Report safe source labels saved when omitted private/sensitive links supported confirmed context.
11. Recommend the next useful skills, starting with `define-icp` and `define-personas` for new projects.
12. Do not include secrets, local credentials, or hidden implementation details in the summary.

ADR 0041 defines source-assisted setup enrichment.

ADR 0045 defines that unresolved clarification is non-blocking for setup.

ADR 0046 defines the distinction between required setup questions and optional enrichment questions.

ADR 0048 defines source-link classification and safe reporting for omitted/redacted links.

ADR 0049 defines safe labels for omitted sensitive/private source links.

ADR 0050 defines that proposed safe source labels are previewed before they become durable context.

## Consequences

- Users can see that setup completed successfully.
- Idempotent behavior is visible instead of surprising.
- Repairs are auditable and easy to understand.
- The setup flow naturally leads users to the next high-value GTM context steps.
