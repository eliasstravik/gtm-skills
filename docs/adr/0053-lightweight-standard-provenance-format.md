# ADR 0053: Use a lightweight standard provenance format

## Status

Accepted

## Context

ADR 0052 requires research, scoring, and segmentation outputs to cite source provenance for important claims and decisions. Provenance needs to be readable enough for humans, structured enough for downstream skills, and lightweight enough that outputs do not become academic bibliographies.

The output format should support both detailed evidence entries for important claims and compact inline evidence for simpler claims.

## Decision

Research, scoring, and segmentation outputs should use a lightweight standard provenance format.

For important or complex claims, use a structured evidence entry:

```md
Evidence:
- Claim: Hiring for compliance operations
  Source: LinkedIn jobs page
  Type: newly-found-evidence
  Freshness: current
  Confidence: medium
```

For simple claims, compact inline provenance is acceptable:

```md
- Hiring for compliance operations — LinkedIn jobs page; newly-found-evidence; current; medium confidence.
```

Canonical source types:

```text
workspace-context
saved-source-link
safe-source-label
newly-found-evidence
user-provided-context
open-question
```

Field guidance:

- `Claim` — the claim, signal, criterion, risk, disqualifier, or decision being supported.
- `Source` — a safe human-readable source label, URL label, context file, or safe source label.
- `Type` — one of the canonical source types above.
- `Freshness` — a short freshness note such as `current`, `recent`, `stale`, `unknown`, or `not-refetchable`.
- `Confidence` — `high`, `medium`, or `low`, based on source quality, freshness, directness, and contradictions.

Rules:

1. Prefer structured entries for score drivers, segmentation decisions, important risks, disqualifiers, and claims that may be challenged later.
2. Use compact inline provenance for short, low-complexity evidence lists.
3. Use the canonical source types so downstream skills can parse and reason about provenance.
4. Do not expose sensitive URLs, tokens, invite links, signed URLs, or private source details.
5. For safe source labels, use `Type: safe-source-label` and note `Freshness: not-refetchable` unless the underlying source can be safely rechecked.
6. For unresolved issues, use `Type: open-question` and keep confidence `low`.
7. If a current source conflicts with saved context, include both entries or explicitly describe the conflict.
8. The format is a default contract, not a rigid citation style; skills can adapt layout as long as the fields remain clear.

ADR 0054 defines how this format is compacted for bulk outputs while preserving per-record auditability.

ADR 0055 defines run-level summaries that aggregate provenance and confidence patterns across a bulk run.

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

- Outputs stay readable while giving downstream skills parseable evidence.
- Evidence can be compared, refreshed, or challenged without reverse-engineering prose.
- Provenance remains safe for private and sensitive sources.
- Research, scoring, and segmentation outputs can share one evidence vocabulary.
