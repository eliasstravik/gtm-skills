# Contributing

This repo is optimized for small, high-quality agent skills. A good contribution should make an agent better at a specific GTM workflow, not just provide generic business advice.

## Skill quality bar

Each skill should include:

1. **Clear trigger conditions** — when the agent should use the skill.
2. **Inputs and context** — what the agent needs before starting.
3. **Step-by-step workflow** — concrete actions, not vague guidance.
4. **Output contract** — what the agent should produce.
5. **Verification checks** — how the agent should know the work is good.
6. **Pitfalls** — common mistakes and how to avoid them.
7. **Related skills** — where the workflow composes with other GTM work.

## Suggested skill folder shape

```text
skills/<skill-name>/
  SKILL.md
  references/
  scripts/
  templates/
```

Only create support folders when the skill actually needs them.

## Writing principles

- Prefer concrete operator language over generic strategy language.
- Make instructions executable by an AI agent.
- Name the evidence required before making claims.
- Separate facts from assumptions.
- Keep each skill focused on one workflow or tightly related workflow family.
- Include examples only when they improve execution quality.
