# gtm-account-scoring fixtures

These are pristine, read-only GTM context repos. Each run copies its named repo to `<run-dir>/outputs/<repo-name>/`, initializes the copy as Git, sets the fixture person's matching identity, stages every file including dotfiles, and commits `fixture baseline`. The copied repo or child org is the logical cwd for scoring. Runs never touch a real context repo or `~/.gtm`.

The harness records sorted SHA-256 manifests, exact HEAD, and worktree status before and after each run. Read-only success means byte-identical manifests, unchanged HEAD, and a clean status. Evidence stays outside the copied repo.

Root `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are byte-identical copies of `skills/gtm-setup/templates/`. No fixture contains nested Git metadata, machine state, a registry, a pin, a scoring file, a rubric, or a placeholder. All entities are fictional and domains use `example.com`.

## `one-off-strong-fit/signalforge/`

The industrial ICP exposes three explicitly named Fit Signals all satisfied by Helix Metals. Its maintenance note must not lower the fully evidenced account's confidence.

## `bulk-all-bands/orbitpay/`

Two visible ICPs and four accounts produce one result in every Band. Silver Birch has otherwise strong evidence but hits the named outsourced-ownership disqualifier, while Unknown Harbor arrives with the final upstream label `no-match`.

## `child-icp-precedence/cloudmason/`

The logical cwd is `suborgs/emea`. Its local `enterprise.md` overrides the root same-stem file and is the sole scoring basis for `emea/enterprise`, while root `mid-market.md` remains visible through inheritance.
