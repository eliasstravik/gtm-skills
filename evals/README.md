# Quality checks

Run the shared skill checks from the repository root:

```sh
python3 evals/run_quality.py
```

This command lints every `skills/*/SKILL.md` description, runs the deterministic matcher against `routing/cases.jsonl`, and validates every pinned-runtime workaround marker. Core routing cases must score at least 95%. Hard cases are printed for review but do not fail the command.

The description lint requires a positive `Triggers when` clause, an explicit `Not for` clause, no unapproved proper names, and no more than 1,024 characters. The proper-name rule keeps product names out of descriptions without maintaining a product list.

List the workarounds to review before a runtime upgrade:

```sh
python3 evals/run_quality.py --temporary
```

Each line reports the target package version, source location, and removal condition.

Run the quality runner's regression tests with:

```sh
python3 -m unittest evals/test_run_quality.py
```
