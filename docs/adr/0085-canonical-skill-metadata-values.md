# ADR 0085: Canonicalize skill metadata values in `docs/taxonomy.yaml`

## Status

Accepted

## Context

ADR 0010 defines the skill metadata contract but leaves several fields as examples rather than closed value lists. The metadata validator needs canonical values to catch typos, enforce the `gtm-` prefix, and keep README catalog generation deterministic.

Wayfinder ticket `T-002` asked for the closed lists and for one canonical location that both humans and scripts can read.

## Decision

Use `docs/taxonomy.yaml` as the canonical metadata value source.

Canonical `function_tags`:

- `sales`
- `marketing`
- `revops`
- `customer-success`
- `partnerships`
- `growth`

Canonical `role_tags`:

- `sdr`
- `bdr`
- `ae`
- `full-cycle-seller`
- `sales-ops`
- `marketing-ops`
- `cro`
- `vp-sales`
- `csm`
- `partnerships-lead`
- `founder`

Canonical `requires_context` keys:

- `context` - a resolved GTM Context Project with Organization, Active Person, and GTM Workspace context.
- `icps` - workspace `icps.md`.
- `personas` - workspace `personas.md`.
- `scoring` - workspace `scoring.md`.

`composes` values must resolve to actual `skills/gtm-*` folders in the repo.

`output_mode` and `supports` keep the values from ADR 0010:

- `output_mode`: `durable`, `ephemeral`, `mixed`.
- `supports`: `one-off`, `bulk`.

The helper scripts should parse `docs/taxonomy.yaml` with PyYAML when available and a narrow stdlib fallback for this simple YAML shape. The fallback is allowed because ADR 0082 makes helper scripts Python 3 stdlib-first with graceful degradation.

## Consequences

- The metadata validator can reject typos and unknown tags.
- Humans and scripts read the same taxonomy source.
- Future changes to canonical values must update `docs/taxonomy.yaml` and add a superseding ADR when they change this decision.
