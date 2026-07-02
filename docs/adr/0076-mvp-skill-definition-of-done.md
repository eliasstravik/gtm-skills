# ADR 0076: MVP skill definition of done

## Status

Accepted

## Context

The MVP should be a skills.sh-compatible GTM skill library, not a loose prompt collection. ADR 0075 keeps the package target as portable Agent Skills first, with optional helper scripts when they improve reliability.

The skill quality bar should follow the best practices from `/skill-creator` and `/writing-great-skills`: skills are concise onboarding guides for agents, descriptions do invocation work, `SKILL.md` stays lean through progressive disclosure, deterministic scripts are used when reliability matters, and each skill optimizes for predictable process rather than verbose instruction.

## Decision

An MVP skill is shippable only when it satisfies this definition of done.

### 1. Valid package shape

- Folder name matches the skill name.
- Skill name is lowercase, hyphenated, and under 64 characters.
- `SKILL.md` exists and has valid YAML frontmatter.
- Frontmatter preserves Agent Skills compatibility with at least `name` and `description` as clear single-line fields.
- The GTM `metadata` block required by ADR 0010 is present in the project-approved shape and passes validation.
- No placeholder files, unused resource directories, or extraneous skill-local docs such as ad hoc README, changelog, or installation-guide files are present unless they are intentional bundled resources.

### 2. Invocation-quality description

- The description states what the skill does and when to use it.
- Trigger language lives in the description, not only in the body.
- The description is pruned for context load: one trigger per branch, no duplicate synonym branches, and no identity prose that belongs in the body.
- The leading word or core concept is front-loaded when it improves invocation.

### 3. Lean, predictable `SKILL.md`

- `SKILL.md` contains the core workflow, not every detail.
- The body uses imperative/infinitive instructions and enough domain context for another agent to execute the workflow.
- Steps have checkable completion criteria so the agent can tell done from not done.
- The skill names hard context prerequisites and what blocks execution when they are missing.
- The skill distinguishes blocking prerequisites from optional/composable dependencies.
- The body includes output contract, pitfalls/safety rules, and verification checklist.
- The skill avoids no-op advice, duplicated rules, stale sediment, and sprawling prose.

### 4. Progressive disclosure and bundled resources

- Detailed reference material moves to `references/` with clear context pointers from `SKILL.md`.
- Long examples can live in `references/examples.md`, but `SKILL.md` must point to them and say when to load them.
- Deterministic helpers live in `scripts/` only when they materially reduce ambiguity, risk, or repeated boilerplate.
- Assets live in `assets/` only when they are used in outputs.
- References stay one level deep from `SKILL.md` where practical.
- Each bundled resource is either used, linked, or removed.

### 5. Examples and verification

- The skill includes at least one realistic example input and example output, either inline if short or behind a clear reference pointer if long; MVP examples should use the canonical Northstar Compliance demo fixture when practical.
- Foundation skills include a deterministic validation path.
- Scripts are actually run on representative inputs before the skill is considered done.
- The skill passes the repo's metadata/structure validator and any skills.sh/package validation available for the target runtime.

### 6. GTM-specific output requirements

- Research, scoring, and segmentation skills include provenance, `confidence`, `reasoning`, and `needs_review` in their output contract.
- Bulk-capable skills define one-off and bulk behavior separately when the process or output differs; MVP bulk mode means CSV/table-file inputs, not native CRM or spreadsheet integrations.
- Side-effecting skills follow the preview, confirmation, recommended-choice, execution-summary, and durable-context rules from ADRs 0063 through 0073.

## Consequences

- Builders have a concrete quality gate before implementing or reviewing MVP skills.
- The library remains operator-grade and predictable instead of becoming a broad prompt dump.
- Skill bodies stay concise while still exposing examples, references, scripts, and templates when useful.
- Validation work becomes part of the build, not a cleanup task after skills are written.
