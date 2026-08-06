---
name: gtm-account-scoring
description: Triggers when a user wants strong-fit, good-fit, weak-fit, or no-fit assigned to companies that already have ICP labels. Not for segmentation, enrichment, account research, lead workflows, scoring-model design, arithmetic, or context setup.
---

# Score Accounts

## Recipe

1. Resolve the GTM context repo and target organization node.
2. State `Using GTM context: <display name> — <N> ICPs visible`.
3. Report a missing prerequisite without a band when that node has no ICPs.
4. Preserve each supplied label while validating it against the target node's own ICPs.
5. Map `no-match` directly to `no-fit`.
6. Compare account facts with the labeled ICP prose to assign one qualitative fit band without arithmetic.
7. Render compact scoring fields and a bulk band distribution when applicable.
8. Close `No files, git history, or external systems changed.`

## Details

- Treat labels as inputs: never assign, change, repair, or reinterpret one through segmentation.
- Flag a label absent from the visible set as unknown; preserve it, assign `no-fit`, and mark review rather than substituting a visible ICP.
- Use exactly one band: `strong-fit`, `good-fit`, `weak-fit`, or `no-fit`.
- Use `strong-fit` for clear core-profile fit with all or nearly all named signals.
- Use `good-fit` for core-profile fit with meaningful signals, notable absent signals, and no disqualifier.
- Use `weak-fit` for marginal prose-supported fit or whenever a labeled ICP disqualifier applies.
- Cap any disqualified matched result at `weak-fit`; quote the disqualifying words and still name established fit signals.
- Judge qualification and disqualification statements wherever they appear; freeform ICP prose has no fixed schema.
- Treat a thin ICP as a scoring caveat; do not invent criteria, points, weights, or thresholds to compensate.
- Derive `Confidence` and `Needs review` only from gaps or conflicts in the account's supplied facts or label.
- Keep confidence high when supplied facts completely establish what thin prose actually says; state that the ICP limits discrimination separately.
- Render `Account`, `Label`, `Band`, `Reasoning`, `Confidence`, `Needs review`, and `Open questions`.
- Restrict `Confidence` to `high`, `medium`, or `low`; set `Needs review` to `true` or `false`.
- Open bulk output with `Counts by label`, `Band distribution`, `Low-confidence count`, and `Review-needed count`.
- Proceed with zero questions or approval gates when inputs are complete; preserve evidence gaps in `Open questions`.
- Never enrich, open supplied links, or make a repo, filesystem, Git-history, CRM, or external-system change.

## Calls

- Read [references/context.md](references/context.md) before scoring to resolve the repo and node, enforce node-local visibility, state context, and handle ambiguity or an empty visible set. If unavailable, report that the GTM context contract could not be loaded and stop without a band.
- Read [references/output.md](references/output.md) before banding and rendering to apply label validation, qualitative band boundaries, and the exact one-off or bulk shape. If unavailable, preserve the label and render the seven literal item fields from Details plus the required close.
