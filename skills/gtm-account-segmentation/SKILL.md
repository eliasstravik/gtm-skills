---
name: gtm-account-segmentation
description: Triggers when a user asks to classify, segment, route, or bucket companies against ICPs in a connected GTM context. Not for scoring already-labeled accounts, researching or enriching companies, defining ICPs, segmenting leads, or managing the context repository.
---

# Segment Accounts

## Recipe

1. Resolve the GTM context repo and target organization node.
2. State `Using GTM context: <display name> — <N> ICPs visible`.
3. Report a missing prerequisite without classification when that node has no ICPs.
4. Normalize only supplied account facts without enrichment.
5. Compare each account with the target node's own freeform ICP prose.
6. Assign exactly one qualified ICP label or `no-match` with cited language and losing alternatives.
7. Render compact item fields and bulk counts when applicable.
8. Close `No files, git history, or external systems changed.`

## Details

- Treat accounts as companies; never reinterpret a person as the account or as the user.
- Proceed with zero questions or approval gates when repo, node, account facts, and visible ICPs are resolved.
- Apply qualification and disqualification statements wherever they appear in an ICP; do not expect fixed headings or fields.
- Use a bare slug for a root ICP and `<org-path>/<slug>` for a suborg ICP; omit physical `suborgs/` segments.
- Render the literal item fields `Account`, `Label`, `Reasoning`, `Confidence`, `Needs review`, and `Open questions`.
- Restrict `Confidence` to `high`, `medium`, or `low`; set `Needs review` to `true` or `false`.
- Base confidence and review only on gaps or conflicts in supplied account evidence, not on ICP maintenance quality.
- Quote decisive ICP wording in `Reasoning`; name every plausible losing visible label and why it lost.
- Say no other visible ICP alternative exists when there is no plausible loser.
- For `no-match`, explain why every plausible visible alternative fails and cite any applicable disqualifier.
- Open bulk output with `Counts by label`, `Low-confidence count`, and `Review-needed count`; include every account once.
- Preserve supplied uncertainty in `Open questions` without asking the user during a complete run.
- Never enrich, infer missing company facts, open supplied links, or silently join facts across accounts.
- Make no repo, filesystem, Git-history, CRM, or external-system change.

## Calls

- Read [references/context.md](references/context.md) before segmentation to resolve the repo and node, enforce node-local visibility, state context, and handle ambiguity or an empty visible set. If unavailable, report that the GTM context contract could not be loaded and stop without classification.
- Read [references/output.md](references/output.md) before rendering to qualify labels and apply the exact one-off or bulk shape. If unavailable, render the six literal item fields from Details and the required close.
