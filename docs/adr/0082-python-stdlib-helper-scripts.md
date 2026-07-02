# ADR 0082: Helper scripts are Python 3, stdlib-first, with graceful degradation

## Status

Accepted

## Context

ADRs 0075 and 0076 commit to optional-but-tested helper scripts (metadata validation, scaffold checks, CSV parsing) with no custom global CLI, but do not choose a language or dependency policy. Every skill inherits this choice. A hidden trap: the machine-readable index is `gtm.yaml`, and neither Python's nor Node's standard library parses YAML.

## Decision

Helper scripts are written in **Python 3, standard library only by default**.

- Python 3 is preinstalled on macOS and Linux, matches the skill-creator ecosystem, and covers CSV/JSON/path work with the stdlib. Bash is rejected (Windows users, string fragility); Node is rejected (cannot assume a runtime on a seller's laptop).
- `gtm.yaml` stays within the boring YAML subset: maps, strings, lists, scalars — no anchors, aliases, tags, or multi-document streams.
- Scripts that read YAML attempt `import yaml`; if PyYAML is unavailable they exit with a clear message that the agent should validate the structure directly. Per ADR 0075, scripts assist but never gate: agents read YAML natively, so a missing dependency degrades to agent-led validation instead of a hard failure.
- Convention: every script runs standalone (`python3 scripts/<name>.py <args>`), exits nonzero with a human-readable reason on failure, and requires no pip installs on the happy path.

The alternative — switching `gtm.yaml` to JSON — was rejected to preserve human editability of the index.

## Consequences

- One toolchain across all skills; helper scripts are testable in the eval loop (ADR 0080).
- PyYAML becomes a soft optional dependency, never a requirement.
- Windows support for helper scripts remains open fog; Python 3 is the least-bad starting point for it.
