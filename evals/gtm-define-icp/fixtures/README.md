# gtm-define-icp fixtures

Pristine, read-only GTM homes. Every run copies one fixture into its own
`outputs/gtm-home/`, replaces `__RUN_DIR__` in the copied `state.json`, and
treats that copy as `$GTM_HOME`. The copied context repo is then initialized as
a git repo with one `fixture baseline` commit. The committed fixtures contain
no nested `.git` directories.

All companies and people are fictional and all domains use `.example.com`.

## create-first-home/

`aster-grid/` is a root-only context with no `icps/` directory. It supports the
first-ICP flow.

## refine-existing-home/

`routeframe/` has one root ICP with a deliberately stale size range and a
human-authored `Sales Observations` section. It supports the refinement flow.

## altitude-mismatch-home/

`heliodesk/` is pinned to root and has a `regulated` suborg. The requested bank
ICP fits that suborg's offer and constraints, not the company-wide root. A root
ICP exists to exercise inherited context after the target altitude is resolved.
