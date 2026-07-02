# ADR 0051: Treat saved source links as starting evidence for later skills

## Status

Accepted

## Context

ADR 0047 says confirmed public/user-approved source links are saved in markdown context files, not as long lists in `gtm.yaml`. ADR 0048 classifies source links before saving them, ADR 0049 defines safe labels for omitted sensitive links, and ADR 0050 requires proposed safe labels to be previewed before they become durable context.

Saved source links and safe source labels are useful to later GTM skills. Account research can start with confirmed organization sources. Lead research can start with confirmed Person/profile sources. Scoring and segmentation can cite durable context that came from confirmed sources.

However, a saved source link is not permanent proof that a claim is true forever. Pages can change, become stale, conflict with newer sources, or have lower quality than primary sources.

## Decision

Saved source links should be treated as **starting evidence** for later research, scoring, and segmentation skills, not as guaranteed truth.

Rules:

1. `account-research` should use saved Organization, Workspace, Business Unit, and Team source links as places to look first.
2. `lead-research` should use saved Person profile/source links as places to look first.
3. Scoring and segmentation skills may cite durable context that came from confirmed source links.
4. Skills should still evaluate source freshness, source quality, and contradictions.
5. A saved source link should not override newer, better, or more authoritative evidence.
6. If saved source links conflict with current research, the skill should surface the conflict rather than silently choosing the old context.
7. Safe source labels can explain that private evidence existed, but they are weaker evidence than accessible source links because the agent cannot re-fetch the omitted URL.
8. Skills should distinguish between:
   - confirmed durable context,
   - source links that support it,
   - safe labels for omitted private sources,
   - newly found evidence,
   - unresolved open questions.
9. When a claim matters to scoring or segmentation, cite the actual evidence used where possible.
10. If evidence is stale, inaccessible, or contradictory, reduce confidence and ask for clarification or mark the issue as an open question according to the skill's workflow.

ADR 0052 defines the provenance that research, scoring, and segmentation outputs should cite when using saved source links or other evidence.

ADR 0053 defines the lightweight provenance-entry format and canonical source types used in those outputs.

ADR 0054 defines compact per-record provenance for bulk outputs that use saved source links or other evidence.

ADR 0056 defines result-level confidence, reasoning, and human-review fields for outputs using evidence.

ADR 0058 defines that low-confidence evidence judgments require human review when first generated.

ADR 0059 defines that review-gated evidence judgments should not drive automated downstream actions by default.

ADR 0060 defines that human review clears the gate by updating `needs_review` and `reasoning`, not by adding an override object.

ADR 0061 defines that `needs_review: false` is automation-eligible, not side-effect-authorized.

ADR 0062 keeps automation policy design out of scope for the MVP.

ADR 0063 requires preview and confirmation before MVP side effects execute.

ADR 0064 keeps Side-Effect Previews summary-first for bulk usability.

ADR 0065 requires post-action summaries after confirmed side effects execute.

ADR 0066 keeps post-action summaries ephemeral by default in the MVP.

ADR 0067 defines file/section previews for durable GTM context writes.

ADR 0068 defines auto-commit behavior for commit-safe durable GTM context writes.

ADR 0069 defines non-blocking auto-commit failure behavior for durable GTM context writes.

ADR 0070 defines auto-commit isolation from unrelated working-tree changes.

ADR 0071 defines that GTM context auto-commit does not auto-push by default.

ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.

## Consequences

- Later skills can reuse setup source work instead of rediscovering obvious sources.
- Saved sources improve traceability without becoming unquestioned facts.
- Research, scoring, and segmentation remain robust to stale or contradictory sources.
- Safe source labels remain useful context while preserving the fact that the underlying source cannot be revalidated automatically.
