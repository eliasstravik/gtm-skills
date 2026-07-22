# Round 5 — saturation check (no new failure classes)

Round 5 reran all three tasks in fresh no-skill contexts with
`gpt-5.6-luna` (`runs/baseline/round-5/`). Every user-facing failure maps to a
class already preserved from rounds 1–4, so the prove-need baseline is
saturated.

- **create first**: invented another first-ICP shape
  (`Summary`/`Confidence`/`Evidence`/`Firmographic and operational fit`) →
  F1.1; no resolved-position echo → F1.3. Its exact municipal-utility question
  was preserved this time, showing F1.2 is nondeterministic rather than fixed.
- **refine existing**: requested edits, custom section, unresolved question,
  full preview, and single-file commit were correct; no resolved-position echo
  → F2.1.
- **altitude mismatch**: correct org diagnosis, confirmation, physical child
  path, full preview, draft status, and single-file commit; child qualified
  label still `eea-regional-banks` instead of
  `regulated/eea-regional-banks` → F3.1; no working-position echo → F3.2.
- **path safety**: the create run briefly wrote evidence under a duplicated
  repository path before removing it → F4.1.

No fifth-round observation requires a new behavioral assertion.
