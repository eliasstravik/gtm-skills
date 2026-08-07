---
name: gtm-lead-segmentation
description: Triggers when a user asks to classify, segment, route, bucket, or qualify individual leads or contacts against personas in a connected GTM context. Not for scoring already-labeled leads, researching people, defining personas, segmenting companies, or managing the context repository.
---

# Segment Leads

## Recipe

1. Resolve the GTM context repo and target organization node.
2. State `Using GTM context: <display name> — <N> personas visible`.
3. Report a missing prerequisite without classification when that node has no personas.
4. Normalize only supplied lead facts without enrichment.
5. Compare each lead with the target node's own freeform persona prose.
6. Assign exactly one qualified persona label or `no-match` with cited language and losing alternatives.
7. Render compact item fields and bulk counts when applicable.
8. Close `No files, git history, or external systems changed.`

## Details

- Treat leads as people being classified; never reinterpret a lead as the user, operator, or account.
- Proceed with zero questions or approval gates when repo, node, lead facts, and visible personas are resolved.
- Weight responsibilities, authority, and scope over title; use title only as supporting or conflicting evidence.
- Apply qualification and disqualification statements wherever they appear in a persona; do not expect fixed headings or fields.
- Use a bare slug for a root persona and `<org-path>/<slug>` for a suborg persona; omit physical `suborgs/` segments.
- Render the literal item fields `Lead`, `Label`, `Reasoning`, `Confidence`, `Needs review`, and `Open questions`.
- Restrict `Confidence` to `high`, `medium`, or `low`; set `Needs review` to `true` or `false`.
- Base confidence and review only on gaps or conflicts in supplied lead evidence, not on persona maintenance quality.
- Quote decisive persona wording in `Reasoning`; name every plausible losing visible label and why it lost.
- Say no other visible persona alternative exists when there is no plausible loser.
- For `no-match`, explain why every plausible visible alternative fails and cite any applicable disqualifier.
- Open bulk output with `Counts by label`, `Low-confidence count`, and `Review-needed count`; include every lead once.
- Preserve supplied uncertainty in `Open questions` without asking the user during a complete run.
- Never enrich, infer missing employment or authority facts, open supplied links, or silently join facts across leads.
- Make no repo, filesystem, Git-history, CRM, or external-system change.

## Calls

- Read [references/context.md](references/context.md) before segmentation to resolve the repo and node, enforce node-local visibility, state context, and handle ambiguity or an empty visible set. If unavailable, report that the GTM context contract could not be loaded and stop without classification.
- Read [references/output.md](references/output.md) before rendering to qualify labels and apply the exact one-off or bulk shape. If unavailable, render the six literal item fields from Details and the required close.
