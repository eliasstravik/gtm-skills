#!/usr/bin/env python3
"""Run paired gtm-workflow evaluations with isolated Codex executors."""

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
EVAL_SECRETS = (
    "eval-secret-local",
    "eval-secret-deployed",
    "eval-secret-scheduled",
    "eval-secret-gateway",
    "eval-gateway-key",
)


def run_git(repo: Path, *args: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )


def copy_workflow_templates(repo: Path) -> None:
    source = SKILL_ROOT / "templates"
    target = repo / "workflows"
    target.mkdir(parents=True, exist_ok=True)
    for path in source.rglob("*"):
        if path.is_dir():
            continue
        relative = path.relative_to(source)
        if relative == Path("gitignore"):
            relative = Path(".gitignore")
        elif relative == Path("vercelignore"):
            relative = Path(".vercelignore")
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)


def write_command_mocks(home: Path) -> None:
    bin_dir = home / "bin"
    bin_dir.mkdir()
    (home / ".zprofile").write_text('export PATH="$HOME/bin:$PATH"\n')
    scripts = {
        "npm": """#!/bin/sh
if [ "$1" = "ci" ]; then
  mkdir -p node_modules/.bin
  printf '%s\\n' '#!/bin/sh' 'case "$1" in validate) echo "workflow valid";; inspect) echo "{\\"runs\\":[]}";; cancel) echo "cancelled";; *) echo "workflow mock";; esac' > node_modules/.bin/workflow
  chmod +x node_modules/.bin/workflow
  echo "installed pinned workflow dependencies"
  exit 0
fi
if [ "$1" = "run" ] && [ "$2" = "dev" ]; then
  echo "Nitro ready on http://localhost:3000"
  exit 0
fi
echo "npm mock: $*"
""",
        "vercel": """#!/bin/sh
case "$1" in
  whoami) echo "eval-operator" ;;
  link)
    mkdir -p .vercel
    printf '%s\\n' '{"orgId":"acme-team","projectId":"acme-workflows"}' > .vercel/project.json
    echo "Linked acme-workflows"
    ;;
  env)
    if [ "$2" = "ls" ]; then
      echo "Environment Variables"
    elif [ "$2" = "add" ]; then
      IFS= read -r _
      echo "Added $3"
    elif [ "$2" = "rm" ]; then
      echo "Removed $3"
    fi
    ;;
  deploy) echo "Production: https://acme-workflows.example.test" ;;
  crons) echo "Cron invocation started" ;;
  *) echo "vercel mock: $*" ;;
esac
""",
        "curl": """#!/bin/sh
case "$*" in
  *"/api/runs/"*)
    printf '%s\\n' '{"runId":"run-eval-001","status":"completed","result":{"completed":[{"row":{"company":"Alpha"}},{"row":{"company":"Beta"}}],"failed":[{"row":{"company":"Broken Site"},"error":"website unreachable"}]}}'
    ;;
  *"/api/run/"*)
    printf '%s\\n' '{"runId":"run-eval-001","workflow":"account-scoring"}'
    ;;
  *)
    echo "curl mock: unsupported request" >&2
    exit 2
    ;;
esac
""",
    }
    for name, body in scripts.items():
        path = bin_dir / name
        path.write_text(body)
        path.chmod(0o755)


def install_workflow_mock(repo: Path) -> None:
    binary = repo / "workflows/node_modules/.bin/workflow"
    binary.parent.mkdir(parents=True, exist_ok=True)
    binary.write_text("""#!/bin/sh
case "$1" in
  validate) echo "workflow valid";;
  inspect) echo '{"runs":[]}' ;;
  cancel) echo "cancelled";;
  *) echo "workflow mock";;
esac
""")
    binary.chmod(0o755)


def seed_home(eval_case: dict, home: Path, env: dict[str, str]) -> None:
    fixture_root = EVAL_ROOT / "fixtures" / eval_case["fixture"]
    manifest = json.loads((fixture_root / "fixture.json").read_text())
    for relative in manifest.get("workflow_template_repos", []):
        copy_workflow_templates(home / relative)
    fixture_home = fixture_root / "home"
    if fixture_home.exists():
        shutil.copytree(fixture_home, home, dirs_exist_ok=True)
    for relative, deployment in manifest.get("vercel", {}).items():
        package_path = home / relative / "workflows/package.json"
        package = json.loads(package_path.read_text())
        package["gtm"] = {"vercel": deployment}
        package_path.write_text(json.dumps(package, indent=2) + "\n")
    context_root = home / ".gtm"
    if context_root.exists():
        for repo in sorted(path for path in context_root.iterdir() if (path / "ORG.md").is_file()):
            for source_name, target_name in (
                ("AGENTS.md", "AGENTS.md"),
                ("CLAUDE.md", "CLAUDE.md"),
                ("gitignore", ".gitignore"),
            ):
                target = repo / target_name
                if not target.exists():
                    shutil.copy2(WORKSPACE_TEMPLATES / source_name, target)
            run_git(repo, "init", "-b", "main", env=env)
            run_git(repo, "config", "--local", "user.name", "GTM Eval Operator", env=env)
            run_git(repo, "config", "--local", "user.email", "operator@example.test", env=env)
            run_git(repo, "add", "-A", "-f", env=env)
            run_git(repo, "commit", "-m", "Seed fixture", env=env)
            if (repo / "workflows").is_dir():
                install_workflow_mock(repo)
    for relative, body in manifest.get("ignored_files", {}).items():
        target = home / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body)


def copy_skill(home: Path) -> Path:
    target = home / "skill"
    shutil.copytree(SKILL_ROOT, target)
    return target


def artifact_report(home: Path) -> str:
    lines = ["# Sandbox artifact report", "", "## Files", "", "~~~text"]
    root = home / ".gtm"
    if root.exists():
        for path in sorted(root.rglob("*")):
            if ".git" in path.parts or "node_modules" in path.parts:
                continue
            lines.append(str(path.relative_to(home)) + ("/" if path.is_dir() else ""))
    lines += ["~~~", ""]
    if root.exists():
        for path in sorted(item for item in root.rglob("*") if item.is_file()):
            if ".git" in path.parts or "node_modules" in path.parts or path.name == "package-lock.json":
                continue
            if path.name == ".env":
                continue
            if path.stat().st_size > 100_000:
                continue
            lines += [
                "## " + str(path.relative_to(home)),
                "",
                "~~~text",
                path.read_text(errors="replace").rstrip(),
                "~~~",
                "",
            ]
        for repo in sorted(path for path in root.iterdir() if (path / ".git").is_dir()):
            status = subprocess.run(
                ["git", "-C", str(repo), "status", "--short", "--branch"],
                text=True,
                capture_output=True,
            ).stdout.strip()
            log = subprocess.run(
                ["git", "-C", str(repo), "log", "--oneline"],
                text=True,
                capture_output=True,
            ).stdout.strip()
            tracked = subprocess.run(
                ["git", "-C", str(repo), "ls-files"],
                text=True,
                capture_output=True,
            ).stdout.strip()
            lines += [
                "## Git for " + str(repo.relative_to(home)),
                "",
                "~~~text",
                status,
                log,
                "Tracked:",
                tracked,
                "~~~",
                "",
            ]
    return "\n".join(lines)


def executor_prompt(eval_case: dict, skill_path: Path | None) -> str:
    skill_instruction = (
        f"Read {skill_path}/SKILL.md completely and follow every reference required for the selected flow."
        if skill_path
        else "No skill is available. Do not search for or read any SKILL.md; solve the request from its own facts."
    )
    return f"""You are an independent Codex executor in a controlled, non-interactive evaluation.

{skill_instruction}

Isolation and capabilities:
- HOME is disposable. Work only inside HOME and never access the operator's real GTM workspace.
- Web access is unavailable. The npm, curl, and Vercel commands on PATH are deterministic mocks.
- Every login shell prepends the disposable mock directory; do not bypass it or call a system Vercel, curl, or npm binary by absolute path.
- Copy package-lock.json mechanically when bootstrapping; do not read or summarize its contents.
- Use repo-local Git configuration only. A successful mock command is authoritative for this scenario.
- No hosting environment replaces the ordinary main-branch Git persistence mechanism.

Conversation simulation:
- The task embeds scripted user choices. Treat them as successive replies and complete the exchange without waiting.
- Record every visible turn in $HOME/eval-output/conversation.md as alternating Assistant and User H2 sections.
- Perform authorized filesystem and Git operations for real.
- Save the concise closing response to $HOME/eval-output/final.md.
- Put no evaluation commentary in either output file.

User task:
{eval_case['prompt']}
"""


def run_one(eval_case: dict, configuration: str, iteration: Path) -> dict:
    eval_dir = iteration / f"eval-{eval_case['id']}-{eval_case['name']}"
    run_dir = eval_dir / configuration / "run-1"
    outputs = run_dir / "outputs"
    outputs.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"gtm-workflow-{eval_case['id']}-{configuration}-") as temp:
        home = Path(temp) / "home"
        home.mkdir()
        write_command_mocks(home)
        codex_home = home / ".codex"
        codex_home.mkdir()
        for name in AUTH_FILES:
            source = Path.home() / ".codex" / name
            if source.exists():
                shutil.copy2(source, codex_home / name)
        env = {
            "HOME": str(home),
            "CODEX_HOME": str(codex_home),
            "GIT_CONFIG_GLOBAL": str(home / ".gitconfig"),
            "XDG_CONFIG_HOME": str(home / ".config"),
            "PATH": str(home / "bin") + os.pathsep + os.environ.get("PATH", ""),
            "LANG": os.environ.get("LANG", "C.UTF-8"),
            "TERM": "dumb",
        }
        seed_home(eval_case, home, env)
        skill_path = copy_skill(home) if configuration == "with_skill" else None
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
                pass
        usage = next(
            (event.get("usage", {}) for event in reversed(events) if event.get("type") == "turn.completed"),
            {},
        )
        messages = [
            event["item"]["text"]
            for event in events
            if event.get("type") == "item.completed"
            and event.get("item", {}).get("type") == "agent_message"
        ]
        secret_exposed = any(secret in process.stdout or secret in process.stderr for secret in EVAL_SECRETS)
        for path in (home / "eval-output").iterdir():
            if path.is_file():
                body = path.read_text(errors="replace")
                secret_exposed = secret_exposed or any(secret in body for secret in EVAL_SECRETS)
                for secret in EVAL_SECRETS:
                    body = body.replace(secret, "[REDACTED-EVAL-SECRET]")
                (outputs / path.name).write_text(body)
        if not (outputs / "final.md").exists():
            (outputs / "final.md").write_text(
                (messages[-1] if messages else "Executor produced no final answer.") + "\n"
            )
        (outputs / "artifact-report.md").write_text(artifact_report(home))
        snapshot = run_dir / "sandbox_snapshot"
        snapshot.mkdir()
        if (home / ".gtm").exists():
            shutil.copytree(home / ".gtm", snapshot / ".gtm", symlinks=True)
        sanitized_stdout = process.stdout
        sanitized_stderr = process.stderr
        for secret in EVAL_SECRETS:
            sanitized_stdout = sanitized_stdout.replace(secret, "[REDACTED-EVAL-SECRET]")
            sanitized_stderr = sanitized_stderr.replace(secret, "[REDACTED-EVAL-SECRET]")
        transcript = [
            "## Eval Prompt",
            "",
            eval_case["prompt"],
            "",
            "## Executor JSONL",
            "",
            "~~~jsonl",
            sanitized_stdout.rstrip(),
            "~~~",
        ]
        if sanitized_stderr.strip():
            transcript += ["", "## Executor stderr", "", "~~~text", sanitized_stderr.rstrip(), "~~~"]
        (run_dir / "transcript.md").write_text("\n".join(transcript) + "\n")
        total_tokens = int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0))
        timing = {
            "total_tokens": total_tokens,
            "duration_ms": round(duration * 1000),
            "total_duration_seconds": round(duration, 3),
        }
        tool_calls = sum(
            1
            for event in events
            if event.get("type") == "item.completed"
            and event.get("item", {}).get("type") in {"command_execution", "file_change", "mcp_tool_call"}
        )
        metrics = {
            "tool_calls": {},
            "total_tool_calls": tool_calls,
            "total_steps": tool_calls,
            "files_created": sorted(path.name for path in outputs.iterdir()),
            "errors_encountered": int(process.returncode != 0),
            "output_chars": sum(path.stat().st_size for path in outputs.iterdir()),
            "transcript_chars": (run_dir / "transcript.md").stat().st_size,
        }
        (run_dir / "timing.json").write_text(json.dumps(timing, indent=2) + "\n")
        (outputs / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
        (run_dir / "executor_status.json").write_text(
            json.dumps({"returncode": process.returncode, "secret_exposed": secret_exposed}, indent=2) + "\n"
        )
        return {
            "eval": eval_case["name"],
            "configuration": configuration,
            "returncode": process.returncode,
            **timing,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    parser.add_argument("--ids")
    parser.add_argument("--configurations", default="with_skill,without_skill")
    parser.add_argument("--max-workers", type=int, default=4)
    args = parser.parse_args()
    configurations = [item.strip() for item in args.configurations.split(",") if item.strip()]
    if set(configurations) - {"with_skill", "without_skill"}:
        parser.error("configurations must be with_skill and/or without_skill")
    evals = json.loads((EVAL_ROOT / "evals.json").read_text())["evals"]
    if args.ids:
        selected = {int(item) for item in args.ids.split(",")}
        evals = [case for case in evals if case["id"] in selected]
    args.iteration.mkdir(parents=True, exist_ok=True)
    for case in evals:
        eval_dir = args.iteration / f"eval-{case['id']}-{case['name']}"
        eval_dir.mkdir(parents=True, exist_ok=True)
        metadata = {
            "eval_id": case["id"],
            "eval_name": case["name"],
            "prompt": case["prompt"],
            "assertions": case["assertions"],
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
        futures = [pool.submit(run_one, case, configuration, args.iteration) for case, configuration in jobs]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(json.dumps(result), flush=True)
    (args.iteration / "run_summary_raw.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
