# Skills

Each subdirectory in this folder should contain one GTM agent skill. Skill package names must use the `gtm-` prefix.

Expected shape:

```text
skills/gtm-<skill-name>/SKILL.md
```

Optional support files can live under:

- `references/` for longer background material
- `templates/` for reusable output templates
- `scripts/` for deterministic helpers that materially improve reliability, such as validation, scaffold checks, template generation, or CSV/bulk parsing
- `assets/` for static assets
- `evals/` for runnable eval definitions and harnesses

Each skill's `SKILL.md` should remain useful on its own to an agent. Helper scripts support the skill instructions; they should not become a required custom global CLI. Generated eval output belongs under `evals/results/` and should stay out of git.

## Definition of done

A skill is shippable only when it has:

- valid `SKILL.md` frontmatter with `name`, `description`, and the GTM metadata contract;
- an invocation-quality description with trigger language in the description;
- lean core instructions with checkable completion criteria;
- required context, blocking behavior, output contract, pitfalls/safety rules, and verification checklist;
- progressive disclosure for long references/examples and no unused bundled resources;
- at least one realistic example input and output;
- tested scripts when scripts are included;
- passing metadata/structure validation;
- provenance, `confidence`, `reasoning`, and `needs_review` for research/scoring/segmentation skills.

Before distributing a skill change, run the relevant eval harness and root validation instead of committing generated result artifacts.
