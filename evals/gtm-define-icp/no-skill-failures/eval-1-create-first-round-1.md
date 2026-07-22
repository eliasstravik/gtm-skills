# No-skill failures — eval-1 create-first ICP, round 1

Run: `runs/baseline/round-1/eval-1-create-first-icp/` (`gpt-5.6-luna`,
`no_skill` arm). The run preserved the supplied facts, previewed before
writing, and committed only the new ICP. It still had to invent the first ICP
contract because no local example defined one.

## F1.1 — first ICP lacks stable identity and contract shape [critical]

The complete file begins, verbatim:

```markdown
# Distribution Operators

## Profile

Northern European electricity distribution operators with 100,000–1.5 million endpoints, internal field crews, at least three planning regions, and outage planning still coordinated in spreadsheets.

## Strong Buying Triggers
```

It has no `Identity` section, qualified label, or status. Its remaining
sections are `Disqualifiers`, `Evidence`, `Confidence`, `Review Plan`, and
`Open Questions`. Other fresh rounds invented still different shapes such as
`Summary`/`Firmographic and operational fit` and `Definition`/`Qualification
criteria`. Downstream segmentation, scoring, and research therefore cannot
read stable fields or distinguish same-id ICPs at different org altitudes.

## F1.2 — inherited open question was weakened

The source context asks whether municipal utilities below 100,000 endpoints
can support the integration. The new file reduces that to:

> Whether municipal utilities fit this profile remains open.

That preserves the topic but drops the threshold and integration constraint,
making the recorded uncertainty less useful than its source.

## F1.3 — resolved position never echoed

The run resolved project `aster-grid`, root org, and person `mina-alvarez`, but
never emits `Working in aster-grid/ as mina-alvarez` (the person's display name
would also be acceptable) before previewing or writing.
