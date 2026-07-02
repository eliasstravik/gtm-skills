# ADR 0084: ADRs are amended only by superseding ADRs; eval evidence is sufficient grounds

## Status

Accepted

## Context

Roughly ADRs 0041–0073 specify interaction UX — previews, confirmations, clarification loops, auto-commit semantics, summary formats — for skills that have never executed. Some will not survive contact with real sessions. ADR 0023 was already superseded (by ADR 0081) purely through further design thinking; the eval loop (ADR 0080) will contradict more. Without a written amendment rule, the record either rots through silent drift or ossifies into bureaucracy.

## Decision

- ADRs are binding **until implementation or eval evidence contradicts them**. The fix is always a **superseding ADR** — never silent drift. The old ADR gets `Status: Superseded by ADR 00XX` and stays in place.
- **Eval evidence is sufficient grounds** to supersede a behavioral ADR: if the skill-creator loop shows an interaction pattern hurting transcript quality or violating a budget assertion, that alone justifies the change.
- **Safety invariants are ring-fenced.** The never-commit-secrets family (ADRs 0047–0050), commit-safety and isolation rules (0068, 0070), `needs_review` gating (0058–0061), and no-auto-push (0071) are load-bearing invariants, not UX guesses. They may be amended only with explicit human sign-off recorded in the superseding ADR — eval evidence alone ("users find the preview annoying") is insufficient.

## Consequences

- The decision record stays alive instead of becoming archaeology.
- Implementation sessions may propose superseding ADRs freely, but must write them; drift discovered without one is a defect.
- A future eval-driven UX simplification cannot silently erode a safety property.
