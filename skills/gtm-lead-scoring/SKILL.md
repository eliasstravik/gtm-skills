---
name: gtm-lead-scoring
description: Triggers when a user wants strong-fit, good-fit, weak-fit, or no-fit assigned to people who already have persona labels. Not for segmentation, enrichment, lead research, account workflows, scoring-model design, arithmetic, or context setup.
---

# Score Leads

## Recipe

1. Resolve the GTM context repo and target organization node.
2. State `Using GTM context: <display name> — <N> personas visible`.
3. Report a missing prerequisite without a band when that node has no personas.
4. Preserve each supplied label while validating it against the target node's own personas.
5. Map `no-match` directly to `no-fit`.
6. Compare lead facts with the labeled persona prose to assign one qualitative fit band without arithmetic.
7. Render compact scoring fields and a bulk band distribution when applicable.
8. Close `No files, git history, or external systems changed.`

## Details

- Treat labels as inputs: never assign, change, repair, or reinterpret one through segmentation.
- Flag a label absent from the visible set as unknown; preserve it, assign `no-fit`, and mark review rather than substituting a visible persona.
- Use exactly one band: `strong-fit`, `good-fit`, `weak-fit`, or `no-fit`.
- Use `strong-fit` when supplied facts clearly establish all or nearly all named responsibilities and scope signals.
- Use `good-fit` when core responsibilities match, meaningful named signals are absent, and no disqualifier applies.
- Use `weak-fit` for marginal prose-supported fit or whenever a labeled persona disqualifier applies.
- Cap a disqualified matched result at `weak-fit`; explicitly say the disqualifier caps the band, quote its words, and retain established responsibility matches.
- Judge qualification and disqualification statements wherever they appear; freeform persona prose has no fixed schema.
- Treat a thin persona as a scoring caveat, not an evidence gap; do not invent criteria, points, weights, or thresholds.
- Derive `Confidence` and `Needs review` only from gaps or conflicts in the lead's supplied facts or label.
- Keep confidence high when supplied facts completely establish what thin prose actually says; state limited discriminatory power separately.
- Render `Lead`, `Label`, `Band`, `Reasoning`, `Confidence`, `Needs review`, and `Open questions`.
- Restrict `Confidence` to `high`, `medium`, or `low`; set `Needs review` to `true` or `false`.
- Open bulk output with `Counts by label`, `Band distribution`, `Low-confidence count`, and `Review-needed count`.
- Proceed with zero questions or approval gates when inputs are complete; preserve evidence gaps in `Open questions`.
- A lead is always the subject being scored, never the user, operator, or active identity.
- Never enrich, open supplied links, or make a repo, filesystem, Git-history, CRM, or external-system change.

## Calls

- Read [references/context.md](references/context.md) before scoring to resolve the repo and node, enforce node-local visibility, state context, and handle ambiguity or an empty visible set. If unavailable, report that the GTM context contract could not be loaded and stop without a band.
- Read [references/output.md](references/output.md) before banding and rendering to apply label validation, qualitative band boundaries, and the exact one-off or bulk shape. If unavailable, preserve the label and render the seven literal item fields from Details plus the required close.
