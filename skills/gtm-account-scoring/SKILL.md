---
name: gtm-account-scoring
description: Triggers when a user asks to score, rank, qualify, or prioritize accounts against an existing GTM account-scoring rubric.
---

# Score Accounts

## Recipe

1. Resolve the supplied `$GTM_HOME/state.json` to project, canonical org path, and person; never access or modify `~/.gtm`, state, context, Git, or external systems.
2. Validate each supplied `segment_label` as `no-match` or an exact visible qualified ICP label; do not re-segment, enrich, or invent labels.
3. From the segment's owning org, walk toward root and use the nearest `account-scoring.md`; if none exists, stop with a prerequisite report rather than inventing or writing a rubric.
4. Report the root-to-target org chain, segment source, and every considered scoring source, then emit `Working in <project>/<canonical-org-path> as <person-id>` before scoring.
5. Preserve supplied component ratings, map them to rubric points, show the addition, apply caps, and assign the exact rubric band.
6. Set confidence and `needs_review` from missing or conflicting scoring inputs, not merely from a submaximal component or evidence-quality rating.
7. For one-off work, return account, website, segment, components, raw/final score, band, confidence, review flag, positives, risks, action, reasoning, evidence, provenance, and open questions.
8. For bulk work, rank every record, then recompute from final scores the band distribution, average, low-confidence and review counts, common risks, and common questions.
9. Return scoring only in the response; persist no score artifact, and finish with project/org/mode/source/prerequisite metadata plus explicit no-side-effects status.

## Details

- Canonical org paths exclude the project id and literal `suborgs/`; root is empty. Before arithmetic, emit `Sources read:` with every root-to-target `org.md`, the exact segment ICP when matched, and every considered scoring file, then the exact working line; for root use `Working in <project>/ as <person-id>` and report `root (empty)` in metadata.
- Score confidence means confidence that the supplied inputs support the computed score. Complete explicit ratings may yield high confidence even when the rubric deliberately discounts a single-source component; set review only when an input is missing, conflicting, invalid, or could change the calculation. Do not invent account gaps that contradict supplied ratings.
- Apply rubric guardrails before adjectival component mappings: when `segment_label` is `no-match`, its segment-evidence points are always the rubric's `no-match` value regardless of a supplied high/medium/low adjective. Show the supplied adjective in provenance if useful, but never add its qualified-segment points; then apply the final-score cap.
- In every one-off response, including child precedence, label every field from Recipe 7 and separately state mode and prerequisite status. In bulk, include those fields per row before calculating distribution, average, and counts from final post-cap scores.
- In bulk, `Open questions` is a required field on every ranked record, including `None`; a portfolio-level common-questions list never substitutes for per-record open questions.
- Persist the complete final user-facing score under `## FINAL MESSAGE` in the transcript before ending; a source report or working-position line alone is never completion.
