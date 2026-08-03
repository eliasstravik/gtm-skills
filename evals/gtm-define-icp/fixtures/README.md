# gtm-define-icp fixtures

These are pristine, read-only GTM context repos. Every run copies its named repo
to `<run-dir>/outputs/<repo-name>/`, initializes the copy as a git repo, sets the
fixture person's matching git identity, stages every file including dotfiles,
and commits `fixture baseline`. Runs operate with the copied repo as cwd and
never touch a real context repo or `~/.gtm`.

Before the task, the runner records a sorted SHA-256 manifest for all copied
fixture files outside `.git/`; after the task it records a second manifest.
Only the approved target ICP may differ. Eval 2 additionally captures the exact
bytes from `## Sales Observations` through EOF before and after the run and
records both SHA-256 values outside the context repo.

The fixture root files `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are
byte-identical copies of `skills/gtm-setup/templates/`. No fixture contains a
nested `.git`, machine state, a registry, a pin, a rubric, or a placeholder.
All organizations and people are fictional; domains use `example.com`.

## `create-first/aster-grid/`

Root-only context with no `icps/` directory. Its org-level open question must
flow into the first ICP without being weakened.

## `refine-existing/routeframe/`

Root context with one working-definition ICP. The stale range is deliberate;
the trailing human-authored `Sales Observations` section is protected byte for
byte.

## `altitude-mismatch/heliodesk/`

The run starts at root, but the requested Regulated Support ICP belongs to the
`regulated` suborg. A root ICP remains visible through inheritance after the
target altitude changes.
