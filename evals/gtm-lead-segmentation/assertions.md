# gtm-lead-segmentation assertions

Critical assertions are marked **critical**.

1. **Critical:** Resolve a named repo before environment connection or `~/.gtm` enumeration; resolve a named node for the invocation.
2. **Critical:** With complete inputs, ask no question and introduce no approval gate.
3. **Critical:** Read exactly the target node's own `personas/*.md`, never root, ancestor, sibling, or descendant personas.
4. **Critical:** State `Using GTM context: <display name> — <N> personas visible` before judging, with singular grammar for one.
5. **Critical:** When more than one node carries personas and no node is named, ask one directly rendered bold question with numbered options, option 1 recommended, and the exact reply line; never use `AskUserQuestion`.
6. **Critical:** When exactly one node carries personas, use it without asking; when the named/default node has none, report the missing prerequisite and stop without inventing definitions.
7. **Critical:** Treat leads as people, never as the operator or user, and use supplied facts only without enrichment.
8. **Critical:** Assign every lead exactly one qualified visible persona label or literal `no-match`.
9. **Critical:** Use bare root slugs and `<org-path>/<slug>` suborg labels with physical `suborgs/` segments omitted.
10. **Critical:** Judge actual freeform persona prose; weigh responsibilities, authority, and scope over title; apply disqualifiers wherever they appear.
11. **Critical:** Cite the winning persona's own language and name plausible losing visible alternatives; explicitly say when none exists.
12. **Critical:** Render compact fixed fields for each item: `Lead`, `Label`, `Reasoning`, `Confidence`, `Needs review`, and `Open questions`.
13. **Critical:** Restrict confidence to `high`, `medium`, or `low`; make needs review unambiguous.
14. **Critical:** Bulk output opens with counts by label plus low-confidence and review-needed counts, and includes every lead once.
15. **Critical:** Make no filesystem, Git-history, repo, CRM, or external-system change.
16. **Critical:** Close exactly: `No files, git history, or external systems changed.`
17. Use capability language only and avoid tool names or keyboard assumptions.
18. Do not expose old-model concepts: cwd-derived position, operator/git identity, `Working in`, inheritance, nearest-wins, shadowing, fixed old schemas, promotion, or `state.json`.
