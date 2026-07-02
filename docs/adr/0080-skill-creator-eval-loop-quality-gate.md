# ADR 0080: The skill-creator eval loop is the mechanical quality gate

## Status

Accepted

## Context

ADR 0076 defines the MVP skill definition of done but does not define the machinery that verifies it. Without a mechanical gate, "tested" degrades to a manual checklist, and prose contracts (78 ADRs, CONTEXT.md, SKILL.md bodies) can drift apart undetected.

The `/skill-creator` skill provides a concrete loop: draft the skill, write test-case prompts in `evals/evals.json`, run them, draft quantitative assertions, review results with the eval viewer, and iterate. `/writing-great-skills` provides the authoring style bar.

## Decision

Every MVP skill is authored and verified through the skill-creator eval loop, with writing-great-skills as the style guide.

- Each skill folder carries `evals/evals.json` with realistic test-case prompts and quantitative assertions.
- The Northstar Compliance fixture (ADR 0078) is the shared scenario source for eval prompts; it is built as real files in this repository, not left as a described concept.
- Deterministic behaviors (scaffold shape, registry contents, idempotent re-run, `.gitignore` rules) are checked by scripted assertions; judgment-heavy outputs (research briefs, scoring reasoning) use rubric-style eval review.
- Cross-skill invariants become eval assertions where possible — for example, `no-match` segmentation must never score above 49 (ADR 0006), and the `gtm-setup` fast path must stay within its interaction budget (ADR 0081).

A skill is shippable only when its evals pass and the ADR 0076 definition of done is met.

## Consequences

- The eval suite is the only mechanism that can falsify a prose spec; eval evidence is therefore grounds for superseding behavioral ADRs (ADR 0084).
- Building the fixture is a prerequisite of building `gtm-setup`, not an afterthought.
- Eval runs cost time and tokens; the trade is accepted because it is what separates a skill library from a prompt collection.
