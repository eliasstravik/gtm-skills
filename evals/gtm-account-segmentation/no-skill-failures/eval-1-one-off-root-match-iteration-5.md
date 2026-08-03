# Eval 1 — one-off baseline failures, iteration 5

Source: accepted fresh `gpt-5.6-terra` without-skill run. The full transcript remains in the gitignored workspace; failing evidence below is preserved verbatim.

## Correct label without the response contract

The baseline returned the correct label and confidence:

> `industrial-analytics-teams`
>
> Confidence: high
>
> needs_review: false

Its position output was only:

> Working position: repository root — Signalforge GTM context.

It omitted the exact working line, `Sources read:`, seven required one-off fields, all closing metadata, the display title, and the literal `1,800 employees` value.
