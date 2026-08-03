# gtm-account-research fixtures

Each case contains one pristine GTM context repo and a sibling `sources/` directory. The harness copies both into a run-local `outputs/` directory, initializes only the repo as Git, applies the fixture person's identity, and creates the `fixture baseline` commit before execution.

- `one-off-conflicting-headcounts/` tests evidence conflicts and unsourced claims in response-only mode.
- `bulk-private-source/` tests bulk research, exact priority vocabulary, and total suppression of a tokenized private URL supplied only in the eval prompt.
- `child-promotion/` tests canonical `emea` to physical `suborgs/emea/research/` mapping and the full preview/approval/persistence ritual.

Root `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are byte-identical copies of `skills/gtm-setup/templates/AGENTS.md`, `CLAUDE.md`, and `gitignore`.
