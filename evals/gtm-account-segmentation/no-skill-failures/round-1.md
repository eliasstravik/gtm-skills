# No-skill failures — round 1

Fresh `gpt-5.6-luna` runs, one per eval, with all skills forbidden.

## F1 — one-off contract and metadata were incomplete

The result classified correctly but omitted the exact working-position line,
project/org/person metadata, source paths, the supplied website as a result
field, and a distinct `open_questions` field:

> Matched ICP: `industrial-analytics-teams` (Industrial Analytics Teams)
>
> Confidence: high
>
> `needs_review`: false

This demonstrates that correct classification alone does not establish the
workflow or output contract.

## F2 — bulk metadata was incomplete

The routing labels and counts were correct, but the run omitted the exact
working-position line, project/org/person metadata, source paths, websites from
the per-record output, and an explicit no-side-effects statement in the final
message.

## F3 — child result dropped required context

The classifier correctly selected `emea/enterprise`, but its final response was
only:

> Label: `emea/enterprise`
>
> - Evidence: EEA-regulated digital bank; 1,200 employees; dedicated
>   cloud-controls team; active DORA remediation; operations in Estonia, Latvia,
>   and Lithuania.
> - Confidence: High
> - Needs review: Yes — validate the ICP upper bound.
> - Open questions: Whether insurers follow the same path.
> - Side effects: None.

It omitted project/org/person metadata, visible-source paths, and the explicit
nearest-file source report in the final answer. Its required transcript also
failed to capture that final message, showing unstable delivery of the contract.
