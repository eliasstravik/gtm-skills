---
name: gtm-account-scoring
description: Triggers when a user asks to score, rank, qualify, or prioritize accounts against visible ICPs using existing segment labels in a GTM context repository. Not for assigning segment labels, authoring scoring rubrics or point systems, or numeric scoring and arithmetic.
---

# Score Accounts

## Recipe

1. Keep the workflow read-only and the result ephemeral.
2. Derive the context-repo root and canonical org path from the logical working directory.
3. Resolve the operator by matching root Git identity to a person file and taking that file's H1 display name exactly.
4. Render the pre-judgment line alone as `Working in <repo-name>/<org-path> as <person>`, using the case-sensitive repo-root directory basename, no trailing punctuation or prose, and the exact root form `Working in <repo-name> as <person>` with no slash.
5. Read the active org chain and resolve visible ICPs by nearest same-stem precedence while retaining non-colliding inherited files.
6. Report the repo-relative visible ICP sources and list overridden sources separately.
7. Validate each supplied `segment_label` as `no-match` or an exact visible qualified ICP label, and keep it unchanged.
8. Map `no-match` directly to `no-fit` without re-segmenting the account.
9. For a matched label, assign exactly one qualitative Band from `strong-fit`, `good-fit`, `weak-fit`, or `no-fit` by comparing account facts with named ICP content without arithmetic.
10. Cap the Band at `weak-fit` when any ICP disqualifier is hit.
11. Name the matched fit signals and every hit disqualifier in the rationale.
12. Set Confidence and `needs_review` from gaps in the account evidence, not from the ICP document's own maintenance backlog.
13. Return one-off results with `Account`, `Website`, `segment_label`, `Band`, `Rationale`, `Matched Fit Signals`, `Hit Disqualifiers`, `Confidence`, `needs_review`, `Evidence`, and `Open questions`, followed by `Context repo`, `Canonical org path`, `Mode`, `Visible ICP sources`, `Prerequisite or gap status`, and `Side effects`.
14. Return bulk results with the same fields per row, followed by the metadata through `Prerequisite or gap status`, then `Band distribution`, `Low-confidence count`, `Review-needed count`, `Common fit signals`, `Common disqualifiers`, `Common open questions`, and a final `Side effects` statement.

## Details

- Treat `<repo-name>` only as the case-sensitive repo-root directory basename and `<person>` only as the exact H1 of the Git-identity-matched person file; never retain `/` when the org path is empty.
- Render `needs_review` only as `true` or `false`, and state `No files, Git history, or external systems changed.` in `Side effects`.
- Treat explicit presence or absence of a Fit Signal as sufficient judgment evidence; an absent signal may lower Band without lowering Confidence or creating review.
- For `no-match`, use `Confidence: high`, `needs_review: false`, no matched signals, no hit disqualifiers, and no open questions unless the supplied label itself conflicts.
- When a disqualifier caps a matched result, explicitly say it caps the Band at `weak-fit` and still list every matched signal established by supplied facts.
- Use `strong-fit` for clear core-profile fit with all or nearly all named signals, `good-fit` for core-profile fit with meaningful signals but notable absent signals and no disqualifier, and `weak-fit` for marginal core fit or a disqualifier cap.
- Copy every Fit Signal and Disqualifier name verbatim from its ICP, including capitalization.
