# gtm-lead-research fixtures

Each case contains one pristine GTM context repo and a sibling `sources/` directory. The harness copies both into run-local `outputs/`, initializes only the repo as Git, applies the fixture person's identity, and creates the `fixture baseline` commit before execution.

- `one-off-title-conflict/` tests contradictory inspected titles plus unsourced user claims in response-only mode.
- `bulk-private-person-source/` tests bulk lead research, exact priority vocabulary, ancillary unverified claims, and total suppression of a tokenized person URL supplied only in the eval prompt.
- `child-promotion/` tests canonical `emea` to physical `suborgs/emea/research/leads/` mapping, the `people/` namespace boundary, and the full preview/approval/persistence ritual.

Root `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are byte-identical copies of `skills/gtm-setup/templates/AGENTS.md`, `CLAUDE.md`, and `gitignore`.
