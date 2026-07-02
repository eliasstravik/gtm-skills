# ADR 0009: Use hard prerequisites and composable dependencies for skill composition

## Status

Accepted

## Context

The SDR/BDR MVP skills are related but should not force users to manually run every skill in sequence. For example:

- Account research can use account segmentation and account scoring when that improves the research output.
- Lead segmentation and lead scoring can be improved by account research, because company context changes how a person should be interpreted.
- Bulk workflows may need to run research, segmentation, and scoring together across many rows.

At the same time, some prerequisites are real blockers. Account work needs defined ICPs; lead work needs defined personas. Without those definitions, the skills cannot know what information is interesting or what counts as fit.

## Decision

GTM Skills will distinguish two dependency types:

### 1. Hard context prerequisites

A hard context prerequisite is durable context that must exist before a skill can do meaningful work.

Examples:

- `account-research`, `account-segmentation`, and `account-scoring` require defined ICPs.
- `lead-research`, `lead-segmentation`, and `lead-scoring` require defined personas.
- `account-scoring` requires an account segment.
- `lead-scoring` requires a lead/persona segment.

If a hard context prerequisite is missing, the skill must stop and route the user to the setup or definition skill that creates it.

### 2. Composable skill dependencies

A composable skill dependency is another skill or workflow that can be used internally to improve the result without forcing the user to invoke it separately.

Examples:

- `account-research` can run account segmentation and optionally account scoring inside the research workflow.
- `lead-research` can run lead segmentation and optionally lead scoring inside the research workflow.
- `lead-segmentation` and `lead-scoring` can use account research when account context would improve persona classification or fit evaluation.
- Bulk workflows can compose research, segmentation, and scoring in phases.

Composable dependencies should not block execution unless they expose a missing hard context prerequisite.

### Dependency trace

Skills that compose other skills should include a short dependency trace in the output:

```text
Dependency trace
- GTM project: google
- GTM workspace: google-cloud-smb-sdr
- Hard prerequisites: workspaces/google-cloud-smb-sdr/icps.md found, workspaces/google-cloud-smb-sdr/personas.md found
- Composed: account-segmentation, account-scoring
- Skipped: lead-research (not needed for account-level task)
```

## Consequences

- Users can ask for natural outcomes instead of manually invoking every skill.
- Skills remain modular and reusable while still supporting integrated workflows.
- Missing durable context fails fast with a clear route to setup.
- Outputs become more inspectable because they show which context and subflows were used.
- Future skills need a consistent way to declare prerequisites and composable dependencies in their instructions and metadata.
