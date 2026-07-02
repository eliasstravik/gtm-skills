# ADR 0083: skills.sh is the only distribution target; all skills use the `gtm-` prefix

## Status

Accepted

## Context

The README, project brief, and ADR 0075 call the library "skills.sh-compatible" without pinning down the install story. Candidate targets included the skills.sh convention, Claude Code plugin packaging, or both. Flat skills.sh installs share one global skill namespace with everything else a user has installed — exactly how the v1 `setup` collision described in ADR 0079 happened.

## Decision

**skills.sh is the only distribution target.** Plugin packaging (or any other channel) is out of scope — not deferred fog, simply not a goal.

- The repository's existing `skills/<name>/SKILL.md` layout is the distribution format; MVP distribution work is limited to making the repo public when ready plus a README install section.
- **Every skill name carries the `gtm-` prefix.** The ADR 0005 bundle is therefore named: `gtm-setup`, `gtm-define-icp`, `gtm-define-personas`, `gtm-account-research`, `gtm-lead-research`, `gtm-account-scoring`, `gtm-lead-scoring`, `gtm-account-segmentation`, `gtm-lead-segmentation`. Renaming installed skills is a breaking change forever, so the prefix is mandatory from the first shipped skill.
- The skills catalog section of the repo README is generated from SKILL.md frontmatter metadata (`function_tags`, `role_tags`), per ADR 0010, by a Python helper (ADR 0082).

## Consequences

- Zero packaging work in the MVP; effort goes into skill quality.
- The `gtm-` prefix guarantees no trigger-surface collision with the v1 skills or any third-party skill.
- ADR 0005's unprefixed skill names are amended by this ADR; the bundle contents are unchanged.
