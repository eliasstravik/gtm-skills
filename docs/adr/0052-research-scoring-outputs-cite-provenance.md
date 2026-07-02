# ADR 0052: Research, scoring, and segmentation outputs cite source provenance

## Status

Accepted

## Context

ADR 0051 defines saved source links as starting evidence for later research, scoring, and segmentation skills, not as guaranteed truth. Later skills need to reuse context while still being able to challenge stale, weak, or contradictory evidence.

If research, scoring, or segmentation outputs present conclusions without provenance, downstream skills and humans cannot tell which claims came from workspace definitions, saved source links, safe source labels, newly fetched sources, or unresolved assumptions. That makes outputs hard to audit, refresh, or compose.

## Decision

Research, scoring, and segmentation outputs should cite enough source provenance to explain important claims and decisions.

For research outputs, include an `Evidence used` or equivalent section:

```md
## Evidence used

- Organization website — product positioning
- Case studies page — proof points
- LinkedIn company page — company size / hiring signals
- Internal sales deck, provided during setup. Link not committed.
```

For scoring outputs, include score rationale with evidence and confidence:

```md
## Score rationale

Score: 82 / 100 — great-fit

Evidence:
- ICP match: fintech infrastructure, from workspace ICP definition.
- Timing signal: hiring for compliance operations, from LinkedIn jobs page.
- Proof relevance: similar customer case study, from organization case studies page.

Confidence: medium
Reason: company size source is stale / unclear.
```

For segmentation outputs, cite the criteria and evidence that led to the label:

```md
## Segmentation rationale

Segment: compliance-led fintech infrastructure

Evidence:
- ICP criterion: regulated fintech infrastructure, from workspace ICP definition.
- Account signal: SOC 2 and compliance operations hiring, from current careers page.

Confidence: high
```

Rules:

1. Cite provenance for important claims, score drivers, segmentation decisions, risks, disqualifiers, and recommended actions.
2. Distinguish workspace context, saved source links, safe source labels, newly found evidence, and unresolved open questions.
3. Use source labels that are human-readable and safe to show.
4. Do not print sensitive URLs, tokens, invite links, signed URLs, or unapproved private source details.
5. If a source was a safe label rather than an accessible URL, say so.
6. Include confidence when the output relies on stale, indirect, inaccessible, conflicting, or low-quality evidence.
7. If current evidence conflicts with saved context, surface the conflict explicitly.
8. Provenance does not make an ephemeral output durable; research briefs, scoring outputs, and segmentation outputs remain ephemeral unless the user promotes a durable learning.
9. Durable promoted learnings should retain or summarize the provenance needed to audit the claim later.

ADR 0053 defines the lightweight standard provenance format and canonical source types for these outputs.

ADR 0054 defines compact per-record provenance for bulk research, scoring, and segmentation outputs.

ADR 0055 defines run-level summaries for bulk research, scoring, and segmentation outputs.

ADR 0056 defines required result-level `confidence`, `reasoning`, and `needs_review` fields.

ADR 0057 defines that review explanation belongs in `reasoning`, not a separate `review_reasons` field.

ADR 0058 defines that new unreviewed low-confidence results start with `needs_review: true`.

ADR 0059 defines that `needs_review: true` gates automated downstream actions by default.

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

- Outputs become auditable and composable.
- Later skills can trust, challenge, or refresh specific evidence instead of treating outputs as opaque conclusions.
- Sensitive source handling remains consistent with setup link-safety decisions.
- Users can see why a score, segment, or research conclusion was produced.
