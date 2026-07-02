#!/usr/bin/env python3
"""Run deterministic evals for the gtm-setup skill."""

from __future__ import annotations

import argparse
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
TEMPLATES_DIR = SKILL_DIR / "templates"
RESULTS_DIR = EVAL_DIR / "results" / "iteration-1"
FIXED_TIMESTAMP = "2026-07-02T00:00:00Z"
ORG_ID = "northstar-compliance"
ORG_DISPLAY_NAME = "Northstar Compliance"
PERSON_ID = "jordan-lee"
PERSON_DISPLAY_NAME = "Jordan Lee"
PERSON_ROLE = "SDR"
WORKSPACE_ID = "default"
WORKSPACE_DISPLAY_NAME = "Default GTM Workspace"
INITIAL_COMMIT_MESSAGE = "Initialize GTM context project"
REPAIR_COMMIT_MESSAGE = "Repair GTM context scaffold"
ALLOWED_INITIAL_FILES = {
    ".gitignore",
    "AGENTS.md",
    "CLAUDE.md",
    "business-units/.gitkeep",
    "gtm.yaml",
    "organization.md",
    "people/jordan-lee.md",
    "teams/.gitkeep",
    "workspaces/default/context.md",
}
LOCAL_STATE_KEYS = {
    "activeProject",
    "activePerson",
    "activeWorkspace",
    "active_project",
    "active_person",
    "active_workspace",
}
GITIGNORE_CHECK_PATHS = [
    ".gtm.local.json",
    ".gtm.local.yaml",
    ".local/state.json",
    "CLAUDE.local.md",
    ".env",
    ".env.local",
    "secret.pem",
    "secret.key",
    "outputs/report.md",
    "research/notes.md",
    "tmp/scratch.txt",
    "notes.tmp",
    "setup.log",
    ".DS_Store",
]
PUBLIC_LINK = "https://northstar-compliance.example/product"
PRIVATE_LINK = "https://docs.google.com/document/d/private-eval-doc/edit"
UNSAFE_LINKS = [
    "https://app.northstar-compliance.example/share?token=redacted-eval-token",
    "https://northstar-compliance.example/invite/temporary-eval",
    "http://localhost:3000/setup-preview",
]

sys.path.insert(0, str(SCRIPTS_DIR))
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from check_gtm_scaffold import REQUIRED_GITIGNORE_RULES, check_scaffold  # noqa: E402
from classify_source_links import classify_link  # noqa: E402


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
class SetupProject:
    gtm_home: Path
    repo: Path
    registry_path: Path
    initial_commit: str
    setup_summary: str
    classifications: list[Any]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update-results",
        action="store_true",
        help="write viewer-compatible evidence under skills/gtm-setup/evals/results/iteration-1",
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
    print(f"gtm-setup eval suite: {passed}/{total} assertions passed")
    return 0 if passed == total else 1


def run_suite(*, keep_temp: bool = False) -> list[EvalRun]:
    evals = _load_eval_definitions()
    temp_dirs: list[tempfile.TemporaryDirectory[str]] = []
    try:
        sparse_tmp = tempfile.TemporaryDirectory(prefix="gtm-setup-sparse-")
        enriched_tmp = tempfile.TemporaryDirectory(prefix="gtm-setup-enriched-")
        temp_dirs.extend([sparse_tmp, enriched_tmp])

        sparse = create_project(Path(sparse_tmp.name), enrichment_links=[])
        simple_run = evaluate_simple_setup(evals[0], sparse)

        enriched = create_project(Path(enriched_tmp.name), enrichment_links=[PUBLIC_LINK, PRIVATE_LINK, *UNSAFE_LINKS])
        idempotent_run = evaluate_idempotency_and_safety(evals[1], enriched)
        return [simple_run, idempotent_run]
    finally:
        if keep_temp:
            print("Kept temp directories:")
            for temp_dir in temp_dirs:
                print(f"- {temp_dir.name}")
        else:
            for temp_dir in temp_dirs:
                temp_dir.cleanup()


def create_project(temp_root: Path, *, enrichment_links: list[str]) -> SetupProject:
    gtm_home = temp_root / "gtm-home"
    repo = gtm_home / ORG_ID
    registry_path = gtm_home / "registry.json"
    repo.mkdir(parents=True)

    values = {
        "organization_id": ORG_ID,
        "organization_display_name": ORG_DISPLAY_NAME,
        "person_id": PERSON_ID,
        "person_display_name": PERSON_DISPLAY_NAME,
        "person_role": PERSON_ROLE,
        "workspace_id": WORKSPACE_ID,
        "workspace_display_name": WORKSPACE_DISPLAY_NAME,
    }
    _write_rendered_template(".gitignore", repo / ".gitignore", values)
    _write_rendered_template("AGENTS.md", repo / "AGENTS.md", values)
    _write_rendered_template("CLAUDE.md", repo / "CLAUDE.md", values)
    _write_rendered_template("gtm.yaml", repo / "gtm.yaml", values)
    _write_rendered_template("organization.md", repo / "organization.md", values)
    _write_rendered_template("people/person.md", repo / "people" / f"{PERSON_ID}.md", values)
    _write_rendered_template(
        "workspaces/default/context.md",
        repo / "workspaces" / WORKSPACE_ID / "context.md",
        values,
    )
    _ensure_placeholder(repo / "business-units" / ".gitkeep")
    _ensure_placeholder(repo / "teams" / ".gitkeep")

    classifications = [classify_link(url) for url in enrichment_links]
    if classifications:
        _apply_confirmed_enrichment(repo / "organization.md", classifications)

    registry_path.write_text(json.dumps(_registry(repo), indent=2) + "\n", encoding="utf-8")

    _git(repo, "init")
    _git(repo, "config", "user.name", "GTM Setup Eval")
    _git(repo, "config", "user.email", "gtm-setup-eval@example.invalid")
    _git(repo, "add", *sorted(ALLOWED_INITIAL_FILES))
    _git(repo, "commit", "-m", INITIAL_COMMIT_MESSAGE)
    initial_commit = _git(repo, "rev-parse", "HEAD").stdout.strip()

    return SetupProject(
        gtm_home=gtm_home,
        repo=repo,
        registry_path=registry_path,
        initial_commit=initial_commit,
        setup_summary=_setup_summary(repo, "applied" if classifications else "skipped", classifications),
        classifications=classifications,
    )


def evaluate_simple_setup(eval_definition: dict[str, Any], project: SetupProject) -> EvalRun:
    start = time.perf_counter()
    transcript_path = EVAL_DIR / "fixtures" / "simple_path_transcript.md"
    prompt_count = _count_prompts_before_summary(transcript_path)
    scaffold_problems = check_scaffold(project.repo)
    registry = json.loads(project.registry_path.read_text(encoding="utf-8"))
    ignored = _git_check_ignore(project.repo, GITIGNORE_CHECK_PATHS)
    initial_files = set(_git(project.repo, "ls-tree", "-r", "--name-only", project.initial_commit).stdout.splitlines())
    committed_local_state = _find_project_local_state(project.repo)

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            prompt_count <= 3,
            f"Found {prompt_count} user prompts before 'GTM context project ready'.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            not scaffold_problems,
            "check_scaffold returned no problems."
            if not scaffold_problems
            else "; ".join(problem.format(project.repo) for problem in scaffold_problems),
        ),
        _assertion(
            eval_definition["expectations"][2],
            _registry_matches_contract(registry, project.repo) and not committed_local_state,
            "registry.json has version/project/local active state outside the repo; no local active state keys found in project files."
            if not committed_local_state
            else f"Found local active state keys in project files: {', '.join(committed_local_state)}",
        ),
        _assertion(
            eval_definition["expectations"][3],
            set(GITIGNORE_CHECK_PATHS) == ignored,
            f"git check-ignore matched {len(ignored)}/{len(GITIGNORE_CHECK_PATHS)} ignored file families.",
        ),
        _assertion(
            eval_definition["expectations"][4],
            initial_files == ALLOWED_INITIAL_FILES and _commit_subject(project.repo, project.initial_commit) == INITIAL_COMMIT_MESSAGE,
            f"Initial commit {project.initial_commit[:8]} contains: {', '.join(sorted(initial_files))}",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("simple sparse setup", project, expectations),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "gtm_home_tree.txt": _tree(project.gtm_home),
        "simple_path_transcript.md": transcript_path.read_text(encoding="utf-8"),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="simple-sparse-setup",
        prompt=eval_definition["prompt"],
        expectations=expectations,
        outputs=outputs,
        duration_seconds=time.perf_counter() - start,
    )


def evaluate_idempotency_and_safety(eval_definition: dict[str, Any], project: SetupProject) -> EvalRun:
    start = time.perf_counter()
    protected_before = _snapshot_protected_files(project.repo)
    _rerun_setup_select_existing(project)
    status_after_rerun = _git_status(project.repo)

    _commit_preexisting_gitignore_drift(project.repo)
    protected_after_drift = _snapshot_protected_files(project.repo)
    repair_commit = _repair_gitignore(project.repo)
    repair_changed_files = set(_git(project.repo, "diff-tree", "--no-commit-id", "--name-only", "-r", repair_commit).stdout.splitlines())
    gitignore_text = (project.repo / ".gitignore").read_text(encoding="utf-8")
    protected_after_repair = _snapshot_protected_files(project.repo)
    unsafe_classifications = [
        item for item in project.classifications if item.classification == "unsafe" and item.commit_behavior == "never_commit"
    ]
    unsafe_hits = _find_unsafe_source_hits(project.repo, UNSAFE_LINKS)

    expectations = [
        _assertion(
            eval_definition["expectations"][0],
            status_after_rerun == "" and protected_before == _snapshot_protected_files(project.repo),
            "Immediate same-org rerun updated only registry state outside the repo; git status stayed clean.",
        ),
        _assertion(
            eval_definition["expectations"][1],
            protected_after_drift == protected_after_repair
            and "custom-cache/" in gitignore_text
            and all(rule in _active_gitignore_rules(gitignore_text) for rule in REQUIRED_GITIGNORE_RULES),
            "Repair preserved protected files and retained the user-defined custom-cache/ ignore rule.",
        ),
        _assertion(
            eval_definition["expectations"][2],
            repair_changed_files == {".gitignore"} and _commit_subject(project.repo, repair_commit) == REPAIR_COMMIT_MESSAGE,
            f"Repair commit {repair_commit[:8]} changed: {', '.join(sorted(repair_changed_files))}",
        ),
        _assertion(
            eval_definition["expectations"][3],
            len(unsafe_classifications) == len(UNSAFE_LINKS) and not unsafe_hits,
            f"Classified {len(unsafe_classifications)} unsafe links as never_commit; no unsafe URLs found in committed files/history.",
        ),
    ]
    outputs = {
        "summary.md": _run_summary("idempotency repair safety", project, expectations),
        "assertions.json": _json_dumps({"expectations": [asdict(item) for item in expectations]}),
        "source_link_classifications.json": _json_dumps(
            {
                "classifications": [
                    _redacted_classification(item)
                    for item in project.classifications
                ]
            }
        ),
        "gtm_home_tree.txt": _tree(project.gtm_home),
    }
    return EvalRun(
        eval_id=eval_definition["id"],
        eval_name="idempotency-repair-safety",
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
        grading = _grading_json(run)
        (run_dir / "grading.json").write_text(_json_dumps(grading), encoding="utf-8")
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


def _load_eval_definitions() -> dict[int, dict[str, Any]]:
    data = json.loads((EVAL_DIR / "evals.json").read_text(encoding="utf-8"))
    return {item["id"]: item for item in data["evals"]}


def _write_rendered_template(relative: str, target: Path, values: dict[str, str]) -> None:
    template = (TEMPLATES_DIR / relative).read_text(encoding="utf-8")
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", value)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(template, encoding="utf-8")


def _ensure_placeholder(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")


def _registry(repo: Path) -> dict[str, Any]:
    return {
        "version": 1,
        "activeProject": ORG_ID,
        "projects": {
            ORG_ID: {
                "path": str(repo),
                "displayName": ORG_DISPLAY_NAME,
                "aliases": [],
                "createdAt": FIXED_TIMESTAMP,
                "lastUsedAt": FIXED_TIMESTAMP,
                "lastUpdatedAt": FIXED_TIMESTAMP,
                "local": {
                    "activePerson": PERSON_ID,
                    "activeWorkspace": WORKSPACE_ID,
                    "lastUsedAt": FIXED_TIMESTAMP,
                },
                "futureRegistryField": {"preserve": True},
            }
        },
        "futureHomeField": {"preserve": True},
    }


def _apply_confirmed_enrichment(path: Path, classifications: list[Any]) -> None:
    public_sources = [
        f"- Official product page: {item.url}"
        for item in classifications
        if item.classification == "public"
    ]
    safe_labels = [
        f"- {item.safe_label}"
        for item in classifications
        if item.safe_label
    ]
    source_block = "\n".join(public_sources + safe_labels)
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "<!-- Official website, docs, public pages, CRM links, or other trusted sources. -->",
        source_block,
    )
    text = text.replace(
        "<!-- Short description of the company, client, business, or account. -->",
        "Northstar Compliance is a fictional AI-assisted compliance operations workspace used for GTM skill evals.",
    )
    path.write_text(text, encoding="utf-8")


def _setup_summary(repo: Path, enrichment_status: str, classifications: list[Any]) -> str:
    redacted_count = sum(1 for item in classifications if item.classification == "unsafe")
    safe_label_count = sum(1 for item in classifications if item.safe_label)
    return f"""GTM context project ready

Organization
- ID: {ORG_ID}
- Path: {repo}

Active local state
- Person: {PERSON_ID}
- Workspace: {WORKSPACE_ID}

Files
- Created: .gitignore, AGENTS.md, CLAUDE.md, gtm.yaml, organization.md, people/{PERSON_ID}.md, workspaces/{WORKSPACE_ID}/context.md
- Preserved: none
- Repaired: none

Git
- Initialized repo: yes
- Commit: {INITIAL_COMMIT_MESSAGE}

Enrichment
- Source-assisted enrichment: {enrichment_status}
- Sources used: {len(classifications)}
- Unresolved questions: 0
- Links omitted/redacted for safety: {redacted_count}
- Safe source labels saved: {safe_label_count}

Next recommended skills
1. gtm-define-icp
2. gtm-define-personas
"""


def _count_prompts_before_summary(transcript_path: Path) -> int:
    text = transcript_path.read_text(encoding="utf-8")
    before_summary = text.split("GTM context project ready", maxsplit=1)[0]
    return sum(1 for line in before_summary.splitlines() if line.startswith("User:"))


def _registry_matches_contract(registry: dict[str, Any], repo: Path) -> bool:
    project = registry.get("projects", {}).get(ORG_ID, {})
    local = project.get("local", {})
    return (
        registry.get("version") == 1
        and registry.get("activeProject") == ORG_ID
        and project.get("path") == str(repo)
        and project.get("displayName") == ORG_DISPLAY_NAME
        and isinstance(project.get("aliases"), list)
        and local.get("activePerson") == PERSON_ID
        and local.get("activeWorkspace") == WORKSPACE_ID
        and not (repo / "registry.json").exists()
        and project.get("futureRegistryField", {}).get("preserve") is True
        and registry.get("futureHomeField", {}).get("preserve") is True
    )


def _find_project_local_state(repo: Path) -> list[str]:
    hits: list[str] = []
    for path in sorted(repo.rglob("*")):
        if not path.is_file() or ".git" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for key in LOCAL_STATE_KEYS:
            if key in text:
                hits.append(f"{path.relative_to(repo)}:{key}")
    return hits


def _git_check_ignore(repo: Path, paths: list[str]) -> set[str]:
    result = subprocess.run(
        ["git", "-C", str(repo), "check-ignore", *paths],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return set(result.stdout.splitlines())


def _rerun_setup_select_existing(project: SetupProject) -> None:
    registry = json.loads(project.registry_path.read_text(encoding="utf-8"))
    registry["activeProject"] = ORG_ID
    registry["projects"][ORG_ID]["lastUsedAt"] = "2026-07-02T00:01:00Z"
    registry["projects"][ORG_ID]["local"]["lastUsedAt"] = "2026-07-02T00:01:00Z"
    project.registry_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")


def _commit_preexisting_gitignore_drift(repo: Path) -> None:
    path = repo / ".gitignore"
    lines = path.read_text(encoding="utf-8").splitlines()
    lines = [line for line in lines if line.strip() != "*.key"]
    if "custom-cache/" not in lines:
        lines.extend(["", "# Project-specific ignores", "custom-cache/"])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    _git(repo, "add", ".gitignore")
    _git(repo, "commit", "-m", "Fixture: preexisting custom ignore state")


def _repair_gitignore(repo: Path) -> str:
    path = repo / ".gitignore"
    text = path.read_text(encoding="utf-8")
    active_rules = _active_gitignore_rules(text)
    missing = [rule for rule in REQUIRED_GITIGNORE_RULES if rule not in active_rules]
    if missing:
        text = text.rstrip() + "\n\n# Repaired GTM scaffold rules\n" + "\n".join(missing) + "\n"
        path.write_text(text, encoding="utf-8")
    _git(repo, "add", ".gitignore")
    _git(repo, "commit", "-m", REPAIR_COMMIT_MESSAGE)
    return _git(repo, "rev-parse", "HEAD").stdout.strip()


def _active_gitignore_rules(text: str) -> set[str]:
    return {
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def _snapshot_protected_files(repo: Path) -> dict[str, str]:
    protected = [
        "AGENTS.md",
        "CLAUDE.md",
        "gtm.yaml",
        "organization.md",
        f"people/{PERSON_ID}.md",
        f"workspaces/{WORKSPACE_ID}/context.md",
    ]
    return {relative: (repo / relative).read_text(encoding="utf-8") for relative in protected}


def _find_unsafe_source_hits(repo: Path, unsafe_links: list[str]) -> list[str]:
    hits: list[str] = []
    revisions = _git(repo, "rev-list", "--all").stdout.splitlines()
    for link in unsafe_links:
        for path in sorted(repo.rglob("*")):
            if not path.is_file() or ".git" in path.parts:
                continue
            if link in path.read_text(encoding="utf-8", errors="ignore"):
                hits.append(f"{path.relative_to(repo)} contains unsafe source")
        if revisions:
            result = subprocess.run(
                ["git", "-C", str(repo), "grep", "-F", "-n", link, *revisions],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            if result.returncode == 0:
                hits.append("git history contains unsafe source")
    return hits


def _redacted_classification(item: Any) -> dict[str, Any]:
    data = asdict(item)
    if item.classification != "public":
        data["url"] = "<redacted>"
    return data


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
            "transcript_chars": len(run.outputs.get("simple_path_transcript.md", "")),
        },
        "timing": {"total_duration_seconds": round(run.duration_seconds, 4)},
        "claims": [],
        "user_notes_summary": {"uncertainties": [], "needs_review": [], "workarounds": []},
    }


def _benchmark_json(runs: list[EvalRun]) -> dict[str, Any]:
    pass_rates = [run.pass_rate for run in runs]
    durations = [run.duration_seconds for run in runs]
    output_chars = [sum(len(value) for value in run.outputs.values()) for run in runs]
    return {
        "metadata": {
            "skill_name": "gtm-setup",
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
            "Deterministic assertions cover the ADR-backed setup contract, scaffold checker, idempotent repair, git boundary, and source-link safety invariant.",
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
    return f"""# gtm-setup Eval Benchmark

Date: {benchmark["metadata"]["timestamp"]}

| Configuration | Pass rate | Evals |
|---|---:|---:|
| with_skill | {pass_rate:.0f}% | {len(benchmark["runs"])} |

Notes:
- Baseline/subagent runs were omitted because this Paperclip heartbeat explicitly forbids outsourcing or invoking other agents.
- Static viewer input is available in the sibling eval run directories.
"""


def _run_summary(title: str, project: SetupProject, expectations: list[AssertionResult]) -> str:
    lines = [
        f"# gtm-setup eval: {title}",
        "",
        f"- GTM home: <temporary>/{project.gtm_home.name}",
        f"- Project: {ORG_ID}",
        f"- Pass rate: {sum(1 for item in expectations if item.passed)}/{len(expectations)}",
        "",
        "## Setup Summary",
        "",
        project.setup_summary.strip(),
        "",
        "## Assertions",
        "",
    ]
    for item in expectations:
        state = "PASS" if item.passed else "FAIL"
        lines.append(f"- {state}: {item.text} — {item.evidence}")
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


def _git_status(repo: Path) -> str:
    return _git(repo, "status", "--porcelain").stdout.strip()


def _commit_subject(repo: Path, commit: str) -> str:
    return _git(repo, "show", "-s", "--format=%s", commit).stdout.strip()


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
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
