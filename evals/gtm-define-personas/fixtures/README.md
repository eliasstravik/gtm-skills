# gtm-define-personas fixtures

These are pristine, read-only GTM context repos. Every run copies its named repo to `<run-dir>/outputs/<repo-name>/`, initializes the copy as a git repo, sets the fixture person's matching git identity, stages every file including dotfiles, and commits `fixture baseline`. Runs operate with the copied repo as cwd and never touch a real context repo or `~/.gtm`.

Before the task, the runner records a sorted SHA-256 manifest for every copied fixture file outside `.git/`; after the task it records a second manifest. Only the approved target persona may differ. Eval 2 additionally captures the exact bytes from `## Call Notes` through EOF before and after the run and records both SHA-256 values outside the context repo.

The fixture root files `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are byte-identical copies of `skills/gtm-setup/templates/`. No fixture contains a nested `.git`, machine state, registry, pin, rubric, or placeholder. All organizations and people are fictional; domains use `example.com`.

## `create-first/northstar-water/`

Root-only context with one ICP and no `personas/` directory. Its exact org-level asset-manager question must flow into the first persona.

## `refine-existing/clearpath-payments/`

Root context with one ICP and one existing persona. The trailing human-authored `Call Notes` section is protected byte-for-byte.

## `altitude-mismatch/caregrid/`

The run starts at root, but Caseworker Enablement and the named qualified ICP belong to the `public-sector` child. A root ICP remains visible through inheritance.
