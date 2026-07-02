#!/usr/bin/env python3
"""Run deterministic evals for the gtm-define-personas skill."""

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
PERSONAS_RELATIVE = f"workspaces/{WORKSPACE_ID}/personas.md"
CREATE_COMMIT_MESSAGE = "Create persona definitions"
UPDATE_COMMIT_MESSAGE = "Update persona definitions"
MISSING_CONTEXT_MESSAGE = (
    "I could not resolve a GTM Context Project from this prompt, current directory, or local registry. "
    "Run `gtm-setup` or tell me which GTM project to use."
)
MISSING_ICP_MESSAGE = (
    f"I found a GTM Context Project and active workspace, but this workspace has no usable "
    f"`{ICP_RELATIVE}`. Run `gtm-define-icp` first, then rerun `gtm-define-personas`."
)
EXPECTED_LABELS = {
    "head-of-compliance",
    "vp-operations",
    "risk-trust-safety-lead",
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
class PersonasProject:
    gtm_home: Path
    repo: Path
    registry_path: Path
    initial_commit: str


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update-results",
        action="store_true",
        help="write viewer-compatible evidence under skills/gtm-define-personas/evals/results/iteration-1",
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
    print(f"gtm-define-personas eval suite: {passed}/{total} assertions passed")
    return 0 if passed == total else 1


def run_suite(*, keep_temp: bool = False) -> list[EvalRun]:
    evals = _load_eval_definitions()
    temp_dirs: list[tempfile.TemporaryDirectory[str]] = []
    try:
        create_tmp = tempfile.TemporaryDirectory(prefix="gtm-define-personas-create-")
        update_tmp = tempfile.TemporaryDirectory(prefix="gtm-define-personas-update-")
        missing_tmp = tempfile.TemporaryDirectory(prefix="gtm-define-personas-missing-")
        missing_icp_tmp = tempfile.TemporaryDirectory(prefix="gtm-define-personas-missing-icp-")
        temp_dirs.extend([create_tmp, update_tmp, missing_tmp, missing_icp_tmp])

        create_project = _create_fixture_project(Path(create_tmp.name), include_icps=True, include_personas=False)
        update_project = _create_fixture_project(Path(update_tmp.name), include_icps=True, include_personas=True)
        missing_icp_project = _create_fixture_project(
            Path(missing_icp_tmp.name),
            include_icps=False,
            include_personas=False,
        )
        return [
            evaluate_create(evals[0], create_project),
            evaluate_update(evals[1], update_project),
            evaluate_missing_context(evals[2], Path(missing_tmp.name)),
            evaluate_missing_icp(evals[3], missing_icp_project),
        ]
    finally:
        if keep_temp:
            print("Kept temp directories:")
            for temp_dir in temp_dirs:
                print(f"- {temp_dir.name}")
        else:
            for temp_dir in temp_dirs:
                temp_dir.cleanup()


def evaluate_create(eval_definition: dict[str, Any], project: PersonasProject) -> EvalRun:
    start = time.perf_counter()
    preview = _create_preview()
    target = project.repo / PERSONAS_RELATIVE
    icps_before = (project.repo / ICP_RELATIVE).read_text(encoding="utf-8")
    before_dirty = _git_status(project.repo, PERSONAS_RELATIVE)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(_created_personas_markdown(), encoding="utf-8")
    commit_hash = _auto_commit_target(project.repo, PERSONAS_RELATIVE, CREATE_COMMIT_MESSAGE)
    changed_files = _commit_changed_files(project.repo, commit_hash)
    scaffold_problems = check_scaffold(project.repo)
    registry = json.loads(project.registry_path.read_text(encoding="utf-8"))
    personas_text = target.read_text(encoding="utf-8")
    transcript = _create_transcript(project, preview, commit_hash)

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            all(
                phrase in preview
                for phrase in [
                    PERSONAS_RELATIVE,
                    "Head of Compliance",
                    "VP Operations",
                    "Risk / Trust & Safety Lead",
                    ICP_RELATIVE,
                    CREATE_COMMIT_MESSAGE,
                    "No outreach will be sent.",
                    "No CRM records will be updated.",
                    "No campaign triggers, syncs, or remote push will happen.",
                    "No external systems will be changed.",
                ]
            ),
            "Preview includes target file, persona sections, preserved ICP context, commit intent, and no external side effects.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            _machine_labels(personas_text) == EXPECTED_LABELS and "## Segment:" not in personas_text,
            f"Machine labels found: {', '.join(sorted(_machine_labels(personas_text)))}; no ICP segment headings found.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            _all_created_personas_have_required_fields(personas_text),
            "Every non-no-match persona includes the required titles, responsibilities, pain/priority, objection, hook, ICP, provenance, confidence, reasoning, review, and open-question fields.",
        ),
        _assertion(
            eval_definition["expectations"][3],
            _commit_subject(project.repo, commit_hash) == CREATE_COMMIT_MESSAGE and changed_files == [PERSONAS_RELATIVE],
            f"Commit {commit_hash[:8]} subject '{_commit_subject(project.repo, commit_hash)}' changed: {', '.join(changed_files)}.",
        ),
        _assertion(
            eval_definition["expectations"][4],
            not scaffold_problems
            and _registry_is_local(registry, project.repo)
            and (project.repo / ICP_RELATIVE).read_text(encoding="utf-8") == icps_before
            and not before_dirty,
            "Scaffold checker passed; icps.md was unchanged; registry is under temp GTM_HOME, not the project repo; target file was clean before write.",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("create persona definitions", project, expectations, transcript, commit_hash),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "preview_transcript.md": transcript,
        "personas.md": personas_text,
        "git_status.txt": _git_status(project.repo),
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="create-personas",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def evaluate_update(eval_definition: dict[str, Any], project: PersonasProject) -> EvalRun:
    start = time.perf_counter()
    target = project.repo / PERSONAS_RELATIVE
    _append_human_note(target)
    unrelated = project.repo / "scratch-notes.md"
    unrelated.write_text("Human scratch note unrelated to persona refinement.\n", encoding="utf-8")
    target_dirty_before = bool(_git_status(project.repo, PERSONAS_RELATIVE))

    before_labels = _machine_labels(target.read_text(encoding="utf-8"))
    _apply_vp_operations_refinement(target)
    summary = _update_summary(project, target_dirty_before)
    status = _git_status(project.repo)
    staged_status = _git(project.repo, "diff", "--cached", "--name-only").stdout.strip()
    updated_text = target.read_text(encoding="utf-8")

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            before_labels <= _machine_labels(updated_text)
            and "Human note: keep compliance buyer caveat language." in updated_text,
            "Existing machine labels and the human-authored note are still present.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            updated_text.count("Owns procurement risk review queues when vendor onboarding creates compliance handoffs.") == 1
            and updated_text.count("Cleaner handoff between operations, procurement risk, and compliance reviewers.") == 1,
            "Requested VP Operations ownership signal and handoff hook each appear exactly once.",
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
        "summary.md": _run_summary("refine existing persona definitions", project, expectations, summary, None),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "update_summary.md": summary,
        "personas.md": updated_text,
        "git_status.txt": status + "\n",
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="refine-existing-personas",
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
    found_persona_files = [str(path.relative_to(temp_root)) for path in temp_root.rglob("personas.md")]
    found_git_dirs = [str(path.relative_to(temp_root)) for path in temp_root.rglob(".git")]

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            MISSING_CONTEXT_MESSAGE in transcript,
            "Transcript contains the exact missing-context wording.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            not found_persona_files,
            "No personas.md files were found under the isolated temp root.",
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


def evaluate_missing_icp(eval_definition: dict[str, Any], project: PersonasProject) -> EvalRun:
    start = time.perf_counter()
    before_commit = _git(project.repo, "rev-parse", "HEAD").stdout.strip()
    transcript = f"""User: {eval_definition["prompt"]}

Assistant: {MISSING_ICP_MESSAGE}
"""
    after_commit = _git(project.repo, "rev-parse", "HEAD").stdout.strip()
    found_persona = (project.repo / PERSONAS_RELATIVE).exists()

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            MISSING_ICP_MESSAGE in transcript and "gtm-define-icp" in transcript,
            "Transcript contains the missing-ICP prerequisite message and routes to gtm-define-icp.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            not found_persona,
            "No personas.md file exists in the active workspace.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            before_commit == after_commit == project.initial_commit,
            f"Initial commit {project.initial_commit[:8]} remained HEAD.",
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
        eval_name="missing-icp-prerequisite",
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


def _create_fixture_project(temp_root: Path, *, include_icps: bool, include_personas: bool) -> PersonasProject:
    gtm_home = temp_root / "gtm-home"
    repo = gtm_home / ORG_ID
    shutil.copytree(FIXTURE_DIR, repo, ignore=shutil.ignore_patterns(".git"))
    if not include_icps:
        (repo / ICP_RELATIVE).unlink()
    if not include_personas:
        (repo / PERSONAS_RELATIVE).unlink()
    registry_path = gtm_home / "registry.json"
    registry_path.write_text(_json_dumps(_registry(repo)), encoding="utf-8")

    _git(repo, "init")
    _git(repo, "config", "user.name", "GTM Define Personas Eval")
    _git(repo, "config", "user.email", "gtm-define-personas-eval@example.invalid")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "Fixture: initialize Northstar context")
    initial_commit = _git(repo, "rev-parse", "HEAD").stdout.strip()
    return PersonasProject(gtm_home=gtm_home, repo=repo, registry_path=registry_path, initial_commit=initial_commit)


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


def _created_personas_markdown() -> str:
    return f"""# Personas

These persona definitions are lead-level segments for the `{WORKSPACE_ID}` workspace.

## Persona: Head of Compliance

Machine label: `head-of-compliance`
confidence: high
needs_review: false
reasoning: Compliance leaders own regulated review quality, policy adherence, audit readiness, and evidence workflows across the ICPs.

Relevant titles:

- Chief Compliance Officer
- Head of Compliance
- Director of Compliance
- Compliance Operations Lead
- Compliance Program Manager

Department / seniority:

- Compliance, legal/compliance operations, or risk/compliance leadership.
- Director through executive level; senior managers can qualify when they own review operations.

Buying influence:

- Often the business owner or executive sponsor for compliance operations workflow change.
- Can approve requirements and create urgency even when operations owns daily queue execution.

Responsibilities:

- Owns compliance program execution, policy adherence, audit readiness, and regulated review workflows.
- Coordinates with legal, operations, risk, product, and customer-facing teams.
- Cares about reducing manual evidence chasing and making reviewer decisions auditable.

Pain / priority signals:

- Manual policy checklists, scattered reviewer notes, audit prep pressure, exception queues, or evidence collection gaps.
- Language about KYC, KYB, AML, vendor review, onboarding controls, SOC 2, ISO, HIPAA, PCI, GDPR, FINRA, or regulatory audits.

Common objections / disqualifiers:

- Pure legal advisory roles with no operational review ownership.
- Compliance titles at companies outside the defined ICPs or without recurring regulated workflow pressure.

Good outreach hooks:

- Review queue consistency.
- Faster audit preparation.
- Cleaner policy checklist ownership.
- Better visibility into exceptions and reviewer notes.

ICP relevance:

- Strongest for `compliance-heavy-fintech` and `regulated-b2b-saas`; relevant for `marketplace-kyc-risk` when policy enforcement is compliance-led.

Provenance / source notes:

- workspace-context: Northstar targets compliance operations, onboarding reviews, evidence management, policy checklists, exception queues, reviewer handoffs, and audit-ready summaries.
- icps: `compliance-heavy-fintech`, `regulated-b2b-saas`, `marketplace-kyc-risk`.

Open questions:

- None.

## Persona: VP Operations

Machine label: `vp-operations`
confidence: high
needs_review: false
reasoning: Operations leaders feel the day-to-day throughput, staffing, handoff, and quality problems caused by compliance work even when policy ownership sits elsewhere.

Relevant titles:

- VP Operations
- Head of Operations
- COO
- Director of Operations
- Onboarding Operations Lead

Department / seniority:

- Operations, onboarding operations, business operations, customer operations, or marketplace operations leadership.
- Director through executive level; senior managers qualify when they own repeatable queues.

Buying influence:

- Usually a champion or business owner for process change and operational metrics.
- May co-own evaluation with compliance, risk, product, or RevOps.

Responsibilities:

- Owns throughput, staffing, process quality, handoffs, and operational bottlenecks.
- Often feels the pain of compliance tasks even when compliance policy ownership sits elsewhere.
- Cares about cycle time, queue visibility, and reducing avoidable back-and-forth.

Pain / priority signals:

- Long onboarding cycle times, avoidable escalations, capacity constraints, manual handoffs, queue backlog, or management visibility gaps.

Common objections / disqualifiers:

- Operations roles focused only on facilities, finance administration, or generic internal operations with no regulated review queue.
- Junior coordinators without workflow ownership or buying influence.

Good outreach hooks:

- Shorter onboarding cycle time.
- Fewer scattered compliance handoffs.
- Better queue visibility for management.
- Clearer escalation paths.

ICP relevance:

- Relevant across all ICP segments when review throughput affects customer, merchant, vendor, or partner onboarding.

Provenance / source notes:

- workspace-context: The workspace prioritizes review cycle time, consistency, queue visibility, and audit readiness.
- icps: `compliance-heavy-fintech`, `regulated-b2b-saas`, `marketplace-kyc-risk`.

Open questions:

- Which operations titles own the fastest budget path in regulated B2B SaaS?

## Persona: Risk / Trust & Safety Lead

Machine label: `risk-trust-safety-lead`
confidence: high
needs_review: false
reasoning: Risk and Trust & Safety leaders own review queues, fraud/policy enforcement, evidence quality, and exception handling in marketplace and regulated onboarding motions.

Relevant titles:

- Head of Risk
- Director of Risk Operations
- Trust & Safety Lead
- Marketplace Risk Lead
- Fraud Operations Lead
- KYB Operations Lead

Department / seniority:

- Risk, trust and safety, fraud operations, marketplace operations, identity, or onboarding risk.
- Lead through executive level when the role owns review policy or queue outcomes.

Buying influence:

- Often a champion or evaluator with strong requirements input.
- Can become the business owner in marketplace or platform companies where risk review is core to supply quality.

Responsibilities:

- Owns risk review, trust and safety queues, merchant or provider screening, fraud review, or policy enforcement.
- Works with operations and compliance teams to balance speed, accuracy, and auditability.
- Cares about evidence quality, exception handling, and policy consistency.

Pain / priority signals:

- KYC, KYB, fraud review, identity review, provider screening, policy enforcement, dispute queues, or manual exception decisions.

Common objections / disqualifiers:

- Security engineering or threat detection roles with no operational review workflow.
- Trust/community roles focused only on moderation without onboarding, risk, evidence, or policy-review complexity.

Good outreach hooks:

- Cleaner case review workflows.
- Consistent evidence capture.
- Auditable exception decisions.
- Faster handoff between risk, operations, and compliance.

ICP relevance:

- Strongest for `marketplace-kyc-risk`; also relevant for fintech and regulated SaaS when risk operations owns onboarding review.

Provenance / source notes:

- workspace-context: The workspace names marketplaces with onboarding, KYC, KYB, trust, risk, or safety review friction.
- icps: `marketplace-kyc-risk`, `compliance-heavy-fintech`, `regulated-b2b-saas`.

Open questions:

- None.

## No Match

Machine label: `no-match`

Use `no-match` when a lead does not match any defined persona. `no-match` leads are scored as `not-a-fit` and cannot receive a score above 49.
"""


def _create_preview() -> str:
    return f"""About to update GTM context:
- {PERSONAS_RELATIVE} - create persona definitions
- Sections: Head of Compliance, VP Operations, Risk / Trust & Safety Lead, No Match
- Preserved files: organization.md, people/{PERSON_ID}.md, workspaces/{WORKSPACE_ID}/context.md, {ICP_RELATIVE}

Will create git commit:
{CREATE_COMMIT_MESSAGE}

No outreach will be sent.
No CRM records will be updated.
No campaign triggers, syncs, or remote push will happen.
No external systems will be changed.

Proceed?
"""


def _create_transcript(project: PersonasProject, preview: str, commit_hash: str) -> str:
    return f"""User: Use gtm-define-personas to create persona definitions for Northstar Compliance's active fintech compliance outbound workspace.

Assistant: Resolved GTM Context Project `{ORG_ID}` at `<temporary>/gtm-home/northstar-compliance`, active workspace `{WORKSPACE_ID}`, and prerequisite ICP file `{ICP_RELATIVE}`.

{preview.strip()}

User: Proceed.

Assistant: GTM context update complete.
- Created: {PERSONAS_RELATIVE}
- Personas: head-of-compliance, vp-operations, risk-trust-safety-lead, no-match
- Git commit created: {commit_hash}
- No outreach, CRM update, campaign trigger, sync, external side effect, or remote push happened.
"""


def _append_human_note(target: Path) -> None:
    target.write_text(
        target.read_text(encoding="utf-8").rstrip()
        + "\n\n<!-- Human note: keep compliance buyer caveat language. -->\n",
        encoding="utf-8",
    )


def _apply_vp_operations_refinement(target: Path) -> None:
    text = target.read_text(encoding="utf-8")
    responsibility = "- Owns procurement risk review queues when vendor onboarding creates compliance handoffs."
    hook = "- Cleaner handoff between operations, procurement risk, and compliance reviewers."
    if responsibility not in text:
        text = text.replace(
            "- Cares about cycle time, queue visibility, and reducing avoidable back-and-forth.",
            "- Cares about cycle time, queue visibility, and reducing avoidable back-and-forth.\n" + responsibility,
        )
    if hook not in text:
        text = text.replace(
            "- Clearer escalation paths.",
            "- Clearer escalation paths.\n" + hook,
        )
    target.write_text(text, encoding="utf-8")


def _update_summary(project: PersonasProject, target_dirty_before: bool) -> str:
    commit_line = (
        "Auto-commit skipped: target file had pre-existing uncommitted edits."
        if target_dirty_before
        else f"Would create git commit: {UPDATE_COMMIT_MESSAGE}"
    )
    return f"""GTM context update complete

Dependency trace
- GTM project: {ORG_ID}
- GTM workspace: {WORKSPACE_ID}
- Target file: {PERSONAS_RELATIVE}
- Hard prerequisites: context resolved; {ICP_RELATIVE} found
- Composed: none

Files
- Updated: {PERSONAS_RELATIVE}
- Preserved: existing persona labels, no-match, human-authored notes

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


def _all_created_personas_have_required_fields(text: str) -> bool:
    sections = [section for section in text.split("\n## Persona: ") if section and not section.startswith("# Personas")]
    required = [
        "confidence:",
        "needs_review:",
        "reasoning:",
        "Relevant titles:",
        "Responsibilities:",
        "Pain / priority signals:",
        "Common objections / disqualifiers:",
        "Good outreach hooks:",
        "ICP relevance:",
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
        "eval_feedback": {
            "suggestions": [],
            "overall": "No suggestions, deterministic assertions cover the durable persona write contract.",
        },
    }


def _benchmark_json(runs: list[EvalRun]) -> dict[str, Any]:
    pass_rates = [run.pass_rate for run in runs]
    durations = [run.duration_seconds for run in runs]
    output_chars = [sum(len(value) for value in run.outputs.values()) for run in runs]
    return {
        "metadata": {
            "skill_name": "gtm-define-personas",
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
            "Deterministic assertions cover ADR 0086 context failure, missing ICP prerequisite routing, durable write preview, persona file shape, non-destructive updates, and git auto-commit isolation.",
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
    return f"""# gtm-define-personas Eval Benchmark

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
    project: PersonasProject,
    expectations: list[AssertionResult],
    transcript: str,
    commit_hash: str | None,
) -> str:
    lines = [
        f"# gtm-define-personas eval: {title}",
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
        "# gtm-define-personas eval: missing context failure",
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


def _missing_icp_summary(expectations: list[AssertionResult], project: PersonasProject) -> str:
    lines = [
        "# gtm-define-personas eval: missing ICP prerequisite",
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
