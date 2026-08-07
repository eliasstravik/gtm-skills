---
name: gtm-account-research
description: Triggers when a user asks for an evidence-backed company brief or account research using a GTM context, supplied sources, or web access. Not for segmentation, scoring, lead research, ICP or persona authoring, CRM writes, or context setup.
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
