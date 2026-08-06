#!/usr/bin/env python3
"""Run gtm-lead-scoring evals in isolated HOME directories with Codex/GPT."""

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
CONTEXT_TEMPLATES = REPO_ROOT / "skills" / "gtm-context" / "templates"
MODEL = "gpt-5.6-sol"
AUTH_FILES = ("auth.json", ".credentials.json", "installation_id")


def run_git(repo: Path, *args: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )


def seed_home(eval_case: dict, home: Path, env: dict[str, str]) -> None:
    fixture = EVAL_ROOT / "fixtures" / eval_case["name"] / "home"
    shutil.copytree(fixture, home, dirs_exist_ok=True)
    context_root = home / ".gtm"
    for repo in sorted(path for path in context_root.iterdir() if (path / "org.md").is_file()):
        shutil.copy2(CONTEXT_TEMPLATES / "AGENTS.md", repo / "AGENTS.md")
        shutil.copy2(CONTEXT_TEMPLATES / "CLAUDE.md", repo / "CLAUDE.md")
        shutil.copy2(CONTEXT_TEMPLATES / "gitignore", repo / ".gitignore")
        run_git(repo, "init", "-b", "main", env=env)
        run_git(repo, "config", "--local", "user.name", "GTM Eval Operator", env=env)
        run_git(repo, "config", "--local", "user.email", "operator@example.test", env=env)
        run_git(repo, "add", "-A", env=env)
        run_git(repo, "commit", "-m", "Seed fixture", env=env)


def copy_skill(skill_file: Path, home: Path) -> Path:
    target = home / "skill"
    target.mkdir()
    shutil.copy2(skill_file, target / "SKILL.md")
    for directory in ("references", "templates"):
        source_dir = skill_file.parent / directory
        if source_dir.is_dir():
            shutil.copytree(source_dir, target / directory)
    return target


def artifact_report(home: Path) -> str:
    lines = ["# Sandbox artifact report", "", "## Tree", "", "```text"]
    context_root = home / ".gtm"
    for path in sorted(context_root.rglob("*")):
        if ".git" in path.parts:
            continue
        lines.append(str(path.relative_to(home)) + ("/" if path.is_dir() else ""))
    lines += ["```", ""]
    for path in sorted(p for p in context_root.rglob("*.md") if ".git" not in p.parts):
        lines += [f"## `{path.relative_to(home)}`", "", "```markdown", path.read_text(errors="replace").rstrip(), "```", ""]
    for repo in sorted(path.parent for path in context_root.rglob(".git") if path.is_dir()):
        log = subprocess.run(
            ["git", "-C", str(repo), "log", "--oneline", "--decorate", "--all"],
            text=True,
            capture_output=True,
        ).stdout.strip()
        status = subprocess.run(
            ["git", "-C", str(repo), "status", "--short", "--branch"],
            text=True,
            capture_output=True,
        ).stdout.strip()
        lines += [f"## Git for `{repo.relative_to(home)}`", "", "```text", status, log, "```", ""]
    return "\n".join(lines)


def executor_prompt(eval_case: dict, skill_path: Path | None) -> str:
    skill_instruction = (
        f"Read {skill_path}/SKILL.md completely and follow it, including every referenced file required by its Calls."
        if skill_path
        else "No skill is available. Do not search for or read any SKILL.md. Solve the task from the user request alone."
    )
    return f"""You are an independent executor in a controlled, non-interactive evaluation.

{skill_instruction}

Isolation and capabilities:
- HOME is a disposable sandbox. Work only inside HOME and never access the real ~/.gtm.
- No environment-declared connected repo exists in this run.
- Use only Codex/GPT and ordinary local tools. Do not use Claude.
- Web access is unavailable. Local supplied sources remain readable.
- Use repo-local git configuration only.

Execution:
- Complete the read-only task without waiting for a human.
- Write the complete user-facing response to $HOME/eval-output/final.md.
- Do not write a conversation simulation or evaluation commentary.
- The GTM context and its Git history must remain byte-for-byte unchanged.

User task:
{eval_case['prompt']}
"""


def run_one(
    eval_case: dict,
    configuration: str,
    iteration: Path,
    skill_file: Path | None,
) -> dict:
    eval_dir = iteration / f"eval-{eval_case['id']}-{eval_case['name']}"
    run_dir = eval_dir / configuration / "run-1"
    outputs = run_dir / "outputs"
    outputs.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"gtm-lead-scoring-{eval_case['id']}-{configuration}-") as temp:
        home = Path(temp) / "home"
        home.mkdir()
        codex_home = home / ".codex"
        codex_home.mkdir()
        for name in AUTH_FILES:
            source = Path.home() / ".codex" / name
            if source.exists():
                shutil.copy2(source, codex_home / name)
        env = os.environ.copy()
        env.update(
            {
                "HOME": str(home),
                "CODEX_HOME": str(codex_home),
                "GIT_CONFIG_GLOBAL": str(home / ".gitconfig"),
                "XDG_CONFIG_HOME": str(home / ".config"),
            }
        )
        seed_home(eval_case, home, env)
        skill_path = copy_skill(skill_file, home) if configuration == "with_skill" and skill_file else None
        (home / "eval-output").mkdir()

        command = [
            "codex",
            "exec",
            "--skip-git-repo-check",
            "--ignore-user-config",
            "--ignore-rules",
            "--ephemeral",
            "-m",
            MODEL,
            "-s",
            "workspace-write",
            "-C",
            str(home),
            "--json",
            executor_prompt(eval_case, skill_path),
        ]
        started = time.monotonic()
        process = subprocess.run(
            command,
            env=env,
            stdin=subprocess.DEVNULL,
            text=True,
            capture_output=True,
            timeout=900,
        )
        duration = time.monotonic() - started

        events = []
        for line in process.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        usage = next(
            (event.get("usage", {}) for event in reversed(events) if event.get("type") == "turn.completed"),
            {},
        )
        agent_messages = [
            event["item"]["text"]
            for event in events
            if event.get("type") == "item.completed"
            and event.get("item", {}).get("type") == "agent_message"
        ]
        produced = home / "eval-output"
        for path in produced.iterdir():
            if path.is_file():
                shutil.copy2(path, outputs / path.name)
        if not (outputs / "final.md").exists():
            fallback = agent_messages[-1] if agent_messages else "Executor produced no final answer."
            (outputs / "final.md").write_text(fallback + "\n")
        (outputs / "artifact-report.md").write_text(artifact_report(home))

        snapshot = run_dir / "sandbox_snapshot"
        snapshot.mkdir()
        for relative in (Path(".gtm"), Path("source")):
            source = home / relative
            if source.exists():
                shutil.copytree(source, snapshot / relative, symlinks=True)

        transcript = [
            "## Eval Prompt",
            "",
            eval_case["prompt"],
            "",
            "## Executor JSONL",
            "",
            "```jsonl",
            process.stdout.rstrip(),
            "```",
        ]
        if process.stderr.strip():
            transcript += ["", "## Executor stderr", "", "```text", process.stderr.rstrip(), "```"]
        (run_dir / "transcript.md").write_text("\n".join(transcript) + "\n")
        tool_calls = sum(
            1
            for event in events
            if event.get("type") == "item.completed"
            and event.get("item", {}).get("type") in {"command_execution", "file_change", "mcp_tool_call"}
        )
        total_tokens = int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0))
        timing = {
            "total_tokens": total_tokens,
            "duration_ms": round(duration * 1000),
            "total_duration_seconds": round(duration, 3),
            "input_tokens": int(usage.get("input_tokens", 0)),
            "cached_input_tokens": int(usage.get("cached_input_tokens", 0)),
            "output_tokens": int(usage.get("output_tokens", 0)),
        }
        metrics = {
            "tool_calls": {"codex_items": tool_calls},
            "total_tool_calls": tool_calls,
            "total_steps": tool_calls,
            "files_created": sorted(path.name for path in outputs.iterdir()),
            "errors_encountered": int(process.returncode != 0),
            "output_chars": sum(path.stat().st_size for path in outputs.iterdir()),
            "transcript_chars": (run_dir / "transcript.md").stat().st_size,
        }
        (run_dir / "timing.json").write_text(json.dumps(timing, indent=2) + "\n")
        (outputs / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
        (run_dir / "executor_status.json").write_text(json.dumps({"returncode": process.returncode}, indent=2) + "\n")
        return {
            "eval": eval_case["name"],
            "configuration": configuration,
            "returncode": process.returncode,
            **timing,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    parser.add_argument("--skill-file", type=Path)
    parser.add_argument("--ids")
    parser.add_argument("--configurations", default="with_skill,without_skill")
    parser.add_argument("--max-workers", type=int, default=6)
    args = parser.parse_args()
    configurations = [value.strip() for value in args.configurations.split(",") if value.strip()]
    if set(configurations) - {"with_skill", "without_skill"}:
        parser.error("unknown configuration")
    if "with_skill" in configurations and not args.skill_file:
        parser.error("--skill-file is required for with_skill runs")
    evals = json.loads((EVAL_ROOT / "evals.json").read_text())["evals"]
    if args.ids:
        selected = {int(value) for value in args.ids.split(",")}
        evals = [case for case in evals if case["id"] in selected]
    args.iteration.mkdir(parents=True, exist_ok=True)
    for case in evals:
        eval_dir = args.iteration / f"eval-{case['id']}-{case['name']}"
        eval_dir.mkdir(parents=True, exist_ok=True)
        metadata = {
            "eval_id": case["id"],
            "eval_name": case["name"],
            "prompt": case["prompt"],
            "assertions": case["expectations"],
        }
        (eval_dir / "eval_metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    jobs = [
        (case, configuration)
        for case in evals
        for configuration in configurations
        if not (
            args.iteration
            / f"eval-{case['id']}-{case['name']}"
            / configuration
            / "run-1"
            / "executor_status.json"
        ).exists()
    ]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.max_workers) as pool:
        futures = [
            pool.submit(run_one, case, configuration, args.iteration, args.skill_file)
            for case, configuration in jobs
        ]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(json.dumps(result), flush=True)
    (args.iteration / "run_summary_raw.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
