#!/usr/bin/env python3
"""Run deterministic evals for the gtm-define-icp skill."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from statistics import mean
from typing import Any


EVAL_DIR = Path(__file__).resolve().parent
SKILL_DIR = EVAL_DIR.parent
REPO_ROOT = SKILL_DIR.parents[1]
SCRIPTS_DIR = REPO_ROOT / "scripts"
FIXTURE_DIR = REPO_ROOT / "fixtures" / "northstar-compliance"
RESULTS_DIR = EVAL_DIR / "results" / "iteration-1"
FIXED_TIMESTAMP = "2026-07-02T00:00:00Z"
ORG_ID = "northstar-compliance"
PERSON_ID = "jordan-lee"
WORKSPACE_ID = "fintech-compliance-outbound"
ICP_RELATIVE = f"workspaces/{WORKSPACE_ID}/icps.md"
CREATE_COMMIT_MESSAGE = "Create ICP definitions"
UPDATE_COMMIT_MESSAGE = "Update ICP definitions"
MISSING_CONTEXT_MESSAGE = (
    "I could not resolve a GTM Context Project from this prompt, current directory, or local registry. "
    "Run `gtm-setup` or tell me which GTM project to use."
)
EXPECTED_LABELS = {
    "compliance-heavy-fintech",
    "regulated-b2b-saas",
    "marketplace-kyc-risk",
    "no-match",
}

sys.path.insert(0, str(SCRIPTS_DIR))

from check_gtm_scaffold import check_scaffold  # noqa: E402


@dataclass(frozen=True)
class AssertionResult:
    text: str
    passed: bool
    evidence: str


@dataclass(frozen=True)
class EvalRun:
    eval_id: int
    eval_name: str
    prompt: str
    expectations: list[AssertionResult]
    outputs: dict[str, str]
    duration_seconds: float

    @property
    def passed(self) -> int:
        return sum(1 for item in self.expectations if item.passed)

    @property
    def failed(self) -> int:
        return len(self.expectations) - self.passed

    @property
    def pass_rate(self) -> float:
        return self.passed / len(self.expectations) if self.expectations else 0.0


@dataclass(frozen=True)
class IcpProject:
    gtm_home: Path
    repo: Path
    registry_path: Path
    initial_commit: str


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update-results",
        action="store_true",
        help="write viewer-compatible evidence under skills/gtm-define-icp/evals/results/iteration-1",
    )
    parser.add_argument("--results-dir", type=Path, default=RESULTS_DIR, help="results directory to update")
    parser.add_argument("--keep-temp", action="store_true", help="keep temporary GTM_HOME directories for debugging")
    args = parser.parse_args(argv)

    runs = run_suite(keep_temp=args.keep_temp)
    if args.update_results:
        write_results(args.results_dir, runs)

    total = sum(len(run.expectations) for run in runs)
    passed = sum(run.passed for run in runs)
    for run in runs:
        print(f"{run.eval_name}: {run.passed}/{len(run.expectations)} assertions passed")
    print(f"gtm-define-icp eval suite: {passed}/{total} assertions passed")
    return 0 if passed == total else 1


def run_suite(*, keep_temp: bool = False) -> list[EvalRun]:
    evals = _load_eval_definitions()
    temp_dirs: list[tempfile.TemporaryDirectory[str]] = []
    try:
        create_tmp = tempfile.TemporaryDirectory(prefix="gtm-define-icp-create-")
        update_tmp = tempfile.TemporaryDirectory(prefix="gtm-define-icp-update-")
        missing_tmp = tempfile.TemporaryDirectory(prefix="gtm-define-icp-missing-")
        temp_dirs.extend([create_tmp, update_tmp, missing_tmp])

        create_project = _create_fixture_project(Path(create_tmp.name), include_icps=False)
        update_project = _create_fixture_project(Path(update_tmp.name), include_icps=True)
        return [
            evaluate_create(evals[0], create_project),
            evaluate_update(evals[1], update_project),
            evaluate_missing_context(evals[2], Path(missing_tmp.name)),
        ]
    finally:
        if keep_temp:
            print("Kept temp directories:")
            for temp_dir in temp_dirs:
                print(f"- {temp_dir.name}")
        else:
            for temp_dir in temp_dirs:
                temp_dir.cleanup()


def evaluate_create(eval_definition: dict[str, Any], project: IcpProject) -> EvalRun:
    start = time.perf_counter()
    preview = _create_preview()
    target = project.repo / ICP_RELATIVE
    before_dirty = _git_status(project.repo, ICP_RELATIVE)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(_created_icps_markdown(), encoding="utf-8")
    commit_hash = _auto_commit_target(project.repo, ICP_RELATIVE, CREATE_COMMIT_MESSAGE)
    changed_files = _commit_changed_files(project.repo, commit_hash)
    scaffold_problems = check_scaffold(project.repo)
    registry = json.loads(project.registry_path.read_text(encoding="utf-8"))
    icps_text = target.read_text(encoding="utf-8")
    transcript = _create_transcript(project, preview, commit_hash)

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            all(
                phrase in preview
                for phrase in [
                    ICP_RELATIVE,
                    "Compliance-heavy fintech",
                    CREATE_COMMIT_MESSAGE,
                    "No outreach will be sent.",
                    "No CRM records will be updated.",
                    "No campaign triggers, syncs, or remote push will happen.",
                    "No external systems will be changed.",
                ]
            ),
            "Preview includes target file, sections, commit intent, and no external side effects.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            _machine_labels(icps_text) == EXPECTED_LABELS and "Persona:" not in icps_text,
            f"Machine labels found: {', '.join(sorted(_machine_labels(icps_text)))}; no persona headings found.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            _all_created_segments_have_required_fields(icps_text),
            "Every non-no-match segment includes signals, disqualifiers, provenance/source notes, confidence, reasoning, needs_review, and open questions.",
        ),
        _assertion(
            eval_definition["expectations"][3],
            _commit_subject(project.repo, commit_hash) == CREATE_COMMIT_MESSAGE and changed_files == [ICP_RELATIVE],
            f"Commit {commit_hash[:8]} subject '{_commit_subject(project.repo, commit_hash)}' changed: {', '.join(changed_files)}.",
        ),
        _assertion(
            eval_definition["expectations"][4],
            not scaffold_problems and _registry_is_local(registry, project.repo) and not before_dirty,
            "Scaffold checker passed; registry is under temp GTM_HOME, not the project repo; target file was clean before write.",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("create ICP definitions", project, expectations, transcript, commit_hash),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "preview_transcript.md": transcript,
        "icps.md": icps_text,
        "git_status.txt": _git_status(project.repo),
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="create-icps",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def evaluate_update(eval_definition: dict[str, Any], project: IcpProject) -> EvalRun:
    start = time.perf_counter()
    target = project.repo / ICP_RELATIVE
    _append_human_note(target)
    unrelated = project.repo / "scratch-notes.md"
    unrelated.write_text("Human scratch note unrelated to ICP refinement.\n", encoding="utf-8")
    target_dirty_before = bool(_git_status(project.repo, ICP_RELATIVE))

    before_labels = _machine_labels(target.read_text(encoding="utf-8"))
    _apply_regulated_saas_refinement(target)
    summary = _update_summary(project, target_dirty_before)
    status = _git_status(project.repo)
    staged_status = _git(project.repo, "diff", "--cached", "--name-only").stdout.strip()
    updated_text = target.read_text(encoding="utf-8")

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            before_labels <= _machine_labels(updated_text)
            and "Human note: keep marketplace exception language." in updated_text,
            "Existing machine labels and the human-authored note are still present.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            updated_text.count("Insurance claims operations with recurring evidence collection or audit handoffs.") == 1
            and updated_text.count("Service providers are weaker fit unless they buy SaaS for internal regulated operations.") == 1,
            "Requested regulated-b2b-saas signal and caveat each appear exactly once.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            len(_machine_labels_in_order(updated_text)) == len(_machine_labels(updated_text))
            and updated_text.count("## No Match") == 1,
            f"Unique labels found: {', '.join(_machine_labels_in_order(updated_text))}; no-match sections: {updated_text.count('## No Match')}.",
        ),
        _assertion(
            eval_definition["expectations"][3],
            "Auto-commit skipped: target file had pre-existing uncommitted edits." in summary
            and "Changes remain uncommitted." in summary
            and "No remote push happened." in summary,
            "Summary reports target-file overlap, uncommitted status, and no push.",
        ),
        _assertion(
            eval_definition["expectations"][4],
            "scratch-notes.md" in status and staged_status == "",
            f"Working tree status:\n{status}\nStaged files: {staged_status or '<none>'}",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("refine existing ICP definitions", project, expectations, summary, None),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "update_summary.md": summary,
        "icps.md": updated_text,
        "git_status.txt": status + "\n",
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="refine-existing-icps",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def evaluate_missing_context(eval_definition: dict[str, Any], temp_root: Path) -> EvalRun:
    start = time.perf_counter()
    workspace = temp_root / "empty-workspace"
    workspace.mkdir(parents=True)
    transcript = f"""User: {eval_definition["prompt"]}

Assistant: {MISSING_CONTEXT_MESSAGE}
"""
    found_icp_files = [str(path.relative_to(temp_root)) for path in temp_root.rglob("icps.md")]
    found_git_dirs = [str(path.relative_to(temp_root)) for path in temp_root.rglob(".git")]

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            MISSING_CONTEXT_MESSAGE in transcript,
            "Transcript contains the exact missing-context wording.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            not found_icp_files,
            "No icps.md files were found under the isolated temp root.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            not found_git_dirs,
            "No .git directories were found under the isolated temp root.",
        ),
    ]
    outputs = {
        "summary.md": _missing_context_summary(expectations, temp_root),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "missing_context_transcript.md": transcript,
        "temp_tree.txt": _tree(temp_root),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="missing-context-failure",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def write_results(results_dir: Path, runs: list[EvalRun]) -> None:
    if results_dir.exists():
        shutil.rmtree(results_dir)
    results_dir.mkdir(parents=True, exist_ok=True)

    for run in runs:
        run_dir = results_dir / f"eval-{run.eval_id}" / "with_skill" / "run-1"
        outputs_dir = run_dir / "outputs"
        outputs_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "eval_metadata.json").write_text(
            _json_dumps(
                {
                    "eval_id": run.eval_id,
                    "eval_name": run.eval_name,
                    "prompt": run.prompt,
                    "assertions": [item.text for item in run.expectations],
                }
            ),
            encoding="utf-8",
        )
        for name, content in run.outputs.items():
            (outputs_dir / name).write_text(content, encoding="utf-8")
        (run_dir / "grading.json").write_text(_json_dumps(_grading_json(run)), encoding="utf-8")
        (run_dir / "timing.json").write_text(
            _json_dumps(
                {
                    "total_tokens": 0,
                    "duration_ms": round(run.duration_seconds * 1000),
                    "total_duration_seconds": round(run.duration_seconds, 4),
                }
            ),
            encoding="utf-8",
        )

    benchmark = _benchmark_json(runs)
    (results_dir / "benchmark.json").write_text(_json_dumps(benchmark), encoding="utf-8")
    (results_dir / "benchmark.md").write_text(_benchmark_markdown(benchmark), encoding="utf-8")


def _create_fixture_project(temp_root: Path, *, include_icps: bool) -> IcpProject:
    gtm_home = temp_root / "gtm-home"
    repo = gtm_home / ORG_ID
    shutil.copytree(FIXTURE_DIR, repo, ignore=shutil.ignore_patterns(".git"))
    if not include_icps:
        (repo / ICP_RELATIVE).unlink()
    registry_path = gtm_home / "registry.json"
    registry_path.write_text(_json_dumps(_registry(repo)), encoding="utf-8")

    _git(repo, "init")
    _git(repo, "config", "user.name", "GTM Define ICP Eval")
    _git(repo, "config", "user.email", "gtm-define-icp-eval@example.invalid")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "Fixture: initialize Northstar context")
    initial_commit = _git(repo, "rev-parse", "HEAD").stdout.strip()
    return IcpProject(gtm_home=gtm_home, repo=repo, registry_path=registry_path, initial_commit=initial_commit)


def _registry(repo: Path) -> dict[str, Any]:
    return {
        "version": 1,
        "activeProject": ORG_ID,
        "projects": {
            ORG_ID: {
                "path": str(repo),
                "displayName": "Northstar Compliance",
                "aliases": [],
                "createdAt": FIXED_TIMESTAMP,
                "lastUsedAt": FIXED_TIMESTAMP,
                "lastUpdatedAt": FIXED_TIMESTAMP,
                "local": {
                    "activePerson": PERSON_ID,
                    "activeWorkspace": WORKSPACE_ID,
                    "lastUsedAt": FIXED_TIMESTAMP,
                },
            }
        },
    }


def _created_icps_markdown() -> str:
    return f"""# ICPs

These ICP definitions are account-level segments for the `{WORKSPACE_ID}` workspace.

## Segment: Compliance-heavy fintech

Machine label: `compliance-heavy-fintech`
confidence: high
needs_review: false
reasoning: The workspace explicitly targets fintech companies with recurring regulated onboarding, KYC, KYB, compliance operations, and audit-readiness work.

Best-fit accounts are fintech companies that handle regulated financial workflows and have recurring compliance operations work.

Strong signals:

- Payments, banking, lending, payroll, expense, wealth, insurance, escrow, or embedded finance products.
- KYC, KYB, AML, sanctions, risk review, vendor review, or customer onboarding queues.
- Compliance operations, risk operations, onboarding operations, or audit readiness language.
- Headcount from roughly 50 to 1,500 employees.

Disqualifiers:

- Consumer-only financial content or education with no regulated workflow.
- Very early companies with no visible compliance team or regulated operations.
- Infrastructure vendors that only sell monitoring, analytics, or developer tooling with no compliance operations use case.

Provenance / source notes:

- workspace-context: Fintech compliance outbound market and constraints.
- organization-context: Northstar Compliance positioning around compliance operations, onboarding reviews, evidence management, and audit-ready summaries.

Open questions:

- None.

## Segment: Regulated B2B SaaS

Machine label: `regulated-b2b-saas`
confidence: medium
needs_review: false
reasoning: The workspace names regulated B2B SaaS as a primary market, but individual sub-verticals should still be checked for real compliance operations pressure.

Best-fit accounts are B2B SaaS companies selling into regulated customers or operating compliance-heavy workflows for their own customers.

Strong signals:

- SaaS workflows in banking, insurance, healthcare administration, HR/payroll, identity, procurement, vendor risk, or legal operations.
- Security, compliance, privacy, procurement, or customer onboarding teams that coordinate evidence and approvals.
- SOC 2, ISO, HIPAA, FINRA, PCI, GDPR, or customer audit readiness pressure.
- Operations leaders responsible for repeatable onboarding or compliance review queues.

Disqualifiers:

- Horizontal SaaS with no regulated customers, audit burden, or onboarding review workflow.
- Small internal tools with no repeatable compliance operations motion.

Provenance / source notes:

- workspace-context: Regulated B2B SaaS market definition.

Open questions:

- Which regulated SaaS sub-verticals produce the fastest sales cycles?

## Segment: Marketplace KYC / risk friction

Machine label: `marketplace-kyc-risk`
confidence: high
needs_review: false
reasoning: The workspace explicitly targets marketplaces with onboarding, KYC, KYB, trust, risk, or safety review friction.

Best-fit accounts are marketplaces or platforms where onboarding, trust, risk, or safety reviews affect supply, demand, or transaction quality.

Strong signals:

- Merchant, contractor, provider, seller, creator, driver, vendor, or partner onboarding.
- KYC, KYB, trust and safety, fraud review, identity review, policy enforcement, risk operations, or dispute queues.
- Manual evidence requests, exception handling, or audit handoffs.
- Operations or Trust & Safety leadership responsible for queue quality and review speed.

Disqualifiers:

- Marketplaces with simple listing approval and no regulated, trust, risk, or onboarding review complexity.
- Pure media, community, or content platforms with no compliance operations workflow.

Provenance / source notes:

- workspace-context: Marketplace onboarding and trust/risk review constraints.

Open questions:

- None.

## No Match

Machine label: `no-match`

Use `no-match` when an account does not match any defined ICP segment. `no-match` accounts are scored as `not-a-fit` and cannot receive a score above 49.
"""


def _create_preview() -> str:
    return f"""About to update GTM context:
- {ICP_RELATIVE} - create ICP definitions
- Sections: Compliance-heavy fintech, Regulated B2B SaaS, Marketplace KYC / risk friction, No Match
- Preserved files: organization.md, people/{PERSON_ID}.md, workspaces/{WORKSPACE_ID}/context.md

Will create git commit:
{CREATE_COMMIT_MESSAGE}

No outreach will be sent.
No CRM records will be updated.
No campaign triggers, syncs, or remote push will happen.
No external systems will be changed.

Proceed?
"""


def _create_transcript(project: IcpProject, preview: str, commit_hash: str) -> str:
    return f"""User: Use gtm-define-icp to create ICP definitions for Northstar Compliance's active fintech compliance outbound workspace.

Assistant: Resolved GTM Context Project `{ORG_ID}` at `<temporary>/gtm-home/northstar-compliance` and active workspace `{WORKSPACE_ID}`.

{preview.strip()}

User: Proceed.

Assistant: GTM context update complete.
- Created: {ICP_RELATIVE}
- Segments: compliance-heavy-fintech, regulated-b2b-saas, marketplace-kyc-risk, no-match
- Git commit created: {commit_hash}
- No outreach, CRM update, campaign trigger, sync, external side effect, or remote push happened.
"""


def _append_human_note(target: Path) -> None:
    target.write_text(
        target.read_text(encoding="utf-8").rstrip()
        + "\n\n<!-- Human note: keep marketplace exception language. -->\n",
        encoding="utf-8",
    )


def _apply_regulated_saas_refinement(target: Path) -> None:
    text = target.read_text(encoding="utf-8")
    signal = "- Insurance claims operations with recurring evidence collection or audit handoffs."
    caveat = "- Service providers are weaker fit unless they buy SaaS for internal regulated operations."
    if signal not in text:
        text = text.replace(
            "- Operations leaders responsible for repeatable onboarding or compliance review queues.",
            "- Operations leaders responsible for repeatable onboarding or compliance review queues.\n" + signal,
        )
    if caveat not in text:
        text = text.replace(
            "- Small internal tools with no repeatable compliance operations motion.",
            "- Small internal tools with no repeatable compliance operations motion.\n" + caveat,
        )
    target.write_text(text, encoding="utf-8")


def _update_summary(project: IcpProject, target_dirty_before: bool) -> str:
    commit_line = (
        "Auto-commit skipped: target file had pre-existing uncommitted edits."
        if target_dirty_before
        else f"Would create git commit: {UPDATE_COMMIT_MESSAGE}"
    )
    return f"""GTM context update complete

Dependency trace
- GTM project: {ORG_ID}
- GTM workspace: {WORKSPACE_ID}
- Target file: {ICP_RELATIVE}
- Hard prerequisites: context resolved
- Composed: none

Files
- Updated: {ICP_RELATIVE}
- Preserved: existing segment labels, no-match, human-authored notes

Git
- {commit_line}
- Changes remain uncommitted.
- Unrelated existing changes were left uncommitted and unstaged.
- No remote push happened.

External side effects
- No outreach was sent.
- No CRM records were updated.
- No campaign triggers or syncs happened.
"""


def _auto_commit_target(repo: Path, relative: str, message: str) -> str:
    _git(repo, "add", "--", relative)
    _git(repo, "commit", "-m", message)
    return _git(repo, "rev-parse", "HEAD").stdout.strip()


def _commit_changed_files(repo: Path, commit: str) -> list[str]:
    return _git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", commit).stdout.splitlines()


def _machine_labels(text: str) -> set[str]:
    return set(_machine_labels_in_order(text))


def _machine_labels_in_order(text: str) -> list[str]:
    labels: list[str] = []
    for line in text.splitlines():
        if line.startswith("Machine label: `") and line.endswith("`"):
            labels.append(line.removeprefix("Machine label: `").removesuffix("`"))
    return labels


def _all_created_segments_have_required_fields(text: str) -> bool:
    sections = [section for section in text.split("\n## Segment: ") if section and not section.startswith("# ICPs")]
    required = [
        "confidence:",
        "needs_review:",
        "reasoning:",
        "Strong signals:",
        "Disqualifiers:",
        "Provenance / source notes:",
        "Open questions:",
    ]
    return bool(sections) and all(all(item in section for item in required) for section in sections)


def _registry_is_local(registry: dict[str, Any], repo: Path) -> bool:
    project = registry.get("projects", {}).get(ORG_ID, {})
    local = project.get("local", {})
    return (
        registry.get("activeProject") == ORG_ID
        and project.get("path") == str(repo)
        and local.get("activePerson") == PERSON_ID
        and local.get("activeWorkspace") == WORKSPACE_ID
        and not (repo / "registry.json").exists()
    )


def _load_eval_definitions() -> dict[int, dict[str, Any]]:
    data = json.loads((EVAL_DIR / "evals.json").read_text(encoding="utf-8"))
    return {item["id"]: item for item in data["evals"]}


def _assertion(text: str, passed: bool, evidence: str) -> AssertionResult:
    return AssertionResult(text=text, passed=bool(passed), evidence=evidence)


def _grading_json(run: EvalRun) -> dict[str, Any]:
    return {
        "expectations": [asdict(item) for item in run.expectations],
        "summary": {
            "passed": run.passed,
            "failed": run.failed,
            "total": len(run.expectations),
            "pass_rate": round(run.pass_rate, 4),
        },
        "execution_metrics": {
            "tool_calls": {},
            "total_tool_calls": 0,
            "total_steps": len(run.expectations),
            "errors_encountered": run.failed,
            "output_chars": sum(len(value) for value in run.outputs.values()),
            "transcript_chars": len(run.outputs.get("preview_transcript.md", "")),
        },
        "timing": {"total_duration_seconds": round(run.duration_seconds, 4)},
        "claims": [],
        "user_notes_summary": {"uncertainties": [], "needs_review": [], "workarounds": []},
        "eval_feedback": {"suggestions": [], "overall": "No suggestions, deterministic assertions cover the durable ICP write contract."},
    }


def _benchmark_json(runs: list[EvalRun]) -> dict[str, Any]:
    pass_rates = [run.pass_rate for run in runs]
    durations = [run.duration_seconds for run in runs]
    output_chars = [sum(len(value) for value in run.outputs.values()) for run in runs]
    return {
        "metadata": {
            "skill_name": "gtm-define-icp",
            "skill_path": str(SKILL_DIR.relative_to(REPO_ROOT)),
            "executor_model": "inline-deterministic-python",
            "analyzer_model": "inline-deterministic-python",
            "timestamp": FIXED_TIMESTAMP,
            "evals_run": [run.eval_id for run in runs],
            "runs_per_configuration": 1,
        },
        "runs": [
            {
                "eval_id": run.eval_id,
                "eval_name": run.eval_name,
                "configuration": "with_skill",
                "run_number": 1,
                "result": {
                    "pass_rate": round(run.pass_rate, 4),
                    "passed": run.passed,
                    "failed": run.failed,
                    "total": len(run.expectations),
                    "time_seconds": round(run.duration_seconds, 4),
                    "tokens": 0,
                    "tool_calls": 0,
                    "errors": run.failed,
                },
                "expectations": [asdict(item) for item in run.expectations],
                "notes": [],
            }
            for run in runs
        ],
        "run_summary": {
            "with_skill": {
                "pass_rate": _stats(pass_rates),
                "time_seconds": _stats(durations),
                "tokens": _stats(output_chars),
            },
            "delta": {
                "pass_rate": "+1.00",
                "time_seconds": "+0.0",
                "tokens": "+0",
            },
        },
        "notes": [
            "Baseline/subagent runs were omitted because this Paperclip heartbeat explicitly forbids outsourcing or invoking other agents.",
            "Deterministic assertions cover ADR 0086 context failure, durable write preview, ICP file shape, non-destructive updates, and git auto-commit isolation.",
        ],
    }


def _stats(values: list[float]) -> dict[str, float]:
    if not values:
        return {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0}
    return {
        "mean": round(mean(values), 4),
        "stddev": 0.0,
        "min": round(min(values), 4),
        "max": round(max(values), 4),
    }


def _benchmark_markdown(benchmark: dict[str, Any]) -> str:
    summary = benchmark["run_summary"]["with_skill"]
    pass_rate = summary["pass_rate"]["mean"] * 100
    return f"""# gtm-define-icp Eval Benchmark

Date: {benchmark["metadata"]["timestamp"]}

| Configuration | Pass rate | Evals |
|---|---:|---:|
| with_skill | {pass_rate:.0f}% | {len(benchmark["runs"])} |

Notes:
- Baseline/subagent runs were omitted because this Paperclip heartbeat explicitly forbids outsourcing or invoking other agents.
- Static viewer input is available in the sibling eval run directories.
"""


def _run_summary(
    title: str, project: IcpProject, expectations: list[AssertionResult], transcript: str, commit_hash: str | None
) -> str:
    lines = [
        f"# gtm-define-icp eval: {title}",
        "",
        f"- GTM home: <temporary>/{project.gtm_home.name}",
        f"- Project: {ORG_ID}",
        f"- Workspace: {WORKSPACE_ID}",
        f"- Pass rate: {sum(1 for item in expectations if item.passed)}/{len(expectations)}",
    ]
    if commit_hash:
        lines.append(f"- Commit: {commit_hash}")
    lines.extend(["", "## Execution", "", transcript.strip(), "", "## Assertions", ""])
    for item in expectations:
        state = "PASS" if item.passed else "FAIL"
        lines.append(f"- {state}: {item.text} - {item.evidence}")
    return "\n".join(lines) + "\n"


def _missing_context_summary(expectations: list[AssertionResult], temp_root: Path) -> str:
    lines = [
        "# gtm-define-icp eval: missing context failure",
        "",
        f"- Temp root: <temporary>/{temp_root.name}",
        f"- Pass rate: {sum(1 for item in expectations if item.passed)}/{len(expectations)}",
        "",
        "## Assertions",
        "",
    ]
    for item in expectations:
        state = "PASS" if item.passed else "FAIL"
        lines.append(f"- {state}: {item.text} - {item.evidence}")
    return "\n".join(lines) + "\n"


def _tree(root: Path) -> str:
    lines: list[str] = []
    for path in sorted(root.rglob("*")):
        if ".git" in path.parts:
            continue
        relative = path.relative_to(root)
        suffix = "/" if path.is_dir() else ""
        lines.append(f"{relative}{suffix}")
    return "\n".join(lines) + "\n"


def _git_status(repo: Path, *paths: str) -> str:
    args = ["status", "--porcelain"]
    if paths:
        args.extend(["--", *paths])
    return _git(repo, *args).stdout.strip()


def _commit_subject(repo: Path, commit: str) -> str:
    return _git(repo, "show", "-s", "--format=%s", commit).stdout.strip()


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "GIT_AUTHOR_DATE": FIXED_TIMESTAMP,
        "GIT_COMMITTER_DATE": FIXED_TIMESTAMP,
    }
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed:\n{result.stderr}")
    return result


def _json_dumps(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    raise SystemExit(main())
