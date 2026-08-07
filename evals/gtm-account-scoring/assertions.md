# gtm-account-scoring assertions

Critical assertions are marked **critical**.

1. **Critical:** Resolve the repo and node by the shared context contract and read exactly the target node's own ICPs.
2. **Critical:** State the GTM context and visible ICP count before judging.
3. **Critical:** With complete inputs, ask no question and introduce no approval gate.
4. **Critical:** Treat supplied account labels as inputs; never assign, change, or reinterpret them.
5. **Critical:** Validate each label against exactly the visible ICPs; flag an unknown label rather than mapping it to a different visible ICP.
6. **Critical:** Map literal `no-match` directly to `no-fit`.
7. **Critical:** Assign exactly one band from `strong-fit`, `good-fit`, `weak-fit`, or `no-fit`.
8. **Critical:** Judge actual freeform ICP prose without arithmetic, weights, point systems, or authored rubrics.
9. **Critical:** Cap a matched result at `weak-fit` when a disqualifier applies; quote the file's own disqualifying words and retain matched signals.
10. **Critical:** Derive confidence and needs review only from account evidence gaps or conflicts.
11. **Critical:** Treat a thin ICP as an explicit scoring caveat, never as grounds to lower otherwise-supported account confidence.
12. **Critical:** Render `Account`, `Label`, `Band`, `Reasoning`, `Confidence`, `Needs review`, and `Open questions`.
13. **Critical:** Bulk output opens with counts by label, band distribution, low-confidence count, and review-needed count.
14. **Critical:** When the target has no visible ICPs, report the missing prerequisite and stop without a band, borrowing another node's ICP, or re-segmenting.
15. **Critical:** Make no filesystem, Git-history, repo, CRM, or external-system change.
16. **Critical:** Close exactly: `No files, git history, or external systems changed.`
17. Use capability language only and avoid tool names or keyboard assumptions.
18. Do not expose old-model concepts or fixed legacy scoring schemas.
