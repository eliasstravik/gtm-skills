# gtmskills — repo conventions

The nine GTM skills, rebuilt from scratch (originally in `~/dev/gtmskills-new`,
ported here wholesale) on skill-creator (process authority: evals, baselines, viewer review, iteration,
description optimization) and skill-issue (form authority: one primitive, ≤20-line
core, earned Details, ≤100 body lines). Approved plan:
`~/.consultant/gtmskills-new-foundation/plan.md`.

## Layout

- `skills/<name>/` — shipping surface. Everything committed here reaches installers
  verbatim (`npx skills add` has no `.skillignore`). Nothing goes in a skill dir
  except what installers should receive.
- `evals/<name>/` — committed eval sources for that skill: prompts (`evals.json`),
  assertions, fixture companies (`fixtures/`).
- `evals/<name>/runs/` and `skills/*-workspace/` — generated evidence (run output,
  transcripts, benchmarks, viewer HTML). Gitignored, never committed.

## Process

- Skills are built with the vanilla skill-creator loop: with-skill vs no-skill
  baseline runs, graded assertions, eval viewer review, iterate until the client is
  happy / feedback is empty / progress stalls; then description optimization
  (trigger evals, `run_loop.py`), whose `best_description` is applied **verbatim**.
- skill-issue governs form: exactly one core primitive (≤20 body lines), bare-core
  test before any Details, Details earned only by assertions the bare core failed,
  overflow to references/scripts, ≤100 body lines.
- `agentskills validate` is not available on npm → the shipping gate is a recorded
  manual frontmatter check per skill (name/format only; the description field is
  owned by the trigger-eval optimizer and is never rewritten by hand).

## Declared deviation from skill-creator's default

`evals.json`, assertions, and fixtures live in `evals/<name>/`, never inside
`skills/<name>/`. skill-creator's default puts `evals/` inside the skill folder,
but this repo's installer ships everything committed under `skills/<name>/`
verbatim, so eval material there would ship to all agents. This is the only
process deviation; everything else follows skill-creator as written.

## Baseline purity

No-skill baseline arms run with a prompt that forbids invoking any installed
skill — once earlier rebuilt skills are installed user-wide, a "no-skill" run
could otherwise silently lean on a sibling and corrupt the prove-need evidence.
With-skill arms MAY use installed siblings (that is the real composed environment
being dogfooded) and are graded consistently on that basis. The grader checks run
transcripts for skill invocations and flags any contaminated baseline run.

## Interactive flows in evals

Eval executors are headless one-shot subagents, but several skills (gtm-setup
above all) ask one question at a time and preview before writing. Eval prompts
therefore embed the complete scenario plus a scripted "user replies" block the
subagent treats as the user's answers, in order. Assertions verify the skill
*asked* and *previewed* (the contract), not that live turns occurred. Client
sign-off of test prompts covers the reply script.

## Fixture isolation

Committed fixtures under `evals/<name>/fixtures/` are pristine and read-only.
Every eval run's prompt instructs the subagent to copy the fixture into its own
run directory (e.g. `<workspace>/iteration-N/<eval>/<arm>/outputs/gtm-home/`) and
treat that copy as `$GTM_HOME`, operating only there. This prevents parallel arms
racing on shared files, keeps the git tree clean across iterations, and lands the
mutated context where skill-creator's grader and viewer already look. Fixtures
are plain directories — no nested `.git`; where a skill's behavior needs a git
repo, the run prompt has the subagent `git init` its copy. Eval runs never touch
`~/.gtm` (the live context `~/.gtm/the-kiln` is off-limits).

Every eval subagent saves a run transcript (`transcript.md` in its run
directory) — the grader's contamination check and the viewer depend on it. Name
eval directories `eval-<ID>-<descriptive-name>` (satisfies skill-creator's
descriptive-names instruction and `aggregate_benchmark.py`'s `eval-*` glob).

## Install

After each skill passes its done-gate:

```bash
npx skills add /Users/eliasstravik/dev/gtmskills --skill <name> -g
```

`-g`/`--global` = user-level install (the verified 58-agent scope); without it the
CLI installs project-level.
