#!/usr/bin/env python3
"""Deterministically grade gtm-workflow Codex evaluation runs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess

REPO_ROOT = Path(__file__).resolve().parents[3]
EVAL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = REPO_ROOT / "skills/gtm-workflow/templates"


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        capture_output=True,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def text(path: Path) -> str:
    return path.read_text(errors="replace") if path.is_file() else ""


def visible(run_dir: Path) -> str:
    return "\n".join(
        text(run_dir / "outputs" / name)
        for name in ("conversation.md", "final.md", "artifact-report.md")
    )


def chat(run_dir: Path) -> str:
    return "\n".join(
        text(run_dir / "outputs" / name)
        for name in ("conversation.md", "final.md")
    )


def repo_for(run_dir: Path) -> Path | None:
    root = run_dir / "sandbox_snapshot/.gtm"
    if not root.is_dir():
        return None
    return next((path for path in root.iterdir() if (path / ".git").is_dir()), None)


def clean_main(repo: Path, commits: int | None = None) -> bool:
    if git(repo, "branch", "--show-current") != "main" or git(repo, "status", "--porcelain"):
        return False
    if commits is None:
        return True
    return int(git(repo, "rev-list", "--count", "HEAD") or 0) == commits


def changed(repo: Path) -> set[str]:
    return set(git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").splitlines())


def ignored(repo: Path, relative: str) -> bool:
    return (
        subprocess.run(
            ["git", "-C", str(repo), "check-ignore", "-q", relative],
            text=True,
            capture_output=True,
        ).returncode
        == 0
    )


def contains_all(value: str, *terms: str) -> bool:
    lowered = value.lower()
    return all(term.lower() in lowered for term in terms)


def header_lines(path: Path) -> list[str]:
    body = text(path)
    match = re.match(r"/\*\*\n(.*?)\n \*/", body, flags=re.S)
    if not match:
        return []
    return [line.removeprefix(" * ").strip() for line in match.group(1).splitlines()]


def canonical_runtime(workflows: Path) -> bool:
    pairs = (
        ("lib/agent.ts", "lib/agent.ts"),
        ("server/api/run/[...workflow].ts", "server/api/run/[...workflow].ts"),
        ("server/api/runs/[runId].get.ts", "server/api/runs/[runId].get.ts"),
    )
    return all(
        (workflows / actual).is_file()
        and (workflows / actual).read_bytes() == (TEMPLATES / expected).read_bytes()
        for actual, expected in pairs
    )


def conversation_valid(output: str) -> bool:
    if "AskUserQuestion" in output:
        return False
    chunks = re.split(r"(?m)^## Assistant\s*$", output)
    for chunk in chunks[1:]:
        assistant = re.split(r"(?m)^## User\s*$", chunk, maxsplit=1)[0].strip()
        if "?" in assistant:
            first = next((line.strip() for line in assistant.splitlines() if line.strip()), "")
            if not re.fullmatch(r"\*\*[^*\n]+\?\*\*", first):
                return False
            if len(re.findall(r"(?m)^\*\*[^*\n]+\?\*\*$", assistant)) != 1:
                return False
        if re.search(r"(?m)^\d+\. ", assistant):
            if "Reply with a number, or type your answer." not in assistant:
                return False
            if assistant.count("(Recommended)") > 1:
                return False
    return True


def safe_output(run_dir: Path) -> bool:
    output = visible(run_dir)
    status = json.loads(text(run_dir / "executor_status.json") or "{}")
    return (
        not status.get("secret_exposed", False)
        and "[REDACTED-EVAL-SECRET]" not in output
        and conversation_valid(text(run_dir / "outputs/conversation.md"))
    )


def workflow_files(workflows: Path, pattern: str = "*.ts") -> list[Path]:
    return sorted(
        path
        for path in (workflows / "flows").rglob(pattern)
        if path.name != "example.ts"
    )


def position(body: str, needle: str) -> int:
    return body.find(needle)


def checks_for(name: str, run_dir: Path) -> list[tuple[bool, str]]:
    output = visible(run_dir)
    user_chat = chat(run_dir)
    transcript = text(run_dir / "transcript.md")
    repo = repo_for(run_dir)

    if name == "handoff-without-workspace":
        return [
            (contains_all(user_chat, "gtm-workspace", "create") or contains_all(user_chat, "gtm-workspace", "connect"), "Checked handoff to gtm-workspace."),
            (repo is None and not (run_dir / "sandbox_snapshot/.gtm").exists(), "Checked that no workspace or Git repository was created."),
            ("Where should this workflow run?" not in user_chat and "MAX_ROWS" not in user_chat, "Checked that workflow authoring did not begin."),
        ]

    assert repo is not None
    workflows = repo / "workflows"
    flows = workflow_files(workflows)

    if name == "create-on-demand-local":
        flow = flows[0] if flows else Path()
        body = text(flow)
        cap_before_agent = (
            0 <= position(body, "MAX_ROWS") < position(body, "agent(")
            and 0 <= position(body, "MAX_SPEND_USD") < position(body, "agent(")
        )
        return [
            (canonical_runtime(workflows) and len(header_lines(flow)) == 5 and contains_all("\n".join(header_lines(flow)), "Runs: on this computer", "Kind: on-demand", "Owner:", "Providers:"), "Checked scaffold integrity and the five-line header."),
            (contains_all(user_chat, "**Where should this workflow run?**", "On this computer (Recommended)", "**Where should each run's results go?**", "Post them to a web address", "Gateway", "budget") and conversation_valid(text(run_dir / "outputs/conversation.md")), "Checked exact location/result questions and cost note."),
            (cap_before_agent and "maxUsd: COST_PER_ROW_USD" in body and "catch (error)" in body and "failed.push" in body, "Checked cap ordering, per-call bound, and row isolation."),
            (clean_main(repo, 2) and (workflows / ".env").is_file() and ignored(repo, "workflows/.env") and ignored(repo, "workflows/data"), "Checked one accepted create commit and ignored runtime state."),
            (safe_output(run_dir), "Checked conversation format and secret handling."),
        ]

    if name == "create-scheduled-vercel":
        flow = flows[0] if flows else Path()
        body = text(flow)
        lines = body.splitlines()
        use_index = next((i for i, line in enumerate(lines) if '"use workflow"' in line), -1)
        next_statement = next(
            (line.strip() for line in lines[use_index + 1 :] if line.strip() and not line.strip().startswith("//")),
            "",
        )
        cron = text(workflows / "vercel.json")
        return [
            (len(header_lines(flow)) == 6 and "export const scheduledInput" in body and next_statement == "arg ??= scheduledInput;", "Checked six-line header and immediate scheduled fallback."),
            (contains_all(user_chat, "On Vercel (Recommended)", "only when you or your agent ask", "Gateway", "budget") and safe_output(run_dir), "Checked both required location notes and choice order."),
            ("Keep them on Vercel; I'll fetch them when you ask" in user_chat, "Checked the scheduled Vercel result option."),
            (contains_all(cron, "/api/run/", "0 9 * * 1-5"), "Checked matching UTC cron route."),
            (clean_main(repo, 2) and not (workflows / ".vercel").exists() and contains_all(user_chat, "saved", "not live"), "Checked saved but not-live closure without linking."),
        ]

    if name == "create-nested-suborganization":
        nested = list((workflows / "flows/europe").glob("*.ts"))
        flow = nested[0] if nested else Path()
        result_files = list((workflows / "data").rglob("*.json")) if (workflows / "data").exists() else []
        return [
            (bool(nested) and not (repo / "suborgs/europe/workflows").exists(), "Checked root-owned nested flow placement."),
            (contains_all("\n".join(header_lines(flow)), "Owner: Acme Europe", "ICP: Europe Revenue"), "Checked owner and ICP header."),
            (contains_all(transcript + output, "/api/run/europe/", "data/") or bool(result_files), "Checked nested run route and result handling."),
            (clean_main(repo, 2) and safe_output(run_dir), "Checked one scoped create commit and safe conversation."),
        ]

    if name == "update-switch-location":
        flow = workflows / "flows/account-scoring.ts"
        package = json.loads(text(workflows / "package.json") or "{}")
        deployment = package.get("gtm", {}).get("vercel", {})
        key_check = transcript.lower().find("ai_gateway_api_key")
        link = transcript.lower().find("vercel link")
        return [
            (contains_all(text(flow), "Runs: on Vercel", "MAX_ROWS = 25", "MAX_SPEND_USD = 25", "COST_PER_ROW_USD = 1"), "Checked location switch with behavior and caps preserved."),
            (0 <= key_check < link and safe_output(run_dir), "Checked key-before-link ordering and secret safety."),
            (contains_all(json.dumps(deployment), "team", "project", "url", "acme-workflows"), "Checked non-secret gtm.vercel metadata."),
            (contains_all(transcript + output, "/api/run/account-scoring", "run-eval-001") and clean_main(repo), "Checked deployed route pilot and clean main."),
        ]

    if name == "inspect-project-health":
        return [
            (contains_all(user_chat, "account-scoring", "on this computer", "on-demand", "25", "$25"), "Checked workflow, location, kind, and caps report."),
            (contains_all(user_chat, "valid", "agent", "route") and canonical_runtime(workflows), "Checked validation and canonical shared files."),
            (
                (contains_all(user_chat, "no recorded runs") or contains_all(user_chat, "no run data") or contains_all(user_chat, "no runs"))
                and (contains_all(user_chat, "not unhealthy") or contains_all(user_chat, "not evidence", "fault") or contains_all(user_chat, "not", "defect")),
                "Checked absent run data is not treated as a defect.",
            ),
            (clean_main(repo, 1) and safe_output(run_dir), "Checked read-only inspection and safe conversation."),
        ]

    if name == "inspect-fetch-deployed-result":
        results = list((workflows / "data/account-scoring").glob("*-run-eval-001.json"))
        package = text(workflows / "package.json")
        return [
            (contains_all(package, "gtm", "vercel", "acme-team", "acme-workflows") and contains_all(transcript, "inspect", "--backend", "vercel"), "Checked deployment metadata and remote inspect."),
            (contains_all(transcript, "/api/runs/run-eval-001", "authorization") and safe_output(run_dir), "Checked authenticated result retrieval without exposure."),
            (bool(results) and contains_all(text(results[0]), "completed", "failed"), "Checked saved completed return value path and shape."),
            (contains_all(user_chat, "saved locally", "run-eval-001") and clean_main(repo, 1), "Checked local result report with unchanged tracked state."),
        ]

    if name == "run-pilot-cap-and-row-failure":
        flow = workflows / "flows/account-scoring.ts"
        body = text(flow)
        results = list((workflows / "data/account-scoring").glob("*.json"))
        return [
            (transcript.count("/api/run/account-scoring") >= 2 and "workflow start" not in transcript.lower(), "Checked route-started pilot and full run."),
            (contains_all(user_chat, "12", "$12", "2 completed, 1 failed", "**Would you like to run this scope?**"), "Checked projected spend and pilot gate."),
            (position(body, "MAX_ROWS") < position(body, "agent(") and position(body, "MAX_SPEND_USD") < position(body, "agent(") and "catch (error)" in body, "Checked source cap order and row isolation."),
            (bool(results) and re.search(r"\d+ completed, \d+ failed", user_chat) is not None and contains_all(user_chat, "saved locally"), "Checked saved result and outcome-first report."),
        ]

    if name == "delete-scheduled-workflow":
        cron = text(workflows / "vercel.json")
        package = text(workflows / "package.json")
        return [
            (not (workflows / "flows/pipeline-watch.ts").exists() and "pipeline-watch" not in cron, "Checked selected file and cron removal."),
            ((workflows / "flows/example.ts").is_file() and contains_all(package, "gtm", "vercel") and (workflows / "data/pipeline-watch/2026-08-25-run-old.json").is_file(), "Checked preservation of example, deployment, and ignored results."),
            (contains_all(user_chat, "pipeline-watch", "vercel.json", "recover", "**Would you like to save these changes?**"), "Checked accepted path consequences and recovery."),
            (clean_main(repo, 2) and safe_output(run_dir), "Checked one scoped deletion commit and safe conversation."),
        ]

    if name == "deploy-missing-gateway-key":
        package = json.loads(text(workflows / "package.json") or "{}")
        return [
            (contains_all(user_chat, "Gateway", "spending budget"), "Checked budgeted Gateway explanation."),
            (contains_all(user_chat, "**Is a budgeted Gateway key saved in workflows/.env now?**", "Cancel deployment") and transcript.lower().find("budgeted gateway key") < max(transcript.lower().find("vercel link"), 10**9), "Checked key question before any link."),
            (not (workflows / ".vercel").exists() and not package.get("gtm", {}).get("vercel") and clean_main(repo, 1), "Checked cancellation before project, secret, deploy, or metadata mutation."),
            (safe_output(run_dir), "Checked credential safety and conversation controls."),
        ]

    raise KeyError(name)


def grade_run(case: dict, run_dir: Path) -> dict:
    checks = checks_for(case["name"], run_dir)
    if len(checks) != len(case["assertions"]):
        raise RuntimeError(f"grader check count differs for {case['name']}")
    expectations = [
        {"text": assertion, "passed": passed, "evidence": evidence}
        for assertion, (passed, evidence) in zip(case["assertions"], checks)
    ]
    passed = sum(item["passed"] for item in expectations)
    metrics = json.loads(text(run_dir / "outputs/metrics.json") or "{}")
    timing = json.loads(text(run_dir / "timing.json") or "{}")
    result = {
        "expectations": expectations,
        "summary": {
            "passed": passed,
            "failed": len(expectations) - passed,
            "total": len(expectations),
            "pass_rate": passed / len(expectations) if expectations else 0,
        },
        "execution_metrics": metrics,
        "timing": timing,
        "claims": [],
        "user_notes_summary": {
            "uncertainties": [],
            "needs_review": [],
            "workarounds": [],
        },
        "eval_feedback": {
            "suggestions": [],
            "overall": "Assertions combine transcript and filesystem evidence.",
        },
    }
    (run_dir / "grading.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    args = parser.parse_args()
    cases = {
        case["name"]: case
        for case in json.loads((EVAL_ROOT / "evals.json").read_text())["evals"]
    }
    summary = []
    for eval_dir in sorted(args.iteration.glob("eval-*")):
        metadata = json.loads((eval_dir / "eval_metadata.json").read_text())
        case = cases[metadata["eval_name"]]
        for configuration in ("with_skill", "without_skill"):
            run_dir = eval_dir / configuration / "run-1"
            if not run_dir.is_dir():
                continue
            result = grade_run(case, run_dir)
            summary.append(
                {
                    "eval": case["name"],
                    "configuration": configuration,
                    **result["summary"],
                }
            )
            print(json.dumps(summary[-1]), flush=True)
    (args.iteration / "grading-summary.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
