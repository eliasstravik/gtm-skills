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

## Available skills

The repository ships nine installable skills:

- `gtm-context` — create, import, update, delete, and validate organization context repositories.
- `gtm-icp` — create, update, delete, and validate node-owned ICP artifacts.
- `gtm-persona` — create, update, delete, and validate node-owned persona artifacts.
- `gtm-account-segmentation` — assign account labels against visible ICP prose.
- `gtm-lead-segmentation` — assign lead labels against visible persona prose.
- `gtm-account-scoring` — score labeled accounts into fit bands.
- `gtm-lead-scoring` — score labeled leads into fit bands.
- `gtm-account-research` — produce evidence-backed, ephemeral company briefs.
- `gtm-lead-research` — produce evidence-backed, ephemeral person briefs.

## Repository structure

The repository has one deliberate seam:

- `skills/<name>/` is the shipping surface. Only files required when that skill runs belong there.
- `evals/<name>/` is development evidence. Test definitions, fixtures, harnesses, raw runs, benchmarks, and description optimization never belong under `skills/`.
- `scripts/` contains repository-level checks that apply across skills.

```text
skills/
└── <name>/
    ├── SKILL.md
    ├── references/
    └── templates/     # when required at runtime

evals/
└── <name>/
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

All nine skills pass the repository layout check and skill validator. Every description classifier uses Codex/GPT and passes 60/60 trigger and sibling-workflow near-miss runs.

| Skill | Artifact validation | Control |
| --- | ---: | ---: |
| `gtm-context` | 80/80 current; 28/28 curated | 15/28 curated |
| `gtm-icp` | 41/41 | 18/41 |
| `gtm-persona` | 41/41 | 16/41 |
| `gtm-account-segmentation` | 33/33 | 10/33 |
| `gtm-lead-segmentation` | 34/34 | 9/34 |
| `gtm-account-scoring` | 36/36 | 12/36 |
| `gtm-lead-scoring` | 36/36 | 10/36 |
| `gtm-account-research` | 37/37 | 12/37 |
| `gtm-lead-research` | 37/37 | 12/37 |

The `gtm-context` current result is its full extended regression suite; its existing curated row and the other eight rows are paired with-skill and no-skill benchmarks. Curated results live under each skill's `evals/<name>/evidence/final/` directory.
