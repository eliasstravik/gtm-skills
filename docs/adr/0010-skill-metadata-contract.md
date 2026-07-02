# ADR 0010: Encode taxonomy and dependencies in skill metadata

## Status

Accepted

## Context

GTM Skills need to be discoverable, installable, composable, and eventually recommended based on user role, GTM function, company context, and workflow. Skill bodies can describe this in prose, but buried prose is hard for humans, validation scripts, README generators, or future recommendation systems to inspect.

The project already requires function tags, role tags, hard context prerequisites, composable dependencies, output persistence, and one-off/bulk support.

## Decision

Every MVP skill should include a standardized `metadata` block in its `SKILL.md` frontmatter.

Recommended shape:

```yaml
---
name: account-research
description: Use when ...
metadata:
  function_tags: [sales]
  role_tags: [sdr, bdr, ae]
  requires_context: [icps]
  composes: [account-segmentation, account-scoring]
  output_mode: ephemeral
  supports: [one-off, bulk]
---
```

Field meanings:

- `function_tags` — GTM functions the skill serves, such as `sales`, `marketing`, `revops`, `customer-success`, `partnerships`, `growth`.
- `role_tags` — roles the skill is relevant for, such as `sdr`, `bdr`, `ae`, `sales-ops`, `marketing-ops`, `cro`.
- `requires_context` — hard context prerequisites from the GTM Context Project, such as `context`, `icps`, `personas`, `scoring`.
- `composes` — other skills this skill may invoke or internally use to improve the result.
- `output_mode` — `durable`, `ephemeral`, or `mixed`.
- `supports` — supported operating modes, initially `one-off` and/or `bulk`.

Skill output sections still need to follow their domain output contracts. For research, scoring, and segmentation skills, ADR 0052 requires source provenance for important claims and decisions even when the metadata `output_mode` is `ephemeral`; ADR 0053 defines the lightweight provenance-entry format; ADR 0054 defines compact per-record provenance for bulk outputs; ADR 0055 defines bulk run-level summaries; ADR 0056 defines standard result confidence, reasoning, and review fields; ADR 0057 keeps review explanation in `reasoning` instead of a separate field; ADR 0058 starts human review for new low-confidence results; ADR 0059 gates automated downstream actions on `needs_review`; ADR 0060 clears review gates by updating `needs_review` and `reasoning`; ADR 0061 separates automation eligibility from side-effect authorization; ADR 0062 keeps automation policy design out of MVP scope; ADR 0063 requires side-effect preview and confirmation in the MVP; ADR 0064 keeps previews summary-first; ADR 0065 requires post-action side-effect summaries; ADR 0066 keeps those summaries ephemeral by default; ADR 0067 requires file/section previews for durable GTM context writes; ADR 0068 auto-commits commit-safe durable GTM context writes; ADR 0069 keeps auto-commit failures non-blocking; ADR 0070 isolates auto-commit to current-action changes; ADR 0071 prohibits default auto-push; ADR 0072 defines assistive uncertainty previews; ADR 0073 defines recommended choices in uncertainty previews; ADR 0077 defines MVP bulk input scope.

Skills must preserve the Agent Skills spec requirements: `name` and `description` remain required, names remain lowercase/hyphenated, and descriptions must still clearly state when to use the skill. ADR 0076 defines the MVP skill definition of done, incorporating `/skill-creator` and `/writing-great-skills` quality gates.

## Consequences

- README and skills.sh grouping can be generated from metadata.
- Validation scripts can catch missing tags, unsupported dependency names, and output-mode mistakes.
- Future onboarding and recommendation flows can select skills by function, role, prerequisites, and mode.
- The metadata does not replace clear skill-body instructions; it makes the same contract machine-readable.
