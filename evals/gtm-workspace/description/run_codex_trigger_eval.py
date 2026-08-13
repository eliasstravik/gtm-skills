#!/usr/bin/env python3
"""Measure gtm-workspace discovery with isolated Codex/GPT runs."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SKILL = ROOT / "skills" / "gtm-workspace"
DEFAULT_EVALS = Path(__file__).with_name("trigger-eval.json")
REAL_CODEX_HOME = Path.home() / ".codex"
AUTH_FILES = ("auth.json", ".credentials.json", "installation_id")


def description_from_skill() -> str:
    for line in (SKILL / "SKILL.md").read_text().splitlines():
        if line.startswith("description: "):
            return line.removeprefix("description: ")
    raise RuntimeError("SKILL.md has no description")


def install_candidate(codex_home: Path, description: str) -> None:
    target = codex_home / "skills" / "gtm-workspace"
    shutil.copytree(SKILL, target)
    skill_md = target / "SKILL.md"
    lines = skill_md.read_text().splitlines()
    for index, line in enumerate(lines):
        if line.startswith("description: "):
            lines[index] = f"description: {description}"
            break
    skill_md.write_text("\n".join(lines) + "\n")


def copy_auth(codex_home: Path) -> None:
    codex_home.mkdir(parents=True, exist_ok=True)
    for name in AUTH_FILES:
        source = REAL_CODEX_HOME / name
        if source.exists():
            shutil.copy2(source, codex_home / name)


def run_once(
    item: dict[str, object],
    item_index: int,
    repetition: int,
    description: str,
    output_dir: Path,
    model: str,
    timeout: int,
) -> dict[str, object]:
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="gtm-workspace-codex-trigger-") as temp:
        sandbox = Path(temp)
        codex_home = sandbox / ".codex"
        work = sandbox / "work"
        work.mkdir()
        copy_auth(codex_home)
        install_candidate(codex_home, description)
        skill_file = codex_home / "skills" / "gtm-workspace" / "SKILL.md"
        env = os.environ.copy()
        env.update(
            {
                "HOME": str(sandbox),
                "CODEX_HOME": str(codex_home),
                "GIT_CONFIG_GLOBAL": str(sandbox / ".gitconfig"),
            }
        )
        command = [
            "codex",
            "exec",
            "--skip-git-repo-check",
            "--ignore-user-config",
            "--ignore-rules",
            "--ephemeral",
            "-m",
            model,
            "-s",
            "read-only",
            "-C",
            str(work),
            "--json",
            str(item["query"]),
        ]
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            start_new_session=True,
        )
        events: list[str] = []
        triggered = False
        timed_out = False
        deadline = time.monotonic() + timeout
        assert process.stdout is not None
        try:
            while time.monotonic() < deadline:
                line = process.stdout.readline()
                if line:
                    events.append(line.rstrip())
                    if str(skill_file) in line or (
                        "skills/gtm-workspace/SKILL.md" in line
                        and '"type":"command_execution"' in line
                    ):
                        triggered = True
                        process.terminate()
                        break
                elif process.poll() is not None:
                    break
            else:
                timed_out = True
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

        expected = bool(item["should_trigger"])
        split = "train" if item_index % 10 < 6 else "held_out"
        record = {
            "query_index": item_index,
            "repetition": repetition,
            "split": split,
            "query": item["query"],
            "should_trigger": expected,
            "triggered": triggered,
            "correct": triggered == expected,
            "timed_out": timed_out,
            "duration_seconds": round(time.monotonic() - started, 3),
            "model": model,
        }
        transcript = output_dir / "transcripts" / f"q{item_index + 1:02d}-r{repetition}.jsonl"
        transcript.parent.mkdir(parents=True, exist_ok=True)
        transcript.write_text("\n".join(events) + ("\n" if events else ""))
        record["transcript"] = str(transcript.relative_to(output_dir))
        return record


def summarize(records: list[dict[str, object]]) -> dict[str, object]:
    def metrics(rows: list[dict[str, object]]) -> dict[str, object]:
        correct = sum(bool(row["correct"]) for row in rows)
        positives = [row for row in rows if row["should_trigger"]]
        negatives = [row for row in rows if not row["should_trigger"]]
        return {
            "runs": len(rows),
            "correct": correct,
            "accuracy": correct / len(rows) if rows else 0,
            "positive_recall": (
                sum(bool(row["triggered"]) for row in positives) / len(positives)
                if positives
                else 0
            ),
            "negative_specificity": (
                sum(not bool(row["triggered"]) for row in negatives) / len(negatives)
                if negatives
                else 0
            ),
        }

    return {
        "overall": metrics(records),
        "train": metrics([row for row in records if row["split"] == "train"]),
        "held_out": metrics([row for row in records if row["split"] == "held_out"]),
        "failures": [row for row in records if not row["correct"]],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evals", type=Path, default=DEFAULT_EVALS)
    parser.add_argument("--description", default=None)
    parser.add_argument("--candidate-file", type=Path)
    parser.add_argument("--candidate-index", type=int, default=0)
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.candidate_file:
        candidates = json.loads(args.candidate_file.read_text())["candidates"]
        description = candidates[args.candidate_index]["description"]
    else:
        description = args.description or description_from_skill()
    items = json.loads(args.evals.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    jobs = [
        (item, index, repetition)
        for index, item in enumerate(items)
        for repetition in range(1, args.runs + 1)
    ]
    records: list[dict[str, object]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(
                run_once,
                item,
                index,
                repetition,
                description,
                args.output,
                args.model,
                args.timeout,
            )
            for item, index, repetition in jobs
        ]
        for future in concurrent.futures.as_completed(futures):
            record = future.result()
            records.append(record)
            state = "PASS" if record["correct"] else "FAIL"
            print(
                f'{state} q{int(record["query_index"]) + 1:02d} '
                f'r{record["repetition"]}: expected={record["should_trigger"]} '
                f'observed={record["triggered"]}',
                flush=True,
            )

    records.sort(key=lambda row: (int(row["query_index"]), int(row["repetition"])))
    result = {
        "description": description,
        "model": args.model,
        "runs_per_query": args.runs,
        "eval_count": len(items),
        "summary": summarize(records),
        "records": records,
    }
    (args.output / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result["summary"], indent=2))


if __name__ == "__main__":
    main()
