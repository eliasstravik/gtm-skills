# ADR 0007: Segmentation is a prerequisite for scoring

## Status

Accepted

## Context

The MVP includes ICPs, personas, segmentation, and scoring. These concepts need a strict dependency order so skills do not invent fit criteria or score entities against undefined targets.

Account segmentation depends on defined ICPs. Lead segmentation depends on defined personas. Scoring only makes sense after segmentation identifies which ICP segment or persona applies.

## Decision

Use this dependency pipeline:

```text
active workspace icps.md      → account-segmentation → account-scoring
active workspace personas.md → lead-segmentation    → lead-scoring
```

Rules:

1. Account segmentation must not run without defined ICPs in the active GTM Workspace. If `workspaces/<workspace>/icps.md` is missing or empty, stop and route the user to `define-icp`.
2. Lead segmentation must not run without defined personas in the active GTM Workspace. If `workspaces/<workspace>/personas.md` is missing or empty, stop and route the user to `define-personas`.
3. Account scoring must use the account's segment from account segmentation.
4. Lead scoring must use the lead's persona segment from lead segmentation.
5. If segmentation returns `no-match`, scoring must return `not-a-fit` and the numeric score cannot exceed 49.
6. A `no-match` account or lead can still include evidence and explanation, but it cannot be labeled `good-fit`, `great-fit`, or `excellent-fit`.
7. Segmentation and scoring outputs should include source provenance for the criteria and evidence that drove the label or score, as defined in ADR 0052.
8. Segmentation and scoring outputs should include `confidence`, `reasoning`, and `needs_review` as defined in ADR 0056.

ADR 0052 defines source provenance requirements for research, scoring, and segmentation outputs.

ADR 0053 defines the lightweight provenance-entry format and canonical source types.

ADR 0054 defines compact per-record provenance for bulk segmentation and scoring outputs.

ADR 0055 defines run-level summaries for bulk segmentation and scoring outputs.

ADR 0056 defines standard result confidence, reasoning, and review fields.

ADR 0057 defines that review explanation belongs in `reasoning`, not a separate `review_reasons` field.

ADR 0058 defines that new unreviewed low-confidence results start with `needs_review: true`.

ADR 0059 defines that review-gated segmentation and scoring outputs should not trigger automated downstream actions by default.

ADR 0060 defines that human review clears the gate by updating `needs_review` and `reasoning`, not by adding an override object.

ADR 0061 defines that `needs_review: false` is automation-eligible, not side-effect-authorized.

ADR 0062 keeps automation policy design out of scope for the MVP.

ADR 0063 requires preview and confirmation before MVP side effects execute.

ADR 0064 keeps Side-Effect Previews summary-first for bulk usability.

ADR 0065 requires post-action summaries after confirmed side effects execute.

ADR 0066 keeps post-action summaries ephemeral by default in the MVP.

ADR 0067 defines file/section previews for durable GTM context writes.

ADR 0068 defines auto-commit behavior for commit-safe durable GTM context writes.

ADR 0069 defines non-blocking auto-commit failure behavior for durable GTM context writes.

ADR 0070 defines auto-commit isolation from unrelated working-tree changes.

ADR 0071 defines that GTM context auto-commit does not auto-push by default.

ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.

## Consequences

- Skills cannot score accounts or leads against undefined criteria.
- Bulk workflows can run in two clean phases: segment first, score second.
- `no-match` is a hard gate against accidentally prioritizing accounts outside the ICP or people outside the target personas.
- Users who discover many `no-match` results can choose to define a new ICP/persona, but that is an explicit context update rather than an implicit scoring shortcut.
