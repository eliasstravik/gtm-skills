# gtmskills-mvp

A multi-skill package repository for guided GTM workflows.

## Install

List the skills available in this repository:

```sh
npx skills add <repo-path-or-url> --list
```

Install one skill by name:

```sh
npx skills add <repo-path-or-url> --skill gtm-context -g
```

## Repository structure

The repository has one deliberate seam:

- `skills/<name>/` is the shipping surface. Only files required when that skill runs belong there.
- `evals/<name>/` is development evidence. Test definitions, fixtures, harnesses, raw runs, benchmarks, and description optimization never belong under `skills/`.
- `scripts/` contains repository-level checks that apply across skills.

```text
skills/
└── gtm-context/
    ├── SKILL.md
    ├── references/
    └── templates/

evals/
└── gtm-context/
    ├── evals.json
    ├── fixtures/
    ├── scripts/
    ├── bare-core/
    ├── description/
    ├── evidence/
    └── runs/          # ignored raw execution output
```

Evaluation snapshots must not be named `SKILL.md`; that filename is reserved for installable skills under `skills/<name>/`.

## Adding another skill

1. Create `skills/<name>/SKILL.md` and only its runtime resources.
2. Create `evals/<name>/evals.json`, fixtures, and skill-specific evaluation scripts.
3. Put disposable executions in `evals/<name>/runs/`; commit only durable definitions and curated evidence.
4. Run `python3 scripts/check_repo_layout.py` and the skill validator before committing.

Extract shared evaluation machinery to `evals/_shared/` only after a second skill demonstrates real duplication.

## Current validation

`gtm-context` passes 28/28 artifact assertions with the skill versus 15/28 without it. Its Codex/GPT description classifier passes 60/60 trigger and near-miss runs. Curated results live in `evals/gtm-context/evidence/final/`.
