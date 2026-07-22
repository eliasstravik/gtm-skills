# No-skill failures — eval-3 altitude mismatch, round 1

Run: `runs/baseline/round-1/eval-3-altitude-mismatch/`
(`gpt-5.6-luna`, `no_skill` arm). The run correctly detected that Regulated
Support belongs under `regulated`, obtained confirmation, previewed the full
file, and committed only that file.

## F3.1 — child-org qualified label omits its canonical org path [critical]

The created child ICP says, verbatim:

```markdown
## Identity

- Qualified label: `eea-regional-banks`
- Status: draft
```

At a child org the qualified label must be
`regulated/eea-regional-banks`. The bare file id collides with a root or
sibling ICP of the same id, defeating reliable downstream lookup in the
fractal context model. All five fresh altitude runs repeated this failure.

## F3.2 — corrected altitude never echoed as the working position

The run explains the root-to-`regulated` correction, but never emits `Working
in heliodesk/regulated as sana-ibrahim` before previewing and writing. The
active state remains pinned to root, so this transparency guard matters most
in exactly this flow.
