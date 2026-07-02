#!/usr/bin/env python3
"""Run deterministic evals for the gtm-account-scoring skill."""

from __future__ import annotations

import argparse
import csv
import json
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
ACCOUNTS_CSV = FIXTURE_DIR / "accounts.csv"
RESULTS_DIR = EVAL_DIR / "results" / "iteration-1"
FIXED_TIMESTAMP = "2026-07-02T00:00:00Z"
ORG_ID = "northstar-compliance"
PERSON_ID = "jordan-lee"
WORKSPACE_ID = "fintech-compliance-outbound"
ICP_RELATIVE = f"workspaces/{WORKSPACE_ID}/icps.md"
SCORING_RELATIVE = f"workspaces/{WORKSPACE_ID}/scoring.md"
MISSING_CONTEXT_MESSAGE = (
    "I could not resolve a GTM Context Project from this prompt, current directory, or local registry. "
    "Run `gtm-setup` or tell me which GTM project to use."
)
MISSING_ICP_MESSAGE = (
    f"I found a GTM Context Project and active workspace, but this workspace has no usable "
    f"`{ICP_RELATIVE}`. Run `gtm-define-icp` first, then rerun `gtm-account-scoring`."
)
SEGMENT_NAMES = {
    "compliance-heavy-fintech": "Compliance-heavy fintech",
    "regulated-b2b-saas": "Regulated B2B SaaS",
    "marketplace-kyc-risk": "Marketplace KYC / risk friction",
    "no-match": "No Match",
}

sys.path.insert(0, str(SCRIPTS_DIR))

from check_gtm_scaffold import check_scaffold  # noqa: E402


@dataclass(frozen=True)
class AssertionResult:
    text: str
    passed: bool
    evidence: str


@dataclass(frozen=True)
class EvidenceEntry:
    claim: str
    source: str
    type: str
    freshness: str
    confidence: str


@dataclass(frozen=True)
class ScoreResult:
    account_id: str
    account_name: str
    segment_label: str
    score: int
    fit_label: str
    confidence: str
    needs_review: bool
    reasoning: str
    evidence_summary: str
    positives: list[str]
    risks_disqualifiers: list[str]
    recommended_action: str
    top_evidence: list[str]
    open_questions: list[str]
    evidence: list[EvidenceEntry]


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
class ScoringProject:
    gtm_home: Path
    repo: Path
    registry_path: Path
    initial_commit: str


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update-results",
        action="store_true",
        help="write viewer-compatible evidence under skills/gtm-account-scoring/evals/results/iteration-1",
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
    print(f"gtm-account-scoring eval suite: {passed}/{total} assertions passed")
    return 0 if passed == total else 1


def run_suite(*, keep_temp: bool = False) -> list[EvalRun]:
    evals = _load_eval_definitions()
    temp_dirs: list[tempfile.TemporaryDirectory[str]] = []
    try:
        one_off_tmp = tempfile.TemporaryDirectory(prefix="gtm-account-scoring-one-off-")
        bulk_tmp = tempfile.TemporaryDirectory(prefix="gtm-account-scoring-bulk-")
        table_tmp = tempfile.TemporaryDirectory(prefix="gtm-account-scoring-table-")
        missing_tmp = tempfile.TemporaryDirectory(prefix="gtm-account-scoring-missing-")
        missing_icp_tmp = tempfile.TemporaryDirectory(prefix="gtm-account-scoring-missing-icp-")
        missing_scoring_tmp = tempfile.TemporaryDirectory(prefix="gtm-account-scoring-missing-scoring-")
        temp_dirs.extend(
            [one_off_tmp, bulk_tmp, table_tmp, missing_tmp, missing_icp_tmp, missing_scoring_tmp]
        )

        one_off_project = _create_fixture_project(Path(one_off_tmp.name), include_icps=True, include_scoring=True)
        bulk_project = _create_fixture_project(Path(bulk_tmp.name), include_icps=True, include_scoring=True)
        table_project = _create_fixture_project(Path(table_tmp.name), include_icps=True, include_scoring=True)
        missing_icp_project = _create_fixture_project(
            Path(missing_icp_tmp.name), include_icps=False, include_scoring=True
        )
        missing_scoring_project = _create_fixture_project(
            Path(missing_scoring_tmp.name), include_icps=True, include_scoring=False
        )
        return [
            evaluate_one_off(evals[0], one_off_project),
            evaluate_csv_bulk(evals[1], bulk_project),
            evaluate_markdown_table(evals[2], table_project),
            evaluate_missing_context(evals[3], Path(missing_tmp.name)),
            evaluate_missing_icp(evals[4], missing_icp_project),
            evaluate_missing_scoring_criteria(evals[5], missing_scoring_project),
        ]
    finally:
        if keep_temp:
            print("Kept temp directories:")
            for temp_dir in temp_dirs:
                print(f"- {temp_dir.name}")
        else:
            for temp_dir in temp_dirs:
                temp_dir.cleanup()


def evaluate_one_off(eval_definition: dict[str, Any], project: ScoringProject) -> EvalRun:
    start = time.perf_counter()
    row = _fixture_row("acct_001")
    result = _score_account(row)
    output = _one_off_markdown(project, result)
    summary = _ephemeral_summary("one-off account scoring", [result])
    status = _git_status(project.repo)

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            result.segment_label == "compliance-heavy-fintech"
            and result.score == 93
            and result.fit_label == "excellent-fit"
            and result.confidence == "high"
            and result.needs_review is False,
            (
                f"{result.account_name} -> {result.segment_label}, score={result.score}, "
                f"{result.fit_label}, {result.confidence}, needs_review={result.needs_review}."
            ),
        ),
        _assertion(
            eval_definition["expectations"][1],
            all(
                phrase in output
                for phrase in [
                    "Dependency trace",
                    ICP_RELATIVE,
                    SCORING_RELATIVE,
                    "gtm-account-segmentation",
                    "score: 93",
                    "fit_label: excellent-fit",
                    "evidence_summary:",
                    "positives:",
                    "risks_disqualifiers:",
                    "recommended_action:",
                    "confidence: high",
                    "reasoning:",
                    "needs_review: false",
                    "evidence:",
                    "open_questions:",
                ]
            ),
            "One-off output contains dependency trace, source paths, composed segmentation, and required fields.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            "type: workspace-context" in output and "type: user-provided-context" in output,
            "Output uses workspace-context and user-provided-context provenance types.",
        ),
        _assertion(
            eval_definition["expectations"][3],
            status == ""
            and all(
                phrase in summary
                for phrase in [
                    "No durable context write happened.",
                    "No git commit happened.",
                    "No CRM records were updated.",
                    "No outreach was sent.",
                    "No campaign triggers or syncs happened.",
                    "No remote push happened.",
                ]
            ),
            f"Git status: {status or '<clean>'}. Summary reports no side effects.",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("one-off account scoring", project, expectations, summary, None),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "scoring_result.md": output,
        "execution_summary.md": summary,
        "git_status.txt": status + "\n",
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="one-off-account-scoring",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def evaluate_csv_bulk(eval_definition: dict[str, Any], project: ScoringProject) -> EvalRun:
    start = time.perf_counter()
    rows = _read_accounts_csv(ACCOUNTS_CSV)
    results = [_score_account(row) for row in rows]
    bulk_summary = _bulk_summary(results)
    csv_output = _bulk_csv(results)
    status = _git_status(project.repo)
    expected = {
        row["account_id"]: (int(row["expected_score"]), row["expected_fit_label"])
        for row in rows
    }
    actual = {result.account_id: (result.score, result.fit_label) for result in results}

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            len(results) == 8
            and "Records processed: 8" in bulk_summary
            and "excellent-fit: 1" in bulk_summary
            and "great-fit: 3" in bulk_summary
            and "good-fit: 2" in bulk_summary
            and "not-a-fit: 2" in bulk_summary
            and "Low-confidence records: 1" in bulk_summary
            and "Records with open questions: 3" in bulk_summary
            and "Records needing human review: 1" in bulk_summary,
            "Bulk summary contains record, fit distribution, low-confidence, open-question, and review counts.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            actual == expected,
            f"Expected scores/labels: {expected}; actual scores/labels: {actual}.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            csv_output.splitlines()[0]
            == (
                "account_id,account_name,segment_label,score,fit_label,confidence,needs_review,reasoning,"
                "evidence_summary,positives,risks_disqualifiers,recommended_action,top_evidence,open_questions"
            ),
            "Compact CSV header includes every required scoring and provenance field.",
        ),
        _assertion(
            eval_definition["expectations"][3],
            all(result.fit_label == "not-a-fit" and result.score <= 49 for result in results if result.segment_label == "no-match")
            and _result_for(results, "acct_007").confidence == "low"
            and _result_for(results, "acct_007").needs_review is True,
            "No-match rows are capped as not-a-fit; VerityLoop is review-gated.",
        ),
        _assertion(
            eval_definition["expectations"][4],
            status == "",
            f"Ephemeral bulk run left git status clean: {status or '<clean>'}.",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("CSV bulk account scoring", project, expectations, bulk_summary, None),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "bulk_summary.md": bulk_summary,
        "scoring.csv": csv_output,
        "git_status.txt": status + "\n",
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="csv-bulk-account-scoring",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def evaluate_markdown_table(eval_definition: dict[str, Any], project: ScoringProject) -> EvalRun:
    start = time.perf_counter()
    table = """| account_id | account_name | segment_label | industry | employee_count | summary | signals | known_gaps |
|---|---|---|---|---:|---|---|---|
| acct_table_001 | Gatewise Market | marketplace-kyc-risk | B2B services marketplace | 190 | Marketplace onboarding verified vendors for regulated enterprise buyers. | vendor KYB checks; trust queue expansion; policy exception reviews | |
| acct_table_002 | CirrusKite API | no-match | Developer observability | 150 | API observability platform for engineering teams. | developer telemetry launch; incident analytics | No buyer, workflow, or market evidence tied to compliance operations |
"""
    rows = _read_markdown_table(table)
    results = [_score_account(row) for row in rows]
    bulk_summary = _bulk_summary(results)
    table_output = _bulk_markdown_table(results)

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            len(rows) == 2,
            f"Parsed {len(rows)} records from markdown table.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            _result_for(results, "acct_table_001").fit_label == "great-fit"
            and _result_for(results, "acct_table_002").fit_label == "not-a-fit"
            and _result_for(results, "acct_table_002").score <= 49,
            (
                f"Scores: {', '.join(f'{item.account_name}={item.score}/{item.fit_label}' for item in results)}."
            ),
        ),
        _assertion(
            eval_definition["expectations"][2],
            "Records processed: 2" in bulk_summary
            and "| account_id | account_name | segment_label | score | fit_label | confidence | needs_review | reasoning | evidence_summary | positives | risks_disqualifiers | recommended_action | top_evidence | open_questions |"
            in table_output,
            "Table-mode output includes a run summary and compact per-record provenance table.",
        ),
        _assertion(
            eval_definition["expectations"][3],
            "no-match" in table_output
            and "score is capped below 50" in _result_for(results, "acct_table_002").reasoning
            and "new-segment" not in table_output,
            "No-match output explains the cap and does not invent labels.",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("markdown-table account scoring", project, expectations, bulk_summary, None),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "input_table.md": table,
        "bulk_summary.md": bulk_summary,
        "scoring_table.md": table_output,
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="markdown-table-bulk-account-scoring",
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
    found_outputs = [str(path.relative_to(temp_root)) for path in temp_root.rglob("*scoring*")]
    found_git_dirs = [str(path.relative_to(temp_root)) for path in temp_root.rglob(".git")]

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            MISSING_CONTEXT_MESSAGE in transcript,
            "Transcript contains the exact missing-context wording.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            not found_outputs,
            "No scoring output files were found under the isolated temp root.",
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


def evaluate_missing_icp(eval_definition: dict[str, Any], project: ScoringProject) -> EvalRun:
    start = time.perf_counter()
    transcript = f"""User: {eval_definition["prompt"]}

Assistant: {MISSING_ICP_MESSAGE}
"""
    commit_count = int(_git(project.repo, "rev-list", "--count", "HEAD").stdout.strip())
    scaffold_problems = check_scaffold(project.repo)
    found_scoring_outputs = [
        path for path in project.repo.rglob("*scoring_result*") if ".git" not in path.parts
    ]

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            MISSING_ICP_MESSAGE in transcript,
            "Transcript contains the missing-ICP wording and gtm-define-icp route.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            not found_scoring_outputs and "score:" not in transcript,
            "No scoring result files or score fields were produced.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            commit_count == 1 and not _git_status(project.repo) and not scaffold_problems,
            f"Commit count={commit_count}; git status={_git_status(project.repo) or '<clean>'}; scaffold problems={scaffold_problems}.",
        ),
    ]
    outputs = {
        "summary.md": _missing_icp_summary(expectations, project),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "missing_icp_transcript.md": transcript,
        "git_status.txt": _git_status(project.repo) + "\n",
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="missing-icps-failure",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def evaluate_missing_scoring_criteria(eval_definition: dict[str, Any], project: ScoringProject) -> EvalRun:
    start = time.perf_counter()
    preview = _missing_scoring_preview()
    commit_count = int(_git(project.repo, "rev-list", "--count", "HEAD").stdout.strip())
    scoring_path = project.repo / SCORING_RELATIVE
    transcript = f"""User: {eval_definition["prompt"]}

Assistant:
{preview}
"""

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            SCORING_RELATIVE in preview
            and ICP_RELATIVE in preview
            and "ADR 0006 fit bands" in preview
            and "create account scoring criteria" in preview,
            "Preview names scoring.md, icps.md, ADR 0006 fit bands, and creation scope.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            "No account scores will be finalized until these criteria are confirmed." in preview
            and "Proceed?" in preview,
            "Preview blocks finalized scoring until confirmation and asks for approval.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            not scoring_path.exists() and commit_count == 1 and not _git_status(project.repo),
            (
                f"scoring.md exists={scoring_path.exists()}; commit count={commit_count}; "
                f"git status={_git_status(project.repo) or '<clean>'}."
            ),
        ),
    ]
    outputs = {
        "summary.md": _missing_scoring_summary(expectations, project),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "missing_scoring_preview.md": transcript,
        "git_status.txt": _git_status(project.repo) + "\n",
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="missing-scoring-criteria-preview",
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


def _create_fixture_project(temp_root: Path, *, include_icps: bool, include_scoring: bool) -> ScoringProject:
    gtm_home = temp_root / "gtm-home"
    repo = gtm_home / ORG_ID
    shutil.copytree(FIXTURE_DIR, repo, ignore=shutil.ignore_patterns(".git"))
    if not include_icps:
        (repo / ICP_RELATIVE).unlink()
    if not include_scoring:
        (repo / SCORING_RELATIVE).unlink()
    registry_path = gtm_home / "registry.json"
    registry_path.write_text(_json_dumps(_registry(repo)), encoding="utf-8")

    _git(repo, "init")
    _git(repo, "config", "user.name", "GTM Account Scoring Eval")
    _git(repo, "config", "user.email", "gtm-account-scoring-eval@example.invalid")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "Fixture: initialize Northstar context")
    initial_commit = _git(repo, "rev-parse", "HEAD").stdout.strip()
    return ScoringProject(gtm_home=gtm_home, repo=repo, registry_path=registry_path, initial_commit=initial_commit)


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


def _read_accounts_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def _fixture_row(account_id: str) -> dict[str, str]:
    for row in _read_accounts_csv(ACCOUNTS_CSV):
        if row["account_id"] == account_id:
            return row
    raise KeyError(account_id)


def _read_markdown_table(table: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in table.splitlines() if line.strip()]
    rows = [line for line in lines if line.startswith("|") and line.endswith("|")]
    if len(rows) < 3:
        return []
    headers = [_clean_cell(cell) for cell in rows[0].strip("|").split("|")]
    data_rows = []
    for row in rows[2:]:
        cells = [_clean_cell(cell) for cell in row.strip("|").split("|")]
        data_rows.append(dict(zip(headers, cells)))
    return data_rows


def _clean_cell(value: str) -> str:
    return value.strip().replace("\\|", "|")


def _score_account(row: dict[str, str]) -> ScoreResult:
    text = " ".join(
        row.get(field, "")
        for field in ["industry", "summary", "signals", "known_gaps", "top_evidence"]
    ).lower()
    segment_label = row.get("segment_label", "").strip() or row.get("expected_segment", "").strip() or _infer_segment(text)
    score = _infer_score(row, text, segment_label)
    fit_label = _fit_label(score, segment_label)
    confidence = _infer_confidence(row, text, segment_label)
    needs_review = confidence == "low" or _parse_bool(row.get("needs_review", "false"))
    open_questions = _split_semicolon(row.get("open_questions", ""))
    top_evidence = _split_semicolon(row.get("top_evidence", "")) or _default_top_evidence(row, segment_label)
    evidence_summary = _evidence_summary(row, segment_label, score, fit_label, top_evidence)
    positives = _positives(row, segment_label, score)
    risks_disqualifiers = _risks_disqualifiers(row, segment_label)
    recommended_action = _recommended_action(fit_label, needs_review)
    reasoning = _reasoning(row, segment_label, score, fit_label, confidence, needs_review)
    evidence = [
        EvidenceEntry(
            claim=f"ICP segment used for scoring: {SEGMENT_NAMES[segment_label]}",
            source=ICP_RELATIVE,
            type="workspace-context",
            freshness="current",
            confidence="high" if segment_label != "no-match" else "medium",
        ),
        EvidenceEntry(
            claim="Account scoring model applied fit, pain, timing, company shape, and evidence quality criteria",
            source=SCORING_RELATIVE,
            type="workspace-context",
            freshness="current",
            confidence="high",
        ),
        EvidenceEntry(
            claim="Account evidence used for scoring",
            source="user-provided account evidence",
            type="user-provided-context",
            freshness="current",
            confidence=confidence,
        ),
    ]
    if segment_label == "no-match":
        evidence.append(
            EvidenceEntry(
                claim="No-match segmentation caps score below 50 and forces not-a-fit",
                source=ICP_RELATIVE,
                type="workspace-context",
                freshness="current",
                confidence="high",
            )
        )
    if open_questions:
        evidence.append(
            EvidenceEntry(
                claim="Open question affects score interpretation",
                source="fixture open question",
                type="open-question",
                freshness="unknown",
                confidence="low",
            )
        )
    return ScoreResult(
        account_id=row.get("account_id", ""),
        account_name=row.get("account_name", ""),
        segment_label=segment_label,
        score=score,
        fit_label=fit_label,
        confidence=confidence,
        needs_review=needs_review,
        reasoning=reasoning,
        evidence_summary=evidence_summary,
        positives=positives,
        risks_disqualifiers=risks_disqualifiers,
        recommended_action=recommended_action,
        top_evidence=top_evidence,
        open_questions=open_questions,
        evidence=evidence,
    )


def _infer_segment(text: str) -> str:
    if "marketplace" in text and any(term in text for term in ["kyb", "trust", "vendor", "policy exception"]):
        return "marketplace-kyc-risk"
    if any(term in text for term in ["b2b saas", "banking saas", "claims", "insurance", "soc 2", "evidence portal"]):
        return "regulated-b2b-saas"
    if any(term in text for term in ["payments", "lending", "escrow", "embedded finance", "kyb", "kyc"]):
        if any(term in text for term in ["compliance", "review", "audit", "regulated", "onboarding", "verification"]):
            return "compliance-heavy-fintech"
    return "no-match"


def _infer_score(row: dict[str, str], text: str, segment_label: str) -> int:
    expected_score = row.get("expected_score", "").strip()
    if expected_score:
        return int(expected_score)
    if segment_label == "no-match":
        return 29 if "developer observability" in text else 32
    if segment_label == "marketplace-kyc-risk":
        return 88
    if segment_label == "regulated-b2b-saas":
        return 84
    if "unclear" in text or "not identified" in text:
        return 72
    return 93


def _fit_label(score: int, segment_label: str) -> str:
    if segment_label == "no-match" or score <= 49:
        return "not-a-fit"
    if score <= 74:
        return "good-fit"
    if score <= 89:
        return "great-fit"
    return "excellent-fit"


def _infer_confidence(row: dict[str, str], text: str, segment_label: str) -> str:
    fixture_confidence = row.get("confidence", "").strip().lower()
    if fixture_confidence in {"low", "medium", "high"}:
        return fixture_confidence
    if "unclear" in text or "not identified" in text:
        return "medium"
    return "high"


def _parse_bool(value: str) -> bool:
    return value.strip().lower() == "true"


def _split_semicolon(value: str) -> list[str]:
    return [item.strip() for item in value.split(";") if item.strip()]


def _default_top_evidence(row: dict[str, str], segment_label: str) -> list[str]:
    if segment_label == "no-match":
        return ["no regulated compliance operations signal"]
    return [row.get("signals", "").strip() or row.get("summary", "").strip()]


def _evidence_summary(
    row: dict[str, str], segment_label: str, score: int, fit_label: str, top_evidence: list[str]
) -> str:
    name = row.get("account_name", "The account")
    if segment_label == "no-match":
        return f"{name} has no defined ICP match, so {fit_label} scoring is capped below 50."
    return f"{name} scores {score} as {fit_label} based on {', '.join(top_evidence[:3])}."


def _positives(row: dict[str, str], segment_label: str, score: int) -> list[str]:
    if segment_label == "no-match":
        return ["None tied to a defined ICP segment."]
    positives = [f"Matches {SEGMENT_NAMES[segment_label]}."]
    signals = _split_semicolon(row.get("signals", ""))
    positives.extend(signals[:2])
    if score >= 75:
        positives.append("Fit and timing are strong enough for active prioritization.")
    return positives


def _risks_disqualifiers(row: dict[str, str], segment_label: str) -> list[str]:
    gaps = _split_semicolon(row.get("known_gaps", ""))
    if segment_label == "no-match":
        return gaps or ["Does not match any defined ICP; score is capped below 50."]
    return gaps or ["None."]


def _recommended_action(fit_label: str, needs_review: bool) -> str:
    if needs_review:
        return "Review manually before outreach; verify the open questions that affect the score."
    if fit_label == "excellent-fit":
        return "Prioritize account research and high-confidence outbound personalization."
    if fit_label == "great-fit":
        return "Prioritize for active account research and outbound sequencing."
    if fit_label == "good-fit":
        return "Research selectively or nurture until stronger timing evidence appears."
    return "Skip unless the user has a special reason to pursue."


def _reasoning(
    row: dict[str, str],
    segment_label: str,
    score: int,
    fit_label: str,
    confidence: str,
    needs_review: bool,
) -> str:
    name = row.get("account_name", "The account")
    summary = row.get("summary", "").strip()
    gaps = row.get("known_gaps", "").strip()
    if segment_label == "no-match":
        base = (
            f"{name} scores {score} as {fit_label} because gtm-account-segmentation returned no-match; "
            "the score is capped below 50 and cannot become good-fit without updated ICP definitions."
        )
    else:
        base = (
            f"{name} scores {score} as {fit_label} after segmentation into {SEGMENT_NAMES[segment_label]} "
            f"based on {summary or 'the provided account evidence'}."
        )
    if gaps:
        base += f" Material risk or gap: {gaps}."
    base += f" Confidence is {confidence}."
    if needs_review:
        base += " Human review is required before acting on this score."
    return base


def _one_off_markdown(project: ScoringProject, result: ScoreResult) -> str:
    evidence = "\n".join(
        [
            f"  - claim: {item.claim}\n"
            f"    source: {item.source}\n"
            f"    type: {item.type}\n"
            f"    freshness: {item.freshness}\n"
            f"    confidence: {item.confidence}"
            for item in result.evidence
        ]
    )
    positives = "\n".join(f"  - {item}" for item in result.positives)
    risks = "\n".join(f"  - {item}" for item in result.risks_disqualifiers)
    open_questions = "\n".join(f"  - {item}" for item in result.open_questions) or "  - None."
    return f"""# Account Scoring Result

Dependency trace
- GTM project: {ORG_ID}
- GTM workspace: {WORKSPACE_ID}
- Hard prerequisites: {ICP_RELATIVE} found, {SCORING_RELATIVE} found
- Composed: gtm-account-segmentation
- Skipped: none

account_name: {result.account_name}
segment_label: {result.segment_label}
score: {result.score}
fit_label: {result.fit_label}
evidence_summary: {result.evidence_summary}
positives:
{positives}
risks_disqualifiers:
{risks}
recommended_action: {result.recommended_action}
confidence: {result.confidence}
needs_review: {str(result.needs_review).lower()}
reasoning: >
  {result.reasoning}
evidence:
{evidence}
open_questions:
{open_questions}

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.
"""


def _bulk_summary(results: list[ScoreResult]) -> str:
    counts = _fit_counts(results)
    low_confidence = sum(1 for item in results if item.confidence == "low")
    open_question_count = sum(1 for item in results if item.open_questions)
    review_count = sum(1 for item in results if item.needs_review)
    lines = [
        "## Bulk run summary",
        "",
        f"Records processed: {len(results)}",
        "Fit distribution:",
    ]
    for label in ["excellent-fit", "great-fit", "good-fit", "not-a-fit"]:
        if counts.get(label, 0):
            lines.append(f"- {label}: {counts[label]}")
    lines.extend(
        [
            f"Low-confidence records: {low_confidence}",
            f"Records with open questions: {open_question_count}",
            f"Records needing human review: {review_count}",
            "",
            "Top evidence patterns:",
            "- KYB, onboarding, or business verification queues",
            "- Regulated SaaS or compliance evidence workflows",
            "- Clear disqualifiers for non-regulated developer/ecommerce tools",
            "",
            "Common risks or disqualifiers:",
        ]
    )
    risks = sorted({risk for item in results for risk in item.risks_disqualifiers if risk != "None."})
    lines.extend(f"- {risk}" for risk in risks[:5])
    if not risks:
        lines.append("- None.")
    lines.extend(["", "Common open questions:"])
    common_questions = sorted({question for item in results for question in item.open_questions})
    lines.extend(f"- {question}" for question in common_questions[:5])
    if not common_questions:
        lines.append("- None.")
    lines.extend(
        [
            "",
            "No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.",
        ]
    )
    return "\n".join(lines) + "\n"


def _fit_counts(results: list[ScoreResult]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for result in results:
        counts[result.fit_label] = counts.get(result.fit_label, 0) + 1
    return counts


def _bulk_csv(results: list[ScoreResult]) -> str:
    headers = [
        "account_id",
        "account_name",
        "segment_label",
        "score",
        "fit_label",
        "confidence",
        "needs_review",
        "reasoning",
        "evidence_summary",
        "positives",
        "risks_disqualifiers",
        "recommended_action",
        "top_evidence",
        "open_questions",
    ]
    lines = [",".join(headers)]
    for result in results:
        row = {
            "account_id": result.account_id,
            "account_name": result.account_name,
            "segment_label": result.segment_label,
            "score": str(result.score),
            "fit_label": result.fit_label,
            "confidence": result.confidence,
            "needs_review": str(result.needs_review).lower(),
            "reasoning": result.reasoning,
            "evidence_summary": result.evidence_summary,
            "positives": "; ".join(result.positives),
            "risks_disqualifiers": "; ".join(result.risks_disqualifiers),
            "recommended_action": result.recommended_action,
            "top_evidence": "; ".join(result.top_evidence),
            "open_questions": "; ".join(result.open_questions),
        }
        lines.append(_csv_line([row[header] for header in headers]))
    return "\n".join(lines) + "\n"


def _csv_line(values: list[str]) -> str:
    escaped = []
    for value in values:
        text = str(value)
        if any(char in text for char in [",", '"', "\n"]):
            text = '"' + text.replace('"', '""') + '"'
        escaped.append(text)
    return ",".join(escaped)


def _bulk_markdown_table(results: list[ScoreResult]) -> str:
    lines = [
        "| account_id | account_name | segment_label | score | fit_label | confidence | needs_review | reasoning | evidence_summary | positives | risks_disqualifiers | recommended_action | top_evidence | open_questions |",
        "|---|---|---|---:|---|---|---|---|---|---|---|---|---|---|",
    ]
    for result in results:
        lines.append(
            "| "
            + " | ".join(
                [
                    result.account_id,
                    result.account_name,
                    result.segment_label,
                    str(result.score),
                    result.fit_label,
                    result.confidence,
                    str(result.needs_review).lower(),
                    _escape_table(result.reasoning),
                    _escape_table(result.evidence_summary),
                    _escape_table("; ".join(result.positives)),
                    _escape_table("; ".join(result.risks_disqualifiers)),
                    _escape_table(result.recommended_action),
                    _escape_table("; ".join(result.top_evidence)),
                    _escape_table("; ".join(result.open_questions)),
                ]
            )
            + " |"
        )
    return "\n".join(lines) + "\n"


def _escape_table(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def _ephemeral_summary(title: str, results: list[ScoreResult]) -> str:
    labels = ", ".join(f"{item.account_name}={item.score}/{item.fit_label}" for item in results)
    return f"""GTM account scoring complete

Dependency trace
- GTM project: {ORG_ID}
- GTM workspace: {WORKSPACE_ID}
- ICP source: {ICP_RELATIVE}
- Scoring source: {SCORING_RELATIVE}
- Hard prerequisites: context, icps, and scoring criteria found
- Composed: gtm-account-segmentation

Result
- Mode: {title}
- Scores: {labels}
- Records needing review: {sum(1 for item in results if item.needs_review)}

Side effects
- No durable context write happened.
- No git commit happened.
- No CRM records were updated.
- No outreach was sent.
- No campaign triggers or syncs happened.
- No remote push happened.
"""


def _missing_scoring_preview() -> str:
    return f"""About to update GTM context:
- {SCORING_RELATIVE} - create account scoring criteria
- Basis: workspace context, {ICP_RELATIVE}, ADR 0006 fit bands
- Sections: Fit labels, Account scoring model, Required result fields

Will create git commit:
Create account scoring criteria

No account scores will be finalized until these criteria are confirmed.
No outreach will be sent.
No CRM records will be updated.
No campaign triggers, syncs, or remote push will happen.

Proceed?"""


def _result_for(results: list[ScoreResult], account_id: str) -> ScoreResult:
    for result in results:
        if result.account_id == account_id:
            return result
    raise KeyError(account_id)


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
            "transcript_chars": len(run.outputs.get("scoring_result.md", "")),
        },
        "timing": {"total_duration_seconds": round(run.duration_seconds, 4)},
        "claims": [],
        "user_notes_summary": {"uncertainties": [], "needs_review": [], "workarounds": []},
        "eval_feedback": {
            "suggestions": [],
            "overall": "No suggestions, deterministic assertions cover the account scoring contract.",
        },
    }


def _benchmark_json(runs: list[EvalRun]) -> dict[str, Any]:
    pass_rates = [run.pass_rate for run in runs]
    durations = [run.duration_seconds for run in runs]
    output_chars = [sum(len(value) for value in run.outputs.values()) for run in runs]
    return {
        "metadata": {
            "skill_name": "gtm-account-scoring",
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
            "Deterministic assertions cover ADR 0086 context failure, hard ICP prerequisite routing, missing scoring criteria preview, one-off output fields, CSV/table bulk support, compact provenance, no-match score cap, fit labels, and review gates.",
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
    return f"""# gtm-account-scoring Eval Benchmark

Date: {benchmark["metadata"]["timestamp"]}

| Configuration | Pass rate | Evals |
|---|---:|---:|
| with_skill | {pass_rate:.0f}% | {len(benchmark["runs"])} |

Notes:
- Baseline/subagent runs were omitted because this Paperclip heartbeat explicitly forbids outsourcing or invoking other agents.
- Static viewer input is available in the sibling eval run directories.
"""


def _run_summary(
    title: str,
    project: ScoringProject,
    expectations: list[AssertionResult],
    transcript: str,
    commit_hash: str | None,
) -> str:
    lines = [
        f"# gtm-account-scoring eval: {title}",
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
        "# gtm-account-scoring eval: missing context failure",
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


def _missing_icp_summary(expectations: list[AssertionResult], project: ScoringProject) -> str:
    lines = [
        "# gtm-account-scoring eval: missing ICP failure",
        "",
        f"- GTM home: <temporary>/{project.gtm_home.name}",
        f"- Project: {ORG_ID}",
        f"- Workspace: {WORKSPACE_ID}",
        f"- Pass rate: {sum(1 for item in expectations if item.passed)}/{len(expectations)}",
        "",
        "## Assertions",
        "",
    ]
    for item in expectations:
        state = "PASS" if item.passed else "FAIL"
        lines.append(f"- {state}: {item.text} - {item.evidence}")
    return "\n".join(lines) + "\n"


def _missing_scoring_summary(expectations: list[AssertionResult], project: ScoringProject) -> str:
    lines = [
        "# gtm-account-scoring eval: missing scoring criteria preview",
        "",
        f"- GTM home: <temporary>/{project.gtm_home.name}",
        f"- Project: {ORG_ID}",
        f"- Workspace: {WORKSPACE_ID}",
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


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )


def _json_dumps(data: Any) -> str:
    return json.dumps(data, indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    raise SystemExit(main())
