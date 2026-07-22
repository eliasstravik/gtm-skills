# No-skill failures — eval-2 load-switch, round 1

Run: `runs/baseline/round-1/eval-2-load-switch/` (claude-fable-5, no_skill arm).
Overall: strong mechanical run — read AGENTS.md, used the canonical org path,
confirmed before writing, touched no repo files. The failures are all contract
knowledge a baseline cannot discover, which is the prove-need evidence.

## F2.1 — invented `state.json` schema (breaks cross-skill interop) [critical]

Contract shape: `{"active": "<project-id>", "projects": {"<id>": {"path":
..., "org": ..., "person": ...}}}`. The baseline wrote, verbatim:

```json
{
  "active": {
    "workspace": "copperline-logistics",
    "org": "freight",
    "person": "priya-raman"
  },
  "updated_at": "2026-07-21T00:00:00Z",
  "updated_by": "gtm-load (headless eval run)"
}
```

No `projects` map, no `path` — a downstream skill resolving
`state.json.projects[active].path` finds nothing. The agent itself flagged the
gap: "The state.json *schema* is not specified anywhere, only its location; I
chose a minimal `{active: {workspace, org, person}, updated_at, updated_by}`
shape."

## F2.2 — no resolved-position echo

The contract requires echoing `Working in <project>/<org-path>` plus `as
<person>` before acting. The transcript's action section and final overview
never emit the echo line; the overview opens with "Active context: Copperline
Logistics > freight sub-org, acting as Priya Raman" only after the write.

## F2.3 — workspace selection not presented as a numbered-list choice

Load flow lists workspaces as one numbered-list question labeled with the
`org.md` H1 and path, ending `Reply with a number, or type your answer.` The
baseline instead pre-selected and asked a yes/no confirmation, verbatim:

> You asked for Copperline Logistics — is `copperline-logistics` the workspace
> you mean?

## F2.4 — closing overview omits collection status and next skill

The contract's closing paragraph covers orgs, people, whether `icps/` and
`personas/` exist, and the natural next GTM skill. The baseline's overview
described company/org/person only — no mention that `icps/` and `personas/`
are absent, no `gtm-define-icp`/`gtm-define-personas` recommendation.
