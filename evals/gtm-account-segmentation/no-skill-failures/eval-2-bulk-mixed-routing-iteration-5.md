# Eval 2 — bulk baseline failures, iteration 5

Source: accepted fresh `gpt-5.6-terra` without-skill run. The full transcript remains in the gitignored workspace; failing evidence below is preserved verbatim.

## Correct routing in an improvised schema

The baseline used:

> Bulk summary: 4 accounts; 2 qualified; 2 `no-match`; 1 needs review.

Its table header was:

> | account | website | qualified label | basis | confidence | needs_review |

The four label assignments were correct, but the response omitted the literal five-field bulk summary, the fixed nine-field account rows, source reporting, alternative comparisons for matched rows, and closing metadata. Its attempted position line was also noncanonical:

> Working in OrbitPay/ as Samir Patel.
