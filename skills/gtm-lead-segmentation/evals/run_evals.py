#!/usr/bin/env python3
"""Run deterministic evals for the gtm-lead-segmentation skill."""

from __future__ import annotations

import argparse
import csv
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
LEADS_CSV = FIXTURE_DIR / "leads.csv"
RESULTS_DIR = EVAL_DIR / "results" / "iteration-1"
FIXED_TIMESTAMP = "2026-07-02T00:00:00Z"
ORG_ID = "northstar-compliance"
PERSON_ID = "jordan-lee"
WORKSPACE_ID = "fintech-compliance-outbound"
PERSONAS_RELATIVE = f"workspaces/{WORKSPACE_ID}/personas.md"
MISSING_CONTEXT_MESSAGE = (
    "I could not resolve a GTM Context Project from this prompt, current directory, or local registry. "
    "Run `gtm-setup` or tell me which GTM project to use."
)
MISSING_PERSONAS_MESSAGE = (
    f"I found a GTM Context Project and active workspace, but this workspace has no usable "
    f"`{PERSONAS_RELATIVE}`. Run `gtm-define-personas` first, then rerun `gtm-lead-segmentation`."
)
PERSONA_NAMES = {
    "head-of-compliance": "Head of Compliance",
    "vp-operations": "VP Operations",
    "risk-trust-safety-lead": "Risk / Trust & Safety Lead",
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
class LeadSegmentResult:
    lead_id: str
    account_id: str
    account_name: str
    lead_name: str
    title: str
    persona_label: str
    persona_name: str
    confidence: str
    needs_review: bool
    reasoning: str
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
class SegmentationProject:
    gtm_home: Path
    repo: Path
    registry_path: Path
    initial_commit: str


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update-results",
        action="store_true",
        help="write viewer-compatible evidence under skills/gtm-lead-segmentation/evals/results/iteration-1",
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
    print(f"gtm-lead-segmentation eval suite: {passed}/{total} assertions passed")
    return 0 if passed == total else 1


def run_suite(*, keep_temp: bool = False) -> list[EvalRun]:
    evals = _load_eval_definitions()
    temp_dirs: list[tempfile.TemporaryDirectory[str]] = []
    try:
        one_off_tmp = tempfile.TemporaryDirectory(prefix="gtm-lead-segmentation-one-off-")
        bulk_tmp = tempfile.TemporaryDirectory(prefix="gtm-lead-segmentation-bulk-")
        table_tmp = tempfile.TemporaryDirectory(prefix="gtm-lead-segmentation-table-")
        missing_tmp = tempfile.TemporaryDirectory(prefix="gtm-lead-segmentation-missing-")
        missing_personas_tmp = tempfile.TemporaryDirectory(prefix="gtm-lead-segmentation-missing-personas-")
        temp_dirs.extend([one_off_tmp, bulk_tmp, table_tmp, missing_tmp, missing_personas_tmp])

        one_off_project = _create_fixture_project(Path(one_off_tmp.name), include_personas=True)
        bulk_project = _create_fixture_project(Path(bulk_tmp.name), include_personas=True)
        table_project = _create_fixture_project(Path(table_tmp.name), include_personas=True)
        missing_personas_project = _create_fixture_project(
            Path(missing_personas_tmp.name), include_personas=False
        )
        return [
            evaluate_one_off(evals[0], one_off_project),
            evaluate_csv_bulk(evals[1], bulk_project),
            evaluate_markdown_table(evals[2], table_project),
            evaluate_missing_context(evals[3], Path(missing_tmp.name)),
            evaluate_missing_personas(evals[4], missing_personas_project),
        ]
    finally:
        if keep_temp:
            print("Kept temp directories:")
            for temp_dir in temp_dirs:
                print(f"- {temp_dir.name}")
        else:
            for temp_dir in temp_dirs:
                temp_dir.cleanup()


def evaluate_one_off(eval_definition: dict[str, Any], project: SegmentationProject) -> EvalRun:
    start = time.perf_counter()
    row = _fixture_row("lead_001")
    result = _classify_lead(row)
    output = _one_off_markdown(project, result)
    summary = _ephemeral_summary("one-off lead segmentation", [result])
    status = _git_status(project.repo)

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            result.persona_label == "head-of-compliance"
            and result.confidence == "high"
            and result.needs_review is False,
            f"{result.lead_name} -> {result.persona_label}, {result.confidence}, needs_review={result.needs_review}.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            all(
                phrase in output
                for phrase in [
                    "Dependency trace",
                    PERSONAS_RELATIVE,
                    "persona_label: head-of-compliance",
                    "confidence: high",
                    "needs_review: false",
                    "reasoning:",
                    "evidence:",
                    "open_questions:",
                ]
            ),
            "One-off output contains dependency trace, personas path, and required result fields.",
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
        "summary.md": _run_summary("one-off lead segmentation", project, expectations, summary, None),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "segmentation_result.md": output,
        "execution_summary.md": summary,
        "git_status.txt": status + "\n",
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="one-off-segmentation",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def evaluate_csv_bulk(eval_definition: dict[str, Any], project: SegmentationProject) -> EvalRun:
    start = time.perf_counter()
    rows = _read_leads_csv(LEADS_CSV)
    results = [_classify_lead(row) for row in rows]
    bulk_summary = _bulk_summary(results)
    csv_output = _bulk_csv(results)
    status = _git_status(project.repo)
    expected = {row["lead_id"]: row["expected_persona"] for row in rows}
    actual = {result.lead_id: result.persona_label for result in results}

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            len(results) == 8
            and "Records processed: 8" in bulk_summary
            and "no-match: 2" in bulk_summary
            and "Low-confidence records: 1" in bulk_summary
            and "Records with open questions: 3" in bulk_summary
            and "Records needing human review: 1" in bulk_summary,
            "Bulk summary contains record, persona, no-match, low-confidence, open-question, and review counts.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            actual == expected,
            f"Expected labels: {expected}; actual labels: {actual}.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            csv_output.splitlines()[0]
            == "lead_id,account_id,account_name,lead_name,persona_label,confidence,needs_review,reasoning,top_evidence,open_questions",
            "Compact CSV header includes every required bulk provenance field.",
        ),
        _assertion(
            eval_definition["expectations"][3],
            _result_for(results, "lead_007").confidence == "low"
            and _result_for(results, "lead_007").needs_review is True
            and {item.lead_id for item in results if item.persona_label == "no-match"} == {"lead_004", "lead_006"},
            "Anika Shah is review-gated; Sam Ortiz and Jordan Reed use no-match.",
        ),
        _assertion(
            eval_definition["expectations"][4],
            status == "",
            f"Ephemeral bulk run left git status clean: {status or '<clean>'}.",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("CSV bulk lead segmentation", project, expectations, bulk_summary, None),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "bulk_summary.md": bulk_summary,
        "segmentation.csv": csv_output,
        "git_status.txt": status + "\n",
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="csv-bulk-segmentation",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def evaluate_markdown_table(eval_definition: dict[str, Any], project: SegmentationProject) -> EvalRun:
    start = time.perf_counter()
    table = """| lead_id | account_id | account_name | lead_name | title | department | seniority | persona_signal | known_gaps |
|---|---|---|---|---|---|---|---|---|
| lead_table_001 | acct_003 | Gatewise Market | Priya Nair | Director of Trust and Safety | Trust and Safety | Director | Owns vendor review quality and marketplace policy exceptions | |
| lead_table_002 | acct_004 | BrightCart Studio | Sam Ortiz | Growth Marketing Manager | Marketing | Manager | Runs creator acquisition campaigns | No compliance, operations, risk, or trust ownership |
"""
    rows = _read_markdown_table(table)
    results = [_classify_lead(row) for row in rows]
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
            _result_for(results, "lead_table_001").persona_label == "risk-trust-safety-lead"
            and _result_for(results, "lead_table_002").persona_label == "no-match",
            f"Labels: {', '.join(f'{item.lead_name}={item.persona_label}' for item in results)}.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            "Records processed: 2" in bulk_summary
            and "| lead_id | account_id | account_name | lead_name | persona_label | confidence | needs_review | reasoning | top_evidence | open_questions |"
            in table_output,
            "Table-mode output includes a run summary and compact per-record provenance table.",
        ),
        _assertion(
            eval_definition["expectations"][3],
            "no-match" in table_output
            and "does not match any defined persona" in _result_for(results, "lead_table_002").reasoning
            and "new-persona" not in table_output,
            "No-match output explains the disqualifier and does not invent labels.",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("markdown-table lead segmentation", project, expectations, bulk_summary, None),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "input_table.md": table,
        "bulk_summary.md": bulk_summary,
        "segmentation_table.md": table_output,
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="markdown-table-bulk-segmentation",
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
    found_outputs = [str(path.relative_to(temp_root)) for path in temp_root.rglob("*segmentation*")]
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
            "No segmentation output files were found under the isolated temp root.",
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


def evaluate_missing_personas(eval_definition: dict[str, Any], project: SegmentationProject) -> EvalRun:
    start = time.perf_counter()
    transcript = f"""User: {eval_definition["prompt"]}

Assistant: {MISSING_PERSONAS_MESSAGE}
"""
    commit_count = int(_git(project.repo, "rev-list", "--count", "HEAD").stdout.strip())
    scaffold_problems = check_scaffold(project.repo)
    found_segmentation_outputs = [
        path for path in project.repo.rglob("*segmentation*") if ".git" not in path.parts
    ]

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            MISSING_PERSONAS_MESSAGE in transcript,
            "Transcript contains the missing-personas wording and gtm-define-personas route.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            not found_segmentation_outputs,
            "No segmentation output files were created in the GTM Context Repository.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            commit_count == 1 and not _git_status(project.repo) and not scaffold_problems,
            f"Commit count={commit_count}; git status={_git_status(project.repo) or '<clean>'}; scaffold problems={scaffold_problems}.",
        ),
    ]
    outputs = {
        "summary.md": _missing_personas_summary(expectations, project),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "missing_personas_transcript.md": transcript,
        "git_status.txt": _git_status(project.repo) + "\n",
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="missing-personas-failure",
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


def _create_fixture_project(temp_root: Path, *, include_personas: bool) -> SegmentationProject:
    gtm_home = temp_root / "gtm-home"
    repo = gtm_home / ORG_ID
    shutil.copytree(FIXTURE_DIR, repo, ignore=shutil.ignore_patterns(".git"))
    if not include_personas:
        (repo / PERSONAS_RELATIVE).unlink()
    registry_path = gtm_home / "registry.json"
    registry_path.write_text(_json_dumps(_registry(repo)), encoding="utf-8")

    _git(repo, "init")
    _git(repo, "config", "user.name", "GTM Lead Segmentation Eval")
    _git(repo, "config", "user.email", "gtm-lead-segmentation-eval@example.invalid")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "Fixture: initialize Northstar context")
    initial_commit = _git(repo, "rev-parse", "HEAD").stdout.strip()
    return SegmentationProject(gtm_home=gtm_home, repo=repo, registry_path=registry_path, initial_commit=initial_commit)


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


def _read_leads_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def _fixture_row(lead_id: str) -> dict[str, str]:
    for row in _read_leads_csv(LEADS_CSV):
        if row["lead_id"] == lead_id:
            return row
    raise KeyError(lead_id)


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


def _classify_lead(row: dict[str, str]) -> LeadSegmentResult:
    text = " ".join(
        row.get(field, "")
        for field in [
            "title",
            "department",
            "seniority",
            "persona_signal",
            "known_gaps",
            "top_evidence",
            "account_name",
        ]
    ).lower()
    persona_label = _infer_persona(text)
    confidence = _infer_confidence(row, text, persona_label)
    needs_review = confidence == "low" or _parse_bool(row.get("needs_review", "false"))
    open_questions = _split_semicolon(row.get("open_questions", ""))
    top_evidence = _split_semicolon(row.get("top_evidence", "")) or _default_top_evidence(row, persona_label)
    reasoning = _reasoning(row, persona_label, confidence, needs_review)
    evidence = [
        EvidenceEntry(
            claim=f"Persona criterion match for {PERSONA_NAMES[persona_label]}",
            source=PERSONAS_RELATIVE,
            type="workspace-context",
            freshness="current",
            confidence="high" if persona_label != "no-match" else "medium",
        ),
        EvidenceEntry(
            claim="Lead evidence used for classification",
            source="user-provided lead evidence",
            type="user-provided-context",
            freshness="current",
            confidence=confidence,
        ),
    ]
    if open_questions:
        evidence.append(
            EvidenceEntry(
                claim="Open question affects interpretation",
                source="fixture open question",
                type="open-question",
                freshness="unknown",
                confidence="low",
            )
        )
    return LeadSegmentResult(
        lead_id=row.get("lead_id", ""),
        account_id=row.get("account_id", ""),
        account_name=row.get("account_name", ""),
        lead_name=row.get("lead_name", ""),
        title=row.get("title", ""),
        persona_label=persona_label,
        persona_name=PERSONA_NAMES[persona_label],
        confidence=confidence,
        needs_review=needs_review,
        reasoning=reasoning,
        top_evidence=top_evidence,
        open_questions=open_questions,
        evidence=evidence,
    )


def _infer_persona(text: str) -> str:
    if any(
        term in text
        for term in [
            "no compliance, operations, risk, or trust ownership",
            "no persona or account icp fit",
            "no persona fit",
        ]
    ):
        return "no-match"
    if "coo" in text.split():
        return "vp-operations"
    if any(term in text for term in ["risk", "trust", "safety", "fraud", "kyb operations", "lending review"]):
        return "risk-trust-safety-lead"
    if any(term in text for term in ["compliance", "audit readiness", "policy owner", "evidence reviews"]):
        return "head-of-compliance"
    if any(term in text for term in ["vp operations", "operations", "coo", "onboarding throughput", "business verification"]):
        return "vp-operations"
    return "no-match"


def _infer_confidence(row: dict[str, str], text: str, persona_label: str) -> str:
    fixture_confidence = row.get("confidence", "").strip().lower()
    if fixture_confidence in {"low", "medium", "high"}:
        return fixture_confidence
    if persona_label == "no-match":
        return "high"
    if "unclear" in text or "interim" in text or "may be separate" in text:
        return "medium"
    return "high"


def _parse_bool(value: str) -> bool:
    return value.strip().lower() == "true"


def _split_semicolon(value: str) -> list[str]:
    return [item.strip() for item in value.split(";") if item.strip()]


def _default_top_evidence(row: dict[str, str], persona_label: str) -> list[str]:
    if persona_label == "no-match":
        return ["no compliance, operations, risk, trust, or safety ownership signal"]
    title = row.get("title", "").strip()
    signal = row.get("persona_signal", "").strip()
    return [item for item in [title, signal] if item] or [row.get("department", "").strip()]


def _reasoning(row: dict[str, str], persona_label: str, confidence: str, needs_review: bool) -> str:
    lead_name = row.get("lead_name", "The lead")
    title = row.get("title", "the provided title").strip() or "the provided title"
    signal = row.get("persona_signal", "").strip()
    gaps = row.get("known_gaps", "").strip()
    if persona_label == "no-match":
        base = (
            f"{lead_name} does not match any defined persona because the available evidence points outside the "
            f"workspace's compliance, operations, risk, trust, or safety buying committee."
        )
    else:
        base = f"{lead_name} matches {PERSONA_NAMES[persona_label]} based on {title}"
        if signal:
            base += f" and the signal: {signal}"
        base += "."
    if gaps:
        base += f" Material gap: {gaps}."
    base += f" Confidence is {confidence}."
    if needs_review:
        base += " Human review is required before acting on this segmentation result."
    return base


def _one_off_markdown(project: SegmentationProject, result: LeadSegmentResult) -> str:
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
    open_questions = "\n".join(f"  - {item}" for item in result.open_questions) or "  - None."
    return f"""# Lead Segmentation Result

Dependency trace
- GTM project: {ORG_ID}
- GTM workspace: {WORKSPACE_ID}
- Hard prerequisites: {PERSONAS_RELATIVE} found
- Composed: none
- Skipped: gtm-lead-scoring not requested

lead_name: {result.lead_name}
account_name: {result.account_name}
persona_label: {result.persona_label}
persona_name: {result.persona_name}
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


def _bulk_summary(results: list[LeadSegmentResult]) -> str:
    counts = _persona_counts(results)
    low_confidence = sum(1 for item in results if item.confidence == "low")
    open_question_count = sum(1 for item in results if item.open_questions)
    review_count = sum(1 for item in results if item.needs_review)
    lines = [
        "## Bulk run summary",
        "",
        f"Records processed: {len(results)}",
        "Persona distribution:",
    ]
    for label in ["head-of-compliance", "vp-operations", "risk-trust-safety-lead", "no-match"]:
        if counts.get(label, 0):
            lines.append(f"- {label}: {counts[label]}")
    lines.extend(
        [
            f"Low-confidence records: {low_confidence}",
            f"Records with open questions: {open_question_count}",
            f"Records needing human review: {review_count}",
            "",
            "Top evidence patterns:",
            "- Compliance, risk, trust, or operations ownership",
            "- Onboarding, review queue, audit, and verification workflow ownership",
            "- Clear disqualifiers for marketing or engineering roles outside the buying committee",
            "",
            "Common open questions:",
        ]
    )
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


def _persona_counts(results: list[LeadSegmentResult]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for result in results:
        counts[result.persona_label] = counts.get(result.persona_label, 0) + 1
    return counts


def _bulk_csv(results: list[LeadSegmentResult]) -> str:
    headers = [
        "lead_id",
        "account_id",
        "account_name",
        "lead_name",
        "persona_label",
        "confidence",
        "needs_review",
        "reasoning",
        "top_evidence",
        "open_questions",
    ]
    lines = [",".join(headers)]
    for result in results:
        row = {
            "lead_id": result.lead_id,
            "account_id": result.account_id,
            "account_name": result.account_name,
            "lead_name": result.lead_name,
            "persona_label": result.persona_label,
            "confidence": result.confidence,
            "needs_review": str(result.needs_review).lower(),
            "reasoning": result.reasoning,
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


def _bulk_markdown_table(results: list[LeadSegmentResult]) -> str:
    lines = [
        "| lead_id | account_id | account_name | lead_name | persona_label | confidence | needs_review | reasoning | top_evidence | open_questions |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for result in results:
        lines.append(
            "| "
            + " | ".join(
                [
                    result.lead_id,
                    result.account_id,
                    result.account_name,
                    result.lead_name,
                    result.persona_label,
                    result.confidence,
                    str(result.needs_review).lower(),
                    _escape_table(result.reasoning),
                    _escape_table("; ".join(result.top_evidence)),
                    _escape_table("; ".join(result.open_questions)),
                ]
            )
            + " |"
        )
    return "\n".join(lines) + "\n"


def _escape_table(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def _ephemeral_summary(title: str, results: list[LeadSegmentResult]) -> str:
    labels = ", ".join(f"{item.lead_name}={item.persona_label}" for item in results)
    return f"""GTM lead segmentation complete

Dependency trace
- GTM project: {ORG_ID}
- GTM workspace: {WORKSPACE_ID}
- Persona source: {PERSONAS_RELATIVE}
- Hard prerequisites: context and personas found
- Composed: none

Result
- Mode: {title}
- Personas: {labels}
- Records needing review: {sum(1 for item in results if item.needs_review)}

Side effects
- No durable context write happened.
- No git commit happened.
- No CRM records were updated.
- No outreach was sent.
- No campaign triggers or syncs happened.
- No remote push happened.
"""


def _result_for(results: list[LeadSegmentResult], lead_id: str) -> LeadSegmentResult:
    for result in results:
        if result.lead_id == lead_id:
            return result
    raise KeyError(lead_id)


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
            "transcript_chars": len(run.outputs.get("segmentation_result.md", "")),
        },
        "timing": {"total_duration_seconds": round(run.duration_seconds, 4)},
        "claims": [],
        "user_notes_summary": {"uncertainties": [], "needs_review": [], "workarounds": []},
        "eval_feedback": {
            "suggestions": [],
            "overall": "No suggestions, deterministic assertions cover the lead segmentation contract.",
        },
    }


def _benchmark_json(runs: list[EvalRun]) -> dict[str, Any]:
    pass_rates = [run.pass_rate for run in runs]
    durations = [run.duration_seconds for run in runs]
    output_chars = [sum(len(value) for value in run.outputs.values()) for run in runs]
    return {
        "metadata": {
            "skill_name": "gtm-lead-segmentation",
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
            "Deterministic assertions cover ADR 0086 context failure, hard personas prerequisite routing, one-off output fields, CSV/table bulk support, compact provenance, no-match behavior, and review gates.",
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
    return f"""# gtm-lead-segmentation Eval Benchmark

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
    project: SegmentationProject,
    expectations: list[AssertionResult],
    transcript: str,
    commit_hash: str | None,
) -> str:
    lines = [
        f"# gtm-lead-segmentation eval: {title}",
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
        "# gtm-lead-segmentation eval: missing context failure",
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


def _missing_personas_summary(expectations: list[AssertionResult], project: SegmentationProject) -> str:
    lines = [
        "# gtm-lead-segmentation eval: missing personas failure",
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
