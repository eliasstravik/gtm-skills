---
name: gtm-lead-research
description: Triggers when a user wants one or many evidence-backed person briefs, lead research, role or timing analysis, outreach preparation, or handling of a request to save lead research, using supplied sources or web access. Not for persona-label assignment, fit-band or numeric scoring, account research, persona authoring, CRM writes, person-record editing, or context setup.
---

# Research Leads

## Recipe

1. Resolve the GTM context repo and target organization node.
2. State `Using GTM context: <display name> — <N> ICPs and <M> personas visible`.
3. Report a missing prerequisite and stop when that node has no personas.
4. Inspect the org chain, target-node ICPs and personas, safe packets, and web evidence when available.
5. Preserve supplied persona labels without re-segmenting.
6. Separate inspected findings, unverified claims, tentative hypotheses, conflicts, and provenance without silent joins.
7. Interpret persona relevance, timing, risks, and outreach angles.
8. Assign one `high`, `medium`, or `research-needed` priority.
9. Render the lean person-brief spine and bulk priority distribution when applicable.
10. Answer save requests with the org-only principle and complete copyable brief.
11. Close `No files, git history, or external systems changed.`

## Details

- Treat the supplied persona label as immutable input; flag one absent from the visible set instead of assigning or substituting another.
- Inspect only the selected node's own ICPs and personas; use the root-to-target `org.md` chain only for organization context.
- Use web access when available and relevant; state its absence instead of pretending evidence was inspected.
- Never open, reproduce, or describe an unsafe or tokenized link; list it only as `Private source withheld`.
- Put actually inspected role facts under `Findings` and non-inspected statements under `Unverified claims`.
- Keep role, influence, pain, and stakeholder interpretations explicitly tentative hypotheses.
- Preserve source, publisher, and date beside material findings; never silently join separate sources or people.
- Keep conflicts visible, including dated role conflicts, rather than selecting the convenient claim.
- Use `high` only for inspected persona relevance plus a clear active or dated signal without material conflict.
- Use `medium` when useful relevance or timing evidence has a material conflict or unverified dependency.
- Use `research-needed` when inspectable evidence is absent or the persona label is not visible.
- Set `Confidence` and `Needs review` from evidence completeness and conflict.
- Render every brief in the exact output-reference order; use `None evidenced` for an empty section.
- Open bulk output with `Research-priority distribution`, then render one independent complete brief per person.
- A lead is the research subject, never the user, operator, or active identity.
- Research is response-only: never write, commit, update a CRM, or change an external system.
- A save request is not an approval flow; explain the org-only storage boundary and provide copyable Markdown.

## Calls

- Read [references/context.md](references/context.md) before research to resolve repo and node, enforce node-local visibility, state counts, and handle ambiguity or zero personas. If unavailable, report that the contract could not load and stop.
- Read [references/evidence.md](references/evidence.md) before inspecting sources to apply link safety, evidence boundaries, provenance, joining, and calibration. If unavailable, use safe supplied packets only, mark claims unverified, and use `research-needed`.
- Read [references/output.md](references/output.md) before rendering to apply one-off, bulk, save-request, and closing shapes. If unavailable, render the nine Recipe spine sections in order and use the exact close.
