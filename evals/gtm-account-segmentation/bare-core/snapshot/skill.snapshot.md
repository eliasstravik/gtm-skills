---
name: gtm-account-segmentation
description: Triggers when a user asks to classify or segment companies against ICPs in a connected GTM context. Not for scoring, research, ICP authoring, lead segmentation, or repository management.
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
