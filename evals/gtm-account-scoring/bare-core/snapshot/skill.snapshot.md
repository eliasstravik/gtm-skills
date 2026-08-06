---
name: gtm-account-scoring
description: Triggers when a user asks to score already-segmented accounts against ICP prose in a connected GTM context. Not for assigning labels, research, lead scoring, rubric authoring, numeric scoring, or repository management.
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
