# ADR 0042: Include confirmed source-assisted enrichment in the initial commit

## Status

Accepted

## Context

ADR 0041 defines source-assisted setup enrichment: the user can provide organization, product, proof, docs, company-social, and active-person profile/source links; the agent drafts initial durable context; and the user confirms, edits, adds context, or skips enrichment before files are written.

ADR 0028 says `gtm-setup` creates an initial commit by default after successful setup. If source-assisted enrichment is confirmed during setup, that enriched context is part of the successful setup result, not a separate later artifact.

## Decision

If the user confirms source-assisted enrichment during `gtm-setup`, the initial commit should include the confirmed enriched context.

The default initial commit:

```text
Initialize GTM context project
```

may include:

- scaffold files
- confirmed `organization.md` enrichment
- confirmed `people/<person-id>.md` enrichment
- confirmed `workspaces/<workspace-id>/context.md` enrichment
- confirmed `business-units/<business-unit-id>.md` enrichment, if created
- confirmed `teams/<team-id>.md` enrichment, if created
- confirmed source URLs preserved in the relevant context sections, subject to the source-link rules in ADR 0047 and classification policy in ADR 0048

If enrichment is skipped, unavailable, proposed-but-not-applied, or not confirmed, the initial commit should include sparse templates only.

Rules:

1. Never commit unconfirmed source-assisted enrichment.
2. Confirmed enrichment is treated as durable setup context.
3. The initial commit should reflect the final confirmed setup state.
4. If the user confirms only part of the enrichment, commit only the confirmed parts.
5. If the user edits the draft before confirmation, commit the edited confirmed version.
6. The setup summary should report whether enrichment was skipped, unavailable, proposed-but-not-applied, partially applied, or applied.
7. Do not commit raw research scratch notes or temporary extraction outputs; commit only confirmed durable context.
8. Conflicting or unclear claims become confirmed enrichment only if the user resolves them.
9. Unresolved enrichment claims do not block the initial commit; only the affected optional claim, field, or section is omitted or recorded as an open question.
10. Secret-bearing, signed, tokenized, invite, local-only, unapproved internal, or otherwise sensitive links must not be included in the initial commit.
11. Human-safe source labels for omitted sensitive/private links may be included when they supported confirmed context and the user did not opt out.
12. Proposed safe source labels must be shown in the enrichment preview before they are included in the initial commit.

ADR 0043 defines the confirmation preview and options that determine which enrichment is confirmed.

ADR 0044 defines how source conflicts and unclear claims are clarified with the user.

ADR 0045 defines that unresolved enrichment clarification is non-blocking for setup.

ADR 0047 defines which confirmed source links may be committed. ADR 0048 defines how those source links are classified before saving. ADR 0049 defines safe labels for omitted sensitive/private source links. ADR 0050 defines preview behavior for safe labels before writing them. ADR 0068 generalizes commit-safe durable GTM context auto-commit behavior after setup. ADR 0069 defines non-blocking auto-commit failure behavior. ADR 0070 defines auto-commit isolation from unrelated working-tree changes. ADR 0071 defines that auto-commit does not auto-push by default. ADR 0072 defines assistive uncertainty previews.

## Consequences

- New context projects start with the best confirmed context available.
- Users do not need a second commit just because setup used source-assisted enrichment.
- Unconfirmed agent-generated claims do not become durable context.
- The initial commit remains a clean baseline of the accepted setup state.
- ADR 0068 keeps later auto-commits aligned with this safe-or-confirmed enrichment rule.
- ADR 0069 keeps confirmed enrichment writes even if the git commit fails.
- ADR 0070 keeps later source-assisted auto-commits scoped to the confirmed enrichment changes.
- ADR 0071 keeps confirmed enrichment publication to remotes as a separate explicit action.
- ADR 0072 keeps enrichment uncertainty understandable for nontechnical users.
