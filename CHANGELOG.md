# Changelog

## Unreleased, gtm-lib v11

- Added `gtm-qualify`, the first domain skill, for bounded in-session qualification of people against personas and companies against ICPs with strict mode separation and no writes. Its authoring-time invariant places the numeric band mapping once, in Procedure.
- Session paid calls now allow exact-scope batch approval that states entities, capability, call count, effect, and stateable cost or explicitly says cost is not stateable; recurring or at-volume spend still graduates to `gtm-workflow`.
- ICP and persona descriptions now route saved-artifact qualification and scoring to `gtm-qualify`.
- New and fully researched member and persona artifacts now use the same eight-field person-data contract. Member email remains a separate supplied identifier and is never inferred.
- New and fully researched organization and ICP artifacts now use the same 13-field company-data contract, with explicit unknowns and separate employee-range, employee-count, location, and tech-stack shapes.
- GTM workspace creation can now skip member onboarding and continue directly to the sharing choice.
- Updated the pinned workflow runtime from beta.44 to beta.46 after the template suite passed on engine 22 and the forced webhook-resume probe passed on engine 24. The engine ceiling stays unchanged until the stable runtime declares support.

## gtm-lib v10, 2026-08-28

- Cloud inspection now requires a read-only credential and rejects data-changing statements, including writes hidden behind a common table expression.
- Untrusted workflow content reaches only model backends that can disable tools. Accepted ICP and persona content now participates in the model cache key.
- Cancellation keeps the duplicate-run guard closed until the runtime confirms the run stopped. A run can also register its own runtime ID after a route interruption.
- Error text is redacted before it reaches ledgers, run records, route responses, or command output.
- The paid-call ledger opens a pending entry before a request. It distinguishes reported, fixed, and projected cost, records zero-cost pre-call failures, and reconciles abandoned calls.
- Approval hooks are single-use, local restart recovery does not repeat active paid work, and spend or mutation commands require a human gate.
- Production starts require the exact accepted workspace commit. Missing, dirty, unpushed, or mismatched commits stop before a real run.
- Shared row execution now owns spend caps, checkpoint behavior, per-row failures, honest terminal states, remaining keys, and final bookkeeping.

## gtm-lib v9, 2026-08-27

- Preserved original provider responses for cache reparsing.
- Restored the local workflow runtime and made the paid-call ledger authoritative for run totals.

## Upgrade notes for older projects

| Installed library | User-visible reason to upgrade to v10 |
| --- | --- |
| v2 | No fixed workflow schema or committed migration path |
| v5 | No supported run cancellation |
| v6 | Web research evidence can be separated from the structured answer that needs it |
| v8 | Cached provider responses cannot be reparsed from the original payload, and run totals can diverge from the ledger |
| v9 | Read-only inspection, tool isolation, duplicate-run protection, context-aware caching, redaction, cost attribution, approval reuse, restart safety, and exact-commit starts are incomplete |
