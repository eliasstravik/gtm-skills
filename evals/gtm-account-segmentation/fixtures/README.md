# gtm-account-segmentation fixtures

These are pristine, read-only GTM context repos. Each run copies its named repo to `<run-dir>/outputs/<repo-name>/`, initializes the copy as Git, sets the fixture person's matching identity, stages every file including dotfiles, and commits `fixture baseline`. The copied repo or child org is the logical cwd for segmentation. Runs never touch a real context repo or `~/.gtm`.

The harness records sorted SHA-256 manifests, exact HEAD, and worktree status before and after each run. Read-only success means byte-identical manifests, unchanged HEAD, and a clean status. Evidence stays outside the copied repo.

Root `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are byte-identical copies of `skills/gtm-setup/templates/`. No fixture contains nested Git metadata, machine state, a registry, a pin, a rubric, or a placeholder. All entities are fictional and domains use `example.com`.

## `one-off-root-match/signalforge/`

Two visible root ICPs make alternative reasoning checkable. The industrial ICP has an intentional maintenance note that must not lower confidence or create review work for the completely evidenced Helix Metals account.

## `bulk-mixed-routing/orbitpay/`

Two visible ICPs and four supplied accounts yield two exact matches, one explicitly disqualified high-confidence `no-match`, and one evidence-poor low-confidence `no-match` requiring review.

## `child-nearest-precedence/cloudmason/`

The logical cwd is `suborgs/emea`. Its local `enterprise.md` overrides the root same-stem file, while the root `mid-market.md` remains visible through inheritance.
