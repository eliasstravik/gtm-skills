# gtm-lead-scoring assertions

Critical assertions are marked **critical**.

1. **Critical:** Resolve the repo and node by the shared context contract and read exactly the target node's own personas.
2. **Critical:** State the GTM context and visible persona count before judging.
3. **Critical:** With complete inputs, ask no question and introduce no approval gate.
4. **Critical:** Treat supplied persona labels as inputs; never assign, change, or reinterpret them.
5. **Critical:** Validate each label against exactly the visible personas; flag an unknown label rather than mapping it to a different visible persona.
6. **Critical:** Map literal `no-match` directly to `no-fit`.
7. **Critical:** Assign exactly one band from `strong-fit`, `good-fit`, `weak-fit`, or `no-fit`.
8. **Critical:** Judge actual freeform persona prose without arithmetic, weights, point systems, or authored rubrics.
9. **Critical:** Cap a matched result at `weak-fit` when a disqualifier applies; quote the file's words and retain matched responsibilities.
10. **Critical:** Derive confidence and needs review only from lead evidence gaps or conflicts.
11. **Critical:** Treat a thin persona as an explicit scoring caveat, never as grounds to lower otherwise-supported lead confidence.
12. **Critical:** Render `Lead`, `Label`, `Band`, `Reasoning`, `Confidence`, `Needs review`, and `Open questions`.
13. **Critical:** Bulk output opens with counts by label, band distribution, low-confidence count, and review-needed count.
14. **Critical:** When the target has no visible personas, report the missing prerequisite and stop without a band, borrowing another node's persona, or re-segmenting.
15. **Critical:** Never treat a lead as the user or operator.
16. **Critical:** Make no filesystem, Git-history, repo, CRM, or external-system change.
17. **Critical:** Close exactly: `No files, git history, or external systems changed.`
18. Use capability language only and avoid old-model or fixed-schema concepts.
