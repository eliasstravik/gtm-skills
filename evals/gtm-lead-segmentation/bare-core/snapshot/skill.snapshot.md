---
name: gtm-lead-segmentation
description: Triggers when a user asks to classify or segment individual leads against personas in a connected GTM context. Not for scoring, research, persona authoring, account segmentation, or repository management.
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
