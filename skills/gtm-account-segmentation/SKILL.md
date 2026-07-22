---
name: gtm-account-segmentation
description: Triggers when a user asks to classify or segment accounts against visible ICPs in a GTM context repository.
---

# Segment Accounts

## Recipe

1. Resolve the supplied `$GTM_HOME/state.json` to the active project, canonical org path, and person; never access or modify `~/.gtm`, `state.json`, context files, or Git history.
2. Read and report the root-to-target `org.md` chain and every inherited or local ICP visible at the target; for same-stem collisions, the nearest file overrides the inherited one.
3. Emit `Working in <project>/<canonical-org-path> as <person>`, then normalize only the supplied account facts without enrichment or invention.
4. Assign each account exactly one existing visible qualified ICP label or `no-match`; preserve gaps and conflicts, and explain why the chosen label wins over plausible alternatives.
5. Calibrate confidence and `needs_review` from account-level evidence completeness and ambiguity, not from an ICP's general maintenance backlog.
6. For one-off work, return account, website, label, matched ICP display name, confidence, `needs_review`, reasoning, evidence, and open questions.
7. For bulk work, start with counts by label, low-confidence and review-needed counts, common evidence and open questions; then return every record once with website and all one-off fields.
8. Finish with project, canonical org path, mode, visible ICP source paths, prerequisite or gap status, and an explicit no-side-effects statement.

## Details

- The canonical org path is independent of the project and filesystem path: root is empty; a child is only nested org ids joined by `/`, excluding the project id and every literal `suborgs/`. Render the root working line as `Working in <project>/ as <person-id>` and report its canonical org path as `root (empty)`.
- Resolve visibility by file stem. Start with root `icps/*.md`, overlay each child altitude in order, and let the nearest same-stem file replace the inherited file; non-colliding inherited ICPs remain visible. Report repository-relative paths for selected, overridden, and still-visible alternatives.
- Before classification, emit `Sources read:` with every root-to-target `org.md` path in order and every visible ICP source path; at a child, naming only the canonical org path or the precedence outcome does not satisfy the source report.
- Emit the exact `Working in <project>/<canonical-org-path> as <person-id>` line immediately after resolving state and sources and before stating, implying, counting, or previewing any account classification; preliminary routing in a progress message violates this ordering.
- Treat an ICP's `Review Needs`, `Open Questions`, and evidence confidence as information about the ICP definition, not missing account facts. Set account `needs_review: true` only when supplied account evidence is conflicting or lacks a fact that could change its label; keep general ICP-maintenance questions separate. A matched account may have higher or lower confidence than the ICP definition.
- `no-match` means no visible ICP is currently supported. Use high confidence for an explicit disqualifier and low confidence plus review when material qualification facts are missing; do not force the least-bad ICP.
- In bulk output, compute summary counts from the completed rows, include every website and every required field in the visible final response, and keep common questions distinct from the per-account review count.
