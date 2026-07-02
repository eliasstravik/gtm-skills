# ADR 0075: Portable Agent Skills first with optional helper scripts

## Status

Accepted

## Context

The project is intended to be distributed as a skills.sh-compatible GTM skill library. The MVP foundation slice includes some deterministic work — metadata validation, scaffold validation, template generation, and bulk input parsing — where scripts can reduce ambiguity and risk.

At the same time, making a custom global CLI the primary interface would make the MVP heavier, less portable, and easier to confuse with a SaaS app or agent plugin rather than an installable skill library.

## Decision

The MVP runtime and package target is portable Agent Skills first, with optional helper scripts where they materially improve reliability.

Rules:

1. The repository should remain installable as a normal skills.sh-compatible skill library.
2. Each skill's `SKILL.md` should be useful on its own to an agent and should not require a custom global CLI as the primary user interface.
3. Deterministic helper scripts are allowed under a skill's `scripts/` directory or shared project tooling when they materially reduce ambiguity, risk, or repetitive boilerplate.
4. Good MVP helper-script candidates include metadata validation, scaffold-shape validation, template generation, and CSV/bulk input parsing.
5. Helper scripts should support the skill instructions; they should not replace clear skill-body procedure, prerequisites, outputs, pitfalls, and verification steps.
6. A custom CLI can be considered later if repeated usage shows a clear need, but it is not part of the MVP's required user surface.

## Consequences

- skills.sh distribution remains the core product surface.
- The MVP stays portable across agent runtimes that understand Agent Skills.
- Foundation reliability can still benefit from deterministic scripts.
- Builders should avoid hiding essential workflow semantics inside scripts that agents or users cannot understand from the skill text.
