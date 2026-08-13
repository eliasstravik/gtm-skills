#!/usr/bin/env python3
"""Deterministically grade gtm-workflow eval artifacts and transcripts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else ""


def visible_output(run_dir: Path) -> str:
    return "\n".join((run_dir / "outputs" / name).read_text(errors="replace") for name in ("conversation.md", "final.md", "artifact-report.md") if (run_dir / "outputs" / name).is_file())


def text(path: Path) -> str:
    return path.read_text(errors="replace") if path.is_file() else ""


def repo_for(snapshot: Path) -> Path:
    return next(path for path in (snapshot / ".gtm").iterdir() if (path / ".git").is_dir())


def clean_main(repo: Path, commits: int) -> bool:
    return git(repo, "branch", "--show-current") == "main" and not git(repo, "status", "--porcelain") and int(git(repo, "rev-list", "--count", "HEAD") or 0) == commits


def changed(repo: Path) -> set[str]:
    return set(git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").splitlines())


def contains_all(value: str, *terms: str) -> bool:
    lowered = value.lower()
    return all(term.lower() in lowered for term in terms)


def check(ok: bool, evidence: str) -> tuple[bool, str]:
    return bool(ok), evidence


def checks_for(name: str, run_dir: Path) -> list[tuple[bool, str]]:
    snapshot = run_dir / "sandbox_snapshot"
    repo = repo_for(snapshot)
    output = visible_output(run_dir)
    workflows = repo / "workflows"
    target_state = text(snapshot / "target-sandbox/clay/state.json")

    if name == "fresh-setup-invoke-only-connection":
        registry = text(workflows / "WORKFLOWS.md")
        ignore = text(repo / ".gitignore")
        return [
            check(contains_all(output, "author", "run", "inspect", "zapier", "connection") and "Zapier" not in re.findall(r"### ([^\n]+)", registry.split("## Connections")[0] if "## Connections" in registry else registry), "Checked capability explanation and Zapier classification."),
            check(contains_all(registry, "Default target: Clay", "## Connections", "Zapier", "500", "author", "run", "live", "inspect", "data", "estimate", "credits", "credential"), "Checked complete Clay registry, connection, and limit prose."),
            check(contains_all(ignore, "state.sqlite", "outputs/", "runs/", ".cache/") and clean_main(repo, 2) and changed(repo) <= {".gitignore", "workflows/WORKFLOWS.md"}, "Checked ignore lines and one clean scoped commit."),
            check("Target kind:" not in registry and "target-kind" not in registry and "AskUserQuestion" not in output, "Checked banned field/tool absence."),
        ]
    if name == "setup-second-target":
        registry = text(workflows / "WORKFLOWS.md")
        return [
            check(contains_all(registry, "Vercel Workflows", "northstar-automation", "author", "test", "deploy", "inspect", "runtime", "environment"), "Checked Vercel target operations."),
            check(contains_all(registry, "Default target: Local", "HUBSPOT_TOKEN", "Maximum 250 rows"), "Checked preservation of default, connection, and limit."),
            check(clean_main(repo, 2) and changed(repo) == {"workflows/WORKFLOWS.md"} and "before" in output.lower() and "after" in output.lower(), "Checked accepted scoped registry revision."),
            check("Target kind:" not in registry and not any(path.name.startswith("runtime-") for path in workflows.rglob("*")), "Checked absence of target-kind and adapters."),
        ]
    if name == "create-local-materializes-registry":
        record = text(workflows / "normalize-crm-accounts/WORKFLOW.md")
        registry = text(workflows / "WORKFLOWS.md")
        expected = {".gitignore", "workflows/WORKFLOWS.md", "workflows/normalize-crm-accounts/WORKFLOW.md", "workflows/normalize-crm-accounts/index.ts", "workflows/normalize-crm-accounts/schema.ts", "workflows/normalize-crm-accounts/index.test.ts"}
        return [
            check(contains_all(output, "quick local", "full", "WORKFLOWS.md") and bool(registry), "Checked missing-registry choice and materialization."),
            check(all(marker in output for marker in ("WORKFLOW.md", "index.ts", "schema.ts", "index.test.ts", ".gitignore")), "Checked complete multi-file acceptance preview markers."),
            check(contains_all(record, "Target: Local", "Kind: on-demand", "Repo path:") and contains_all(registry, "Local", "on-demand") and "outputs" in text(workflows / "normalize-crm-accounts/index.ts"), "Checked local record dereference and ignored output design."),
            check(clean_main(repo, 2) and expected <= changed(repo) and contains_all(output, "saved to history", "live", "no separate"), "Checked one accepted history entry and local live close."),
        ]
    if name == "create-triggered-infrastructure":
        record = text(workflows / "demo-request-router/WORKFLOW.md")
        project = snapshot / "projects/atlas-automation"
        return [
            check(contains_all(output, "local", "triggered", "Vercel Workflows") and ("cannot" in output.lower() or "unsupported" in output.lower()) and "Local (Recommended)" not in output, "Checked local refusal before target choice."),
            check(contains_all(record, "Target: Vercel Workflows", "Kind: triggered", "Repo path:") and "Demo Request Router" in text(project / "target-state.json") + output, "Checked validated infrastructure draft and record."),
            check(clean_main(repo, 2) and (workflows / "demo-request-router/WORKFLOW.md").is_file() and contains_all(output, "accepted", "deploy"), "Checked record save before deployment."),
            check(contains_all(output, "live", "validation", "saved to history") and "What would you like to do with your GTM workflows?" not in output, "Checked live close without a deploy lifecycle menu choice."),
        ]
    if name == "clay-on-demand-publish-and-cancel":
        renewals = workflows / "renewals-enrichment/WORKFLOW.md"
        churn = workflows / "churn-rescue/WORKFLOW.md"
        return [
            check(contains_all(output, "Renewals Enrichment", "on-demand", "publish", "live", "record is saved to history") and ("publish the validated" in output.lower() or "publish Renewals Enrichment" in output), "Checked separate on-demand publish gate after record save."),
            check(renewals.is_file() and contains_all(text(renewals), "Target: Clay", "Workflow ID:") and contains_all(target_state, "Renewals", "live"), "Checked saved record and live target artifact."),
            check(not churn.exists() and "Churn Rescue" not in target_state and contains_all(output, "Churn Rescue", "abandoned", "removed", "cancel"), "Checked abandoned draft cleanup and absent record."),
            check(clean_main(repo, 2) and changed(repo) == {"workflows/renewals-enrichment/WORKFLOW.md"}, "Checked no record-less artifact and one scoped commit."),
        ]
    if name == "run-external-cost-gate":
        return [
            check(contains_all(output, "1,200", "HubSpot", "2,400", "3,000", "pilot"), "Checked external-write scope, cost, limit, and pilot preview."),
            check(contains_all(output, "10", "pilot", "full") and target_state.lower().count("run") >= 2, "Checked pilot then full execution."),
            check(contains_all(output, "completed", "failed", "credits") and re.search(r"clay-(?:run-\d+|201-run-\d+)", output) is not None and clean_main(repo, 1), "Checked chat report, target run pointers, and unchanged workspace."),
            check("clay-201" in output + target_state and "saved to history" not in output.lower(), "Checked target dereference and no tracked workflow mutation."),
        ]
    if name == "run-local-ungated":
        result_path = workflows / "normalize-domains/outputs/result.csv"
        return [
            check("Target: Local" in text(workflows / "normalize-domains/WORKFLOW.md") and "would you like to run" not in output.lower(), "Checked local dereference and no gate."),
            check(result_path.is_file() and len(result_path.read_text().strip().splitlines()) == 6 and contains_all(output, "5", "processed"), "Checked five-row execution and report."),
            check(result_path.is_file() and "outputs/result.csv" not in git(repo, "ls-files") and "run log" not in "\n".join(git(repo, "ls-files").splitlines()), "Checked ignored output and no tracked run log."),
            check(clean_main(repo, 1), "Checked clean unchanged history."),
        ]
    if name == "inspect-single-workflow":
        return [
            check(contains_all(output, "clay-808", "Clay"), "Checked record-to-target resolution."),
            check(contains_all(output, "draft", "live", "validation", "run-9", "Salesforce", "1,000", "credit"), "Checked required inspection fields."),
            check("Would you like to save this proposal?" not in output and "repair" not in output.lower(), "Checked mutation-free named inspect."),
            check(clean_main(repo, 1) and "draftVersion\": 4" in target_state and "liveVersion\": 3" in target_state, "Checked byte-preserved workspace and target state."),
        ]
    if name == "inspect-node-health-repair":
        record = text(workflows / "account-cleanup/WORKFLOW.md")
        ignore = text(repo / ".gitignore")
        state = workflows / "account-cleanup/state.sqlite"
        return [
            check(contains_all(output, "Missing Target", "state.sqlite", "gitignore") and ("healthy" in output.lower() or "check" in output.lower()), "Checked complete first health report."),
            check(contains_all(output, "Would you like to save this proposal?", "WORKFLOW.md", ".gitignore", "untrack"), "Checked one complete accepted repair proposal."),
            check("Target: Local" in record and state.is_file() and "state.sqlite" not in git(repo, "ls-files") and contains_all(ignore, "state.sqlite", "outputs/", "runs/", ".cache/"), "Checked repaired binding, preserved untracked state, and ignore lines."),
            check(clean_main(repo, 2) and git(repo, "log", "-1", "--pretty=%s") == "Repair GTM workflow artifacts" and contains_all(output, "healthy", "saved to history"), "Checked exact repair entry and healthy rerun."),
        ]
    if name == "update-draft-registry-and-bare-publish":
        record = text(workflows / "account-scoring/WORKFLOW.md")
        registry = text(workflows / "WORKFLOWS.md")
        return [
            check("threshold 80" in record.lower() and "2 credits per row" in registry.lower() and contains_all(output, "before", "after", "validated"), "Checked validated target draft and complete tracked revisions."),
            check(contains_all(output, "draft", "80", "live", "70", "old logic"), "Checked stale-live deferral warning."),
            check(contains_all(output, "publish it", "make the validated", "live") and output.lower().count("would you like to save this proposal?") == 1, "Checked bare publish routing without a second byte preview."),
            check(contains_all(target_state, "draftThreshold\": 80", "liveThreshold\": 80") and clean_main(repo, 2) and {"workflows/WORKFLOWS.md", "workflows/account-scoring/WORKFLOW.md"} <= changed(repo), "Checked verified live state and scoped history."),
        ]
    if name == "delete-record-only-and-bound-target":
        legacy = workflows / "legacy-enrichment/WORKFLOW.md"
        registry = text(workflows / "WORKFLOWS.md")
        return [
            check(contains_all(output, "target", "record only", "cancel", "keeps running", "no longer tracked"), "Checked separate deletion choices and unmanagement warning."),
            check(not legacy.exists() and contains_all(target_state, "clay-900", "live") and clean_main(repo, 2), "Checked record-only deletion and preserved target artifact."),
            check(contains_all(output, "Local", "Normalize Accounts") and ("cannot" in output.lower() or "rebind" in output.lower() or "bound" in output.lower()), "Checked bound-target refusal."),
            check("### Local" in registry and (workflows / "normalize-accounts/WORKFLOW.md").is_file() and changed(repo) == {"workflows/legacy-enrichment/WORKFLOW.md"} and "recover" in output.lower(), "Checked preserved registry/bound record, scoped commit, and recovery."),
        ]
    raise ValueError(name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    args = parser.parse_args()
    for eval_dir in sorted(args.iteration.glob("eval-*")):
        metadata = json.loads((eval_dir / "eval_metadata.json").read_text())
        for configuration in ("with_skill", "without_skill"):
            run_dir = eval_dir / configuration / "run-1"
            if not (run_dir / "executor_status.json").is_file():
                continue
            checks = checks_for(metadata["eval_name"], run_dir)
            expectations = [{"text": assertion, "passed": passed, "evidence": evidence} for assertion, (passed, evidence) in zip(metadata["assertions"], checks, strict=True)]
            passed = sum(item["passed"] for item in expectations)
            grading = {"expectations": expectations, "summary": {"passed": passed, "failed": len(expectations) - passed, "total": len(expectations), "pass_rate": round(passed / len(expectations), 4)}, "execution_metrics": json.loads((run_dir / "outputs/metrics.json").read_text()), "timing": json.loads((run_dir / "timing.json").read_text()), "claims": [], "user_notes_summary": {"uncertainties": [], "needs_review": [], "workarounds": []}, "eval_feedback": {"suggestions": [], "overall": "Assertions are deterministic and scenario-specific."}}
            (run_dir / "grading.json").write_text(json.dumps(grading, indent=2) + "\n")
            print(f"{metadata['eval_name']} {configuration}: {passed}/{len(expectations)}")


if __name__ == "__main__":
    main()
