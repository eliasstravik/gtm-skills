#!/usr/bin/env python3
"""Run gtm-workspace evals against the candidate and a selected baseline."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_ROOT = REPO_ROOT / "skills" / "gtm-workspace"
EVAL_ROOT = Path(__file__).resolve().parents[1]
AUTH_FILES = [Path.home() / ".codex" / "auth.json", Path.home() / ".codex" / ".credentials.json"]
MODEL = "gpt-5.6-sol"
HOSTED_CONNECTED_EVALS = {
    "hosted-create-refusal",
    "hosted-update-proceeds",
    "hosted-save-failure-recovery",
}


def digest_tree(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        digest.update(str(path.relative_to(root)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def run_git(repo: Path, *args: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", "-C", str(repo), *args], env=env, text=True, capture_output=True, check=True)


def add_contract(repo: Path) -> None:
    shutil.copy2(SKILL_ROOT / "templates" / "AGENTS.md", repo / "AGENTS.md")
    shutil.copy2(SKILL_ROOT / "templates" / "CLAUDE.md", repo / "CLAUDE.md")
    shutil.copy2(SKILL_ROOT / "templates" / "gitignore", repo / ".gitignore")


def seed_home(eval_case: dict, home: Path, env: dict[str, str]) -> str | None:
    fixture_name = (
        "hosted-connected"
        if eval_case["name"] in HOSTED_CONNECTED_EVALS
        else eval_case["name"]
    )
    fixture = EVAL_ROOT / "fixtures" / fixture_name / "home"
    if fixture.exists():
        shutil.copytree(fixture, home, dirs_exist_ok=True)
    manifest = fixture.parent / "fixture.json"
    if manifest.exists():
        for relative in json.loads(manifest.read_text()).get("empty_dirs", []):
            (home / relative).mkdir(parents=True, exist_ok=True)

    source_digest = None
    if eval_case["name"] == "import-local-folder":
        source_digest = digest_tree(home / "source" / "orbit-notes")

    existing = {
        "update-a-member": ("ember-health", "Morgan Vale", "morgan@ember-health.example"),
        "delete-a-suborg": ("northstar-group", "Amina Yusuf", "amina@northstar-group.example"),
        "doctor-broken-repo": ("atlas-labs", "Sam Rivera", "sam@atlas-labs.example"),
        "doctor-healthy-skill-content": ("solstice-freight", "Noor Haddad", "noor@solstice-freight.example"),
        "doctor-stray-skill-content": ("aster-ridge", "Imani Cole", "imani@aster-ridge.example"),
    }
    if eval_case["name"] in existing:
        slug, name, email = existing[eval_case["name"]]
        repo = home / ".gtm" / slug
        if eval_case["name"] != "doctor-broken-repo":
            add_contract(repo)
        run_git(repo, "init", "-b", "main", env=env)
        run_git(repo, "config", "--local", "user.name", name, env=env)
        run_git(repo, "config", "--local", "user.email", email, env=env)
        run_git(repo, "add", "-A", env=env)
        run_git(repo, "commit", "-m", "Seed fixture", env=env)

        if eval_case["name"] == "delete-a-suborg":
            remote = home / "remotes" / "northstar-group.git"
            remote.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "init", "--bare", str(remote)], env=env, text=True, capture_output=True, check=True)
            run_git(repo, "remote", "add", "origin", str(remote), env=env)
            run_git(repo, "push", "-u", "origin", "main", env=env)

    if eval_case["name"] in HOSTED_CONNECTED_EVALS:
        repo = home / ".gtm" / "northwind-gtm"
        run_git(repo, "init", "-b", "main", env=env)
        run_git(repo, "config", "--local", "user.name", "GTM Workspace", env=env)
        run_git(repo, "config", "--local", "user.email", "gtm@local", env=env)
        run_git(repo, "add", "AGENTS.md", "CLAUDE.md", ".gitignore", "ORG.md", env=env)
        run_git(repo, "commit", "-m", "Create GTM workspace scaffold", env=env)
        run_git(repo, "add", "members/rae-santos/MEMBER.md", env=env)
        run_git(repo, "commit", "-m", "Add member: Rae Santos", env=env)
    return source_digest


def copy_skill(home: Path, source: Path, target_name: str) -> Path:
    target = home / "skill"
    (target / "references").mkdir(parents=True)
    (target / "templates").mkdir(parents=True)
    shutil.copy2(source / "SKILL.md", target / "SKILL.md")
    for path in (source / "references").iterdir():
        if path.is_file():
            shutil.copy2(path, target / "references" / path.name)
    for path in (source / "templates").iterdir():
        if path.is_file():
            shutil.copy2(path, target / "templates" / path.name)
    (target / "evaluation-identity.txt").write_text(target_name + "\n")
    return target


def artifact_report(home: Path) -> str:
    lines = ["# Sandbox artifact report", ""]
    context_root = home / ".gtm"
    if not context_root.exists():
        return "# Sandbox artifact report\n\nNo `~/.gtm` directory was produced.\n"
    lines += ["## Tree", "", "```text"]
    visible = []
    for path in sorted(context_root.rglob("*")):
        if ".git" in path.parts:
            continue
        suffix = "/" if path.is_dir() else ""
        visible.append(str(path.relative_to(home)) + suffix)
    lines += visible + ["```", ""]
    for path in sorted(p for p in context_root.rglob("*.md") if ".git" not in p.parts):
        lines += [f"## `{path.relative_to(home)}`", "", "```markdown", path.read_text(errors="replace").rstrip(), "```", ""]
    for repo in sorted(p.parent for p in context_root.rglob(".git") if p.is_dir()):
        try:
            log = subprocess.run(
                ["git", "-C", str(repo), "log", "--oneline", "--decorate", "--all"],
                text=True,
                capture_output=True,
                timeout=10,
            ).stdout.strip()
            lines += [f"## History for `{repo.relative_to(home)}`", "", "```text", log or "(empty)", "```", ""]
        except (OSError, subprocess.TimeoutExpired):
            pass
    return "\n".join(lines)


def executor_prompt(eval_case: dict, configuration: str, skill_path: Path | None) -> str:
    skill_instruction = (
        f"Read {skill_path}/SKILL.md completely and follow it, including every referenced file its Calls require."
        if skill_path
        else "No skill is available. Do not search for or read any SKILL.md. Solve the task from the user request alone."
    )
    if "available_gtm_workflows" in eval_case:
        workflows = eval_case["available_gtm_workflows"]
        rendered_workflows = "\n".join(f"- `{workflow}`" for workflow in workflows) or "- (empty)"
        capability_catalog = f"""The sole explicit GTM capability catalog for this run is:
{rendered_workflows}
Use only these exact IDs when selecting a capability-aware completion request. Do not infer availability from the task prose, copied skill files, or filesystem."""
    else:
        capability_catalog = """No explicit GTM capability catalog is supplied for this run.
Do not infer workflow availability from the task prose, copied skill files, or filesystem."""
    return f"""You are an independent executor in a controlled, non-interactive evaluation.

{skill_instruction}

Controlled capability environment:
{capability_catalog}

Security and isolation:
- HOME is a disposable per-run sandbox. Work only inside HOME.
- Never access /Users/eliasstravik/.gtm or change any global git configuration.
- Use repo-local git identity only. Do not install or package anything.

Interactive simulation:
- The task below embeds a persona and scripted choices because no human can answer during this run.
- Drive the flow to completion by treating those scripted facts as the user's successive replies. Do not stop to wait for input.
- Preserve the actual conversational behavior in $HOME/eval-output/conversation.md as alternating `## Assistant` and `## User` turns. Each assistant turn may ask only one question.
- Perform the resulting filesystem and git actions for real inside HOME.
- Save a concise closing user-facing answer to $HOME/eval-output/final.md.
- Do not put evaluation commentary in those output files.

User task:
{eval_case['prompt']}
"""


def run_one(eval_case: dict, configuration: str, iteration: Path, baseline_skill_root: Path | None) -> dict:
    eval_dir = iteration / f"eval-{eval_case['id']}-{eval_case['name']}"
    run_dir = eval_dir / configuration / "run-1"
    outputs = run_dir / "outputs"
    outputs.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"gtm-eval-{eval_case['id']}-{configuration}-") as temp:
        home = Path(temp) / "home"
        home.mkdir()
        codex_dir = home / ".codex"
        codex_dir.mkdir()
        for source in AUTH_FILES:
            if not source.exists():
                raise FileNotFoundError(f"Codex authentication file missing: {source.name}")
            shutil.copy2(source, codex_dir / source.name)

        env = os.environ.copy()
        env["HOME"] = str(home)
        env["GIT_CONFIG_GLOBAL"] = str(home / ".gitconfig")
        env["XDG_CONFIG_HOME"] = str(home / ".config")
        source_digest = seed_home(eval_case, home, env)
        skill_source = SKILL_ROOT if configuration == "with_skill" else baseline_skill_root
        skill_path = copy_skill(home, skill_source, configuration) if skill_source else None
        (home / "eval-output").mkdir()

        command = [
            "codex", "exec", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
            "--ephemeral", "-m", MODEL, "-s", "workspace-write", "-C", str(home), "--json",
            executor_prompt(eval_case, configuration, skill_path),
        ]
        started = time.monotonic()
        proc = subprocess.run(command, env=env, stdin=subprocess.DEVNULL, text=True, capture_output=True, timeout=900)
        duration = time.monotonic() - started

        events = []
        for line in proc.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        usage = next((event.get("usage", {}) for event in reversed(events) if event.get("type") == "turn.completed"), {})
        total_tokens = int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0))
        agent_messages = [event["item"]["text"] for event in events if event.get("type") == "item.completed" and event.get("item", {}).get("type") == "agent_message"]

        produced = home / "eval-output"
        for path in produced.iterdir():
            if path.is_file():
                shutil.copy2(path, outputs / path.name)
        if not (outputs / "final.md").exists():
            (outputs / "final.md").write_text((agent_messages[-1] if agent_messages else "Executor produced no final answer.") + "\n")
        (outputs / "artifact-report.md").write_text(artifact_report(home))

        snapshot = run_dir / "sandbox_snapshot"
        snapshot.mkdir()
        for relative in [Path(".gtm"), Path("source"), Path("remotes")]:
            source = home / relative
            if source.exists():
                shutil.copytree(source, snapshot / relative, symlinks=True)
        ignored_roots = {".codex", "skill"}
        home_inventory = sorted(
            str(path.relative_to(home))
            for path in home.rglob("*")
            if path.relative_to(home).parts[0] not in ignored_roots and ".git" not in path.parts
        )
        (run_dir / "home_inventory.json").write_text(json.dumps(home_inventory, indent=2) + "\n")
        if source_digest:
            (run_dir / "source_digest_before.txt").write_text(source_digest + "\n")

        transcript = ["## Eval Prompt", "", eval_case["prompt"], "", "## Executor JSONL", "", "```jsonl", proc.stdout.rstrip(), "```", ""]
        if proc.stderr.strip():
            transcript += ["## Executor stderr", "", "```text", proc.stderr.rstrip(), "```", ""]
        (run_dir / "transcript.md").write_text("\n".join(transcript))

        tool_calls = sum(1 for event in events if event.get("type") == "item.completed" and event.get("item", {}).get("type") in {"command_execution", "file_change", "mcp_tool_call"})
        output_chars = sum(path.stat().st_size for path in outputs.iterdir() if path.is_file())
        errors = int(proc.returncode != 0) + sum(1 for event in events if event.get("type") == "error")
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
            "files_created": sorted(path.name for path in outputs.iterdir() if path.is_file()),
            "errors_encountered": errors,
            "output_chars": output_chars,
            "transcript_chars": (run_dir / "transcript.md").stat().st_size,
        }
        (run_dir / "timing.json").write_text(json.dumps(timing, indent=2) + "\n")
        (outputs / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
        (run_dir / "executor_status.json").write_text(json.dumps({"returncode": proc.returncode}, indent=2) + "\n")
        return {"eval": eval_case["name"], "configuration": configuration, "returncode": proc.returncode, **timing}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    parser.add_argument("--max-workers", type=int, default=12)
    parser.add_argument("--ids", help="Comma-separated eval IDs to run, for example 7,8")
    parser.add_argument(
        "--configurations",
        default="with_skill,baseline_skill",
        help="Comma-separated configurations: with_skill,baseline_skill,without_skill",
    )
    parser.add_argument(
        "--baseline-skill-root",
        type=Path,
        help="Snapshot of the pre-migration skill, required for baseline_skill runs",
    )
    args = parser.parse_args()
    configurations = [value.strip() for value in args.configurations.split(",") if value.strip()]
    unknown_configurations = set(configurations) - {"with_skill", "baseline_skill", "without_skill"}
    if not configurations or unknown_configurations:
        parser.error("--configurations must contain with_skill, baseline_skill, and/or without_skill")
    if "baseline_skill" in configurations:
        if not args.baseline_skill_root or not (args.baseline_skill_root / "SKILL.md").is_file():
            parser.error("--baseline-skill-root must identify a skill snapshot for baseline_skill runs")
    evals = json.loads((EVAL_ROOT / "evals.json").read_text())["evals"]
    if args.ids:
        try:
            selected_ids = {int(value.strip()) for value in args.ids.split(",") if value.strip()}
        except ValueError:
            parser.error("--ids must be a comma-separated list of integers")
        known_ids = {case["id"] for case in evals}
        unknown_ids = selected_ids - known_ids
        if unknown_ids:
            parser.error(f"unknown eval IDs: {','.join(map(str, sorted(unknown_ids)))}")
        evals = [case for case in evals if case["id"] in selected_ids]
    args.iteration.mkdir(parents=True, exist_ok=True)

    for eval_case in evals:
        eval_dir = args.iteration / f"eval-{eval_case['id']}-{eval_case['name']}"
        eval_dir.mkdir(parents=True, exist_ok=True)
        metadata = {
            "eval_id": eval_case["id"],
            "eval_name": eval_case["name"],
            "prompt": eval_case["prompt"],
            "assertions": eval_case["assertions"],
            "allowed_example_values": eval_case.get("allowed_example_values", []),
        }
        if "available_gtm_workflows" in eval_case:
            metadata["available_gtm_workflows"] = eval_case["available_gtm_workflows"]
        (eval_dir / "eval_metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")

    jobs = [
        (case, config)
        for case in evals
        for config in configurations
        if not (
            args.iteration
            / f"eval-{case['id']}-{case['name']}"
            / config
            / "run-1"
            / "executor_status.json"
        ).exists()
    ]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.max_workers) as pool:
        futures = [
            pool.submit(run_one, case, config, args.iteration, args.baseline_skill_root)
            for case, config in jobs
        ]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(json.dumps(result), flush=True)
    (args.iteration / "run_summary_raw.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
