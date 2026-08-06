---
name: gtm-account-research
description: Triggers when a user wants one or many evidence-backed account briefs, company research, research-priority triage, fit or timing analysis, sales personalization, or handling of a request to save account research, using supplied sources or web access. Not for segment-label assignment, fit-band or numeric scoring, lead research, ICP or persona authoring, CRM writes, org-profile editing, or context setup.
---

# Research Accounts

## Recipe

1. Resolve the GTM context repo and target organization node.
2. State `Using GTM context: <display name> — <N> ICPs and <M> personas visible`.
3. Report a missing prerequisite and stop when that node has no ICPs.
4. Inspect the org chain, the target node's own ICPs and personas, safe supplied packets, and web-access evidence when available.
5. Preserve supplied labels without re-segmenting.
6. Separate inspected findings, unverified claims, tentative hypotheses, conflicts, and provenance without silent joins.
7. Interpret fit, timing, risks, and personalization angles.
8. Assign one priority from `high`, `medium`, or `research-needed`.
9. Render the lean account-brief spine and a bulk priority distribution when applicable.
10. Answer save requests with the org-only principle and the complete copyable brief in chat.
11. Close `No files, git history, or external systems changed.`

## Details

- Treat every supplied label as immutable input; flag a label absent from the visible ICP set instead of assigning or substituting another.
- Inspect only the selected node's own ICPs and personas; org context may come from the root-to-target `org.md` chain.
- Use web access as a capability when available and relevant; say when it is unavailable rather than pretending evidence was inspected.
- Never open, reproduce, or describe an unsafe or tokenized link; list it only as `Private source withheld`.
- Put source-supported facts under `Findings`; put user or source claims that were not inspected under `Unverified claims`.
- Mark inferred pains, stakeholders, and implications as tentative hypotheses, never findings.
- Preserve source, publisher, and date beside material findings; do not merge separate-source facts unless one source explicitly joins them.
- Keep conflicts visible rather than choosing a convenient version.
- Use `high` only for inspected fit plus a clear active or dated buying signal without material conflict.
- Use `medium` when useful inspected fit or timing evidence depends on a material conflict or unverified claim.
- Use `research-needed` when inspectable decision evidence is absent or the supplied label is not visible at the target.
- Set `Confidence` to `high`, `medium`, or `low` and `Needs review` to `true` or `false` from evidence completeness and conflict.
- Render every brief in the exact section order defined by the output reference; omit no section, using `None evidenced` where necessary.
- Open bulk output with `Research-priority distribution`, then render a complete independent brief per account.
- Research is response-only: never write a file, commit, update a CRM, or change an external system.
- A save request is not an approval flow; explain that the context repo stores org self-knowledge only and provide the brief as copyable Markdown.

## Calls

- Read [references/context.md](references/context.md) before research to resolve the repo and node, enforce node-local visibility, state counts, and handle ambiguity or an empty visible set. If unavailable, report that the context contract could not be loaded and stop without research.
- Read [references/evidence.md](references/evidence.md) before inspecting any supplied or web source to apply link safety, evidence boundaries, provenance, joining, and priority calibration. If unavailable, use supplied safe packets only, label every claim unverified, and use `research-needed`.
- Read [references/output.md](references/output.md) before rendering to apply the exact one-off, bulk, save-request, and closing shapes. If unavailable, render the nine Recipe spine sections in order and use the exact close.
