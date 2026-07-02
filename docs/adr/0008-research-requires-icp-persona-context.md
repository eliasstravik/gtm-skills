# ADR 0008: Research requires ICP and persona context

## Status

Accepted

## Context

Account research and lead research are part of the SDR/BDR MVP. A generic account or person summary is not useful enough; the skill needs to know what the seller cares about to decide which facts are interesting.

Without ICPs and personas, account and lead research risks producing broad summaries rather than GTM-useful research.

## Decision

Research skills hard-require the relevant context definitions:

```text
active workspace icps.md      → account-research
active workspace personas.md → lead-research
```

Rules:

1. `account-research` must not run without defined ICPs in the active GTM Workspace. If `workspaces/<workspace>/icps.md` is missing or empty, stop and route the user to `define-icp`.
2. `lead-research` must not run without defined personas in the active GTM Workspace. If `workspaces/<workspace>/personas.md` is missing or empty, stop and route the user to `define-personas`.
3. Research should use the relevant ICP/persona definitions to decide what to look for, what to ignore, and what counts as a meaningful signal.
4. Research outputs remain ephemeral by default and should not be written into the GTM Context Project unless the user explicitly promotes a durable learning.
5. Research outputs should cite source provenance for important claims and decisions, distinguishing workspace context, saved source links, safe source labels, newly found evidence, and unresolved open questions as defined in ADR 0052.
6. Research outputs should include `confidence`, `reasoning`, and `needs_review` as defined in ADR 0056.

ADR 0052 defines source provenance requirements for research, scoring, and segmentation outputs.

ADR 0053 defines the lightweight provenance-entry format and canonical source types.

ADR 0054 defines compact per-record provenance for bulk research outputs.

ADR 0055 defines run-level summaries for bulk research outputs.

ADR 0056 defines standard result confidence, reasoning, and review fields.

ADR 0057 defines that review explanation belongs in `reasoning`, not a separate `review_reasons` field.

ADR 0058 defines that new unreviewed low-confidence results start with `needs_review: true`.

ADR 0059 defines that review-gated research outputs should not trigger automated downstream actions by default.

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

- Research outputs are GTM-specific rather than generic summaries.
- The MVP setup flow must make it easy to create usable ICPs and personas before research.
- Account/lead research, segmentation, and scoring all share the same prerequisite context, reducing inconsistent criteria across skills.
