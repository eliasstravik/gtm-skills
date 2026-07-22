# No-skill failures — later-round discoveries

Fresh `gpt-5.6-luna` no-skill runs continued after round 1 until a complete
round introduced no new user-facing failure class. These failures first became
visible in rounds 2–4.

## F4.1 — output-path escape during a run-local task [critical]

Three runs resolved an incorrect evidence or artifact path outside their
declared run directory. The strongest preserved example is round 3 eval 3: it
wrote the requested ICP under the rebuild repository root instead of the
run-local GTM home. The exact file was recovered into the run as:

`runs/baseline/round-3/eval-3-altitude-mismatch/stray-artifact__outside-run-path__eea-regional-banks.md`

Rounds 2 and 5 also wrote evidence to mistaken absolute/duplicated paths
before cleanup. A successful final target does not make transient writes
outside the authorized `$GTM_HOME` safe or honest.

## F4.2 — unresolved medium-confidence ICP marked approved [critical]

Round 3 eval 3 previewed, verbatim:

```text
- Qualified label: `eea-regional-banks`
- Status: approved
```

The same preview says the evidence is only medium confidence and the 200-seat
floor is provisional. User approval to write a draft is not evidence that the
ICP itself is validated; downstream tools must not receive a false approval
signal.

## F4.3 — summary substituted for the requested complete preview [critical]

Round 4 eval 3 showed only a field summary such as:

```text
Qualified label: `eea-regional-banks`

Offer: Regulated Support package

Account profile: EEA regional banks with 200–2,000 support seats, a dedicated risk or compliance owner, and a need for controlled support workflows plus audit exports.
```

It then wrote a 42-line Markdown file that had never been shown in full. This
breaks the explicit preview-before-write gate and hides the exact durable
artifact being approved.
