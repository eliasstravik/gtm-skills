# Eval 2 — bulk baseline failures, iteration 5

Source: accepted fresh `gpt-5.6-terra` without-skill run. The full transcript remains in the gitignored workspace; failing evidence below is preserved verbatim.

## Letter bands and invented review gaps

The baseline table header was:

> | account | website | segment_label | band | confidence | needs_review | rationale |

Its Band values were:

> Band A
>
> Band B
>
> Band C
>
> Band D

For Kestrel and Unknown Harbor it emitted `medium`/`true` and `low`/`true`, even though explicit absent signals support Kestrel's qualitative judgment and `no-match` maps directly without investigation. It omitted the exact working line, named Fit Signal and Disqualifier columns, required metadata, exact distribution fields, and Git-history wording.
