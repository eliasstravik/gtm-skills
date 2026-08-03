---
name: gtm-lead-scoring
description: Triggers when a user asks to score, rank, qualify, or prioritize individual leads against visible personas using existing persona labels in a GTM context repository. Not for assigning persona labels.
---

# Score Leads

## Recipe

1. Keep the workflow read-only and the result ephemeral.
2. Derive the context-repo root and canonical org path from the logical working directory.
3. Resolve the operator by matching root Git identity to a person file and taking that file's H1 display name exactly.
4. Render the pre-judgment line alone as `Working in <repo-name>/<org-path> as <person>`, using the case-sensitive repo-root directory basename, no trailing punctuation or prose, and the exact root form `Working in <repo-name> as <person>` with no slash.
5. Read the active org chain and resolve visible personas by nearest same-stem precedence while retaining non-colliding inherited files.
6. Report the repo-relative visible persona sources and list overridden sources separately.
7. Validate each supplied `persona_label` as `no-match` or an exact visible qualified persona label, preserving it unchanged.
8. Map `no-match` directly to `no-fit` without re-segmenting the lead.
9. For a matched label, assign exactly one qualitative Band from `strong-fit`, `good-fit`, `weak-fit`, or `no-fit` by comparing lead facts with the matched persona's responsibilities, pains, and buying-role content without arithmetic or a rubric.
10. Cap the Band at `weak-fit` when any persona disqualifier is hit.
11. Name the matched persona content and every hit disqualifier in the rationale.
12. Set Confidence and `needs_review` from gaps in the lead evidence, not from the persona document's maintenance backlog.
13. Treat missing key lead facts as low-confidence review rather than a refusal.
14. Proceed without questions or approval gates when inputs are complete.
15. Return one-off results with `Lead`, `Company`, `Title`, `persona_label`, `Band`, `Rationale`, `Matched Persona Content`, `Hit Disqualifiers`, `Confidence`, `needs_review`, `Evidence`, and `Open questions`, followed by `Context repo`, `Canonical org path`, `Mode`, `Visible persona sources`, `Prerequisite or gap status`, and `Side effects`.
16. Return bulk results with the same fields per row, followed by the metadata through `Prerequisite or gap status`, then `Band distribution`, `Low-confidence count`, `Review-needed count`, `Common persona content`, `Common disqualifiers`, `Common open questions`, and a final `Side effects` statement.

## Details

- Render `needs_review` only as `true` or `false`, and state `No files, Git history, or external systems changed.` in `Side effects`.
- Copy the matched persona's Responsibilities, Buying Role, and Pains sentences verbatim into `Matched Persona Content`.
- State the fit or gap between lead evidence and each matched Responsibilities, Buying Role, and Pains category in the rationale.
- Copy every hit disqualifier verbatim and explicitly state that it caps the Band at `weak-fit`.
- Render `Open questions: None` when lead evidence is complete, without transferring persona-maintenance questions.
- Remove each physical `suborgs/` container segment when rendering the canonical org path or working line.
- Render missing-fact items in `Open questions` as declarative gap phrases, never as interrogative questions.
