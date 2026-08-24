#!/usr/bin/env python3
"""Run paired gtm-workflow evaluations in disposable HOME directories."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time


REPO_ROOT = Path(__file__).resolve().parents[3]
EVAL_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = REPO_ROOT / "skills" / "gtm-workflow"
WORKSPACE_TEMPLATES = REPO_ROOT / "skills" / "gtm-workspace" / "templates"
MODEL = os.environ.get("GTM_WORKFLOW_EVAL_MODEL", "gpt-5.6-sol")
AUTH_FILES = ("auth.json", ".credentials.json", "installation_id")


def run_git(repo: Path, *args: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo), *args], env=env, text=True, capture_output=True, check=True
    )


def seed_home(eval_case: dict, home: Path, env: dict[str, str], workspace_templates: Path) -> None:
    manifest_path = EVAL_ROOT / "fixtures" / eval_case["name"] / "fixture.json"
    manifest = json.loads(manifest_path.read_text())
    for relative, body in manifest["files"].items():
        target = home / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body)

    context_root = home / ".gtm"
    for repo in sorted(path for path in context_root.iterdir() if (path / "ORG.md").is_file()):
        for source_name, target_name in (
            ("AGENTS.md", "AGENTS.md"),
            ("CLAUDE.md", "CLAUDE.md"),
            ("gitignore", ".gitignore"),
        ):
            target = repo / target_name
            if not target.exists():
                shutil.copy2(workspace_templates / source_name, target)
        run_git(repo, "init", "-b", "main", env=env)
        run_git(repo, "config", "--local", "user.name", "GTM Eval Operator", env=env)
        run_git(repo, "config", "--local", "user.email", "operator@example.test", env=env)
        run_git(repo, "add", "-A", "-f", env=env)
        run_git(repo, "commit", "-m", "Seed fixture", env=env)

    for relative, body in manifest.get("ignored_files", {}).items():
        target = home / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body)


def copy_skill(home: Path, source: Path) -> Path:
    target = home / "skill"
    shutil.copytree(source, target)
    return target


def artifact_report(home: Path) -> str:
    lines = ["# Sandbox artifact report", "", "## Files", "", "```text"]
    for root_name in (".gtm", "target-sandbox", "projects", "source"):
        root = home / root_name
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if ".git" in path.parts or "node_modules" in path.parts:
                continue
            lines.append(str(path.relative_to(home)) + ("/" if path.is_dir() else ""))
    lines += ["```", ""]
    for root_name in (".gtm", "target-sandbox", "projects"):
        root = home / root_name
        if not root.exists():
            continue
        for path in sorted(item for item in root.rglob("*") if item.is_file() and ".git" not in item.parts and "node_modules" not in item.parts):
            if path.stat().st_size > 100_000:
                continue
            lines += [f"## `{path.relative_to(home)}`", "", "```text", path.read_text(errors="replace").rstrip(), "```", ""]
    for repo in sorted(path for path in (home / ".gtm").iterdir() if (path / ".git").is_dir()):
        status = subprocess.run(["git", "-C", str(repo), "status", "--short", "--branch"], text=True, capture_output=True).stdout.strip()
        log = subprocess.run(["git", "-C", str(repo), "log", "--oneline"], text=True, capture_output=True).stdout.strip()
        tracked = subprocess.run(["git", "-C", str(repo), "ls-files"], text=True, capture_output=True).stdout.strip()
        lines += [f"## Git for `{repo.relative_to(home)}`", "", "```text", status, log, "Tracked:", tracked, "```", ""]
    return "\n".join(lines)


def executor_prompt(eval_case: dict, skill_path: Path | None) -> str:
    skill_instruction = (
        f"Read {skill_path}/SKILL.md completely and follow every reference required for the selected flow."
        if skill_path
        else "No skill is available. Do not search for or read SKILL.md; solve the request from its own facts."
    )
    return f"""You are an independent executor in a controlled, non-interactive evaluation.

{skill_instruction}

Isolation and capabilities:
- HOME is disposable. Work only inside HOME and never access the real ~/.gtm.
- The seeded target-sandbox and projects directories are the complete available backend surfaces; inspect and mutate them as the user authorizes.
- Web access is unavailable. Use repo-local git configuration only.
- No hosting environment replaces the ordinary main-branch Git persistence mechanism.

Conversation simulation:
- The task embeds scripted user choices. Treat them as successive replies and complete the whole exchange without waiting.
- Record the visible exchange in $HOME/eval-output/conversation.md as alternating `## Assistant` and `## User` turns.
- Perform authorized filesystem, target-sandbox, and git operations for real.
- Save the concise closing response to $HOME/eval-output/final.md.
- Put no evaluation commentary in either output file.

User task:
{eval_case['prompt']}
"""


def run_one(eval_case: dict, configuration: str, iteration: Path, baseline_skill_root: Path | None) -> dict:
    eval_dir = iteration / f"eval-{eval_case['id']}-{eval_case['name']}"
    run_dir = eval_dir / configuration / "run-1"
    outputs = run_dir / "outputs"
    outputs.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"gtm-workflow-{eval_case['id']}-{configuration}-") as temp:
        home = Path(temp) / "home"
        home.mkdir()
        codex_home = home / ".codex"
        codex_home.mkdir()
        for name in AUTH_FILES:
            source = Path.home() / ".codex" / name
            if source.exists():
                shutil.copy2(source, codex_home / name)
        env = os.environ.copy()
        env.update({"HOME": str(home), "CODEX_HOME": str(codex_home), "GIT_CONFIG_GLOBAL": str(home / ".gitconfig"), "XDG_CONFIG_HOME": str(home / ".config")})
        skill_source = SKILL_ROOT if configuration == "with_skill" else baseline_skill_root if configuration == "old_skill" else None
        workspace_templates = skill_source.parent / "gtm-workspace/templates" if skill_source else WORKSPACE_TEMPLATES
        seed_home(eval_case, home, env, workspace_templates)
        skill_path = copy_skill(home, skill_source) if skill_source else None
        (home / "eval-output").mkdir()

        command = [
            "codex", "exec", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "--ephemeral",
            "-m", MODEL, "-s", "workspace-write", "-C", str(home), "--json", executor_prompt(eval_case, skill_path),
        ]
        started = time.monotonic()
        process = subprocess.run(command, env=env, stdin=subprocess.DEVNULL, text=True, capture_output=True, timeout=900)
        duration = time.monotonic() - started

        events = []
        for line in process.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        usage = next((event.get("usage", {}) for event in reversed(events) if event.get("type") == "turn.completed"), {})
        messages = [event["item"]["text"] for event in events if event.get("type") == "item.completed" and event.get("item", {}).get("type") == "agent_message"]
        for path in (home / "eval-output").iterdir():
            if path.is_file():
                shutil.copy2(path, outputs / path.name)
        if not (outputs / "final.md").exists():
            (outputs / "final.md").write_text((messages[-1] if messages else "Executor produced no final answer.") + "\n")
        (outputs / "artifact-report.md").write_text(artifact_report(home))

        snapshot = run_dir / "sandbox_snapshot"
        snapshot.mkdir()
        for relative in (".gtm", "target-sandbox", "projects", "source"):
            source = home / relative
            if source.exists():
                shutil.copytree(source, snapshot / relative, symlinks=True)

        transcript = ["## Eval Prompt", "", eval_case["prompt"], "", "## Executor JSONL", "", "```jsonl", process.stdout.rstrip(), "```"]
        if process.stderr.strip():
            transcript += ["", "## Executor stderr", "", "```text", process.stderr.rstrip(), "```"]
        (run_dir / "transcript.md").write_text("\n".join(transcript) + "\n")
        total_tokens = int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0))
        timing = {"total_tokens": total_tokens, "duration_ms": round(duration * 1000), "total_duration_seconds": round(duration, 3)}
        metrics = {"tool_calls": {}, "total_tool_calls": 0, "total_steps": 0, "files_created": sorted(path.name for path in outputs.iterdir()), "errors_encountered": int(process.returncode != 0), "output_chars": sum(path.stat().st_size for path in outputs.iterdir()), "transcript_chars": (run_dir / "transcript.md").stat().st_size}
        (run_dir / "timing.json").write_text(json.dumps(timing, indent=2) + "\n")
        (outputs / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
        (run_dir / "executor_status.json").write_text(json.dumps({"returncode": process.returncode}, indent=2) + "\n")
        return {"eval": eval_case["name"], "configuration": configuration, "returncode": process.returncode, **timing}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    parser.add_argument("--ids")
    parser.add_argument("--configurations", default="with_skill,old_skill")
    parser.add_argument("--baseline-skill-root", type=Path)
    parser.add_argument("--max-workers", type=int, default=6)
    args = parser.parse_args()
    configurations = [item.strip() for item in args.configurations.split(",") if item.strip()]
    if set(configurations) - {"with_skill", "old_skill", "without_skill"}:
        parser.error("configurations must be with_skill, old_skill, and/or without_skill")
    if "old_skill" in configurations and not args.baseline_skill_root:
        parser.error("--baseline-skill-root is required for old_skill")
    if args.baseline_skill_root and not (args.baseline_skill_root / "SKILL.md").is_file():
        parser.error("--baseline-skill-root must contain SKILL.md")
    evals = json.loads((EVAL_ROOT / "evals.json").read_text())["evals"]
    if args.ids:
        selected = {int(item) for item in args.ids.split(",")}
        evals = [case for case in evals if case["id"] in selected]
    args.iteration.mkdir(parents=True, exist_ok=True)
    for case in evals:
        eval_dir = args.iteration / f"eval-{case['id']}-{case['name']}"
        eval_dir.mkdir(parents=True, exist_ok=True)
        (eval_dir / "eval_metadata.json").write_text(json.dumps({"eval_id": case["id"], "eval_name": case["name"], "prompt": case["prompt"], "assertions": case["assertions"]}, indent=2) + "\n")
    jobs = [(case, configuration) for case in evals for configuration in configurations if not (args.iteration / f"eval-{case['id']}-{case['name']}" / configuration / "run-1" / "executor_status.json").exists()]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.max_workers) as pool:
        futures = [pool.submit(run_one, case, configuration, args.iteration, args.baseline_skill_root) for case, configuration in jobs]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(json.dumps(result), flush=True)
    (args.iteration / "run_summary_raw.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
