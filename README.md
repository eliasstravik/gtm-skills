# GTM Skills

AI agent skills for the full go-to-market motion.

This repository is a working library of reusable agent skills for sales, marketing, revenue operations, customer success, partnerships, and growth. The goal is to give AI agents practical operating knowledge for real GTM workflows: researching markets and accounts, building pipeline, writing outbound, analyzing funnels, improving retention, planning launches, and coordinating partner motions.

## What this is

Skills are small, composable instruction packages that teach an agent how to complete a specific workflow repeatably. Each skill should encode a proven operating pattern, the inputs it needs, the outputs it should produce, and the checks that keep the work grounded.

This repo is intended to be:

- **Portable** — distributed as a skills.sh-compatible Agent Skills library first, with optional helper scripts but no required custom global CLI for the MVP.
- **Practical** — focused on workflows GTM teams actually run.
- **Composable** — skills should reference shared context and each other where useful.
- **Evidence-seeking** — research, claims, and recommendations should cite their sources or explain assumptions.
- **Agent-native** — instructions should be actionable by coding agents and general-purpose AI agents, not just advice for humans.
- **Operator-grade** — every skill should include triggers, steps, pitfalls, and verification criteria.

## Initial scope

Planned skill domains include:

- GTM strategy and positioning
- ICP, persona, account, and lead research
- Sales development and outbound
- Account-based marketing and sales plays
- Content, campaigns, demand generation, and lifecycle marketing
- RevOps, CRM hygiene, pipeline analysis, and reporting
- Customer success, onboarding, expansion, and churn prevention
- Partnerships, ecosystem, affiliates, and co-selling
- Launch planning, growth experiments, and competitive intelligence

## Repository shape

```text
skills/
  <skill-name>/
    SKILL.md
    references/
    scripts/
    templates/
docs/
  project-brief.md
```

Each skill should be self-contained, but high-value skills can share reusable references, scripts, and templates.

## Status

Private project scaffold. The active implementation step is the foundation-first MVP slice: `gtm-setup`, `~/.gtm/registry.json` handling, context repo scaffolding, context resolution, skill metadata validation, and core templates before downstream GTM workflow skills.

All shipped skills must use the `gtm-` prefix and target skills.sh-compatible Agent Skill distribution first. Use the fictional Northstar Compliance scenario as the canonical demo/verification fixture.
