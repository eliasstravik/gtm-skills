#!/usr/bin/env python3
"""Codex/GPT equivalent of skill-creator's trigger-description classifier."""

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


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SKILL = ROOT / "skills" / "gtm-context" / "SKILL.md"
REAL_CODEX_HOME = Path.home() / ".codex"
AUTH_FILES = ("auth.json", ".credentials.json", "installation_id")


def current_description() -> str:
    for line in SKILL.read_text().splitlines():
        if line.startswith("description: "):
            return line.removeprefix("description: ")
    raise RuntimeError("SKILL.md has no description")


def copy_auth(target: Path) -> None:
    target.mkdir(parents=True)
    for name in AUTH_FILES:
        source = REAL_CODEX_HOME / name
        if source.exists():
            shutil.copy2(source, target / name)


def classify(
    item: dict[str, object],
    index: int,
    repetition: int,
    description: str,
    model: str,
    timeout: int,
    output: Path,
) -> dict[str, object]:
    prompt = f"""You are evaluating skill selection. Decide whether a skill with the description below should trigger for the user request. Judge direct applicability only. Explicit invocation triggers. A task merely mentioning, reading, or depending on the skill's domain does not trigger when the requested outcome falls under an exclusion. Return only the required JSON object.

SKILL DESCRIPTION:
{description}

USER REQUEST:
{item['query']}
"""
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="gtm-context-codex-classifier-") as temp:
        sandbox = Path(temp)
        codex_home = sandbox / ".codex"
        work = sandbox / "work"
        work.mkdir()
        copy_auth(codex_home)
        response_path = sandbox / "response.json"
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
            "--output-schema",
            str(HERE / "classifier-schema.json"),
            "-o",
            str(response_path),
            prompt,
        ]
        completed = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            timeout=timeout,
        )
        raw_log = completed.stdout
        response = json.loads(response_path.read_text())

    observed = bool(response["should_trigger"])
    expected = bool(item["should_trigger"])
    split = "train" if index % 10 < 6 else "held_out"
    log_path = output / "transcripts" / f"q{index + 1:02d}-r{repetition}.txt"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(raw_log)
    return {
        "query_index": index,
        "repetition": repetition,
        "split": split,
        "query": item["query"],
        "should_trigger": expected,
        "triggered": observed,
        "correct": observed == expected,
        "reason": response["reason"],
        "duration_seconds": round(time.monotonic() - started, 3),
        "model": model,
        "transcript": str(log_path.relative_to(output)),
    }


def metrics(rows: list[dict[str, object]]) -> dict[str, object]:
    positives = [row for row in rows if row["should_trigger"]]
    negatives = [row for row in rows if not row["should_trigger"]]
    correct = sum(bool(row["correct"]) for row in rows)
    return {
        "runs": len(rows),
        "correct": correct,
        "accuracy": correct / len(rows) if rows else 0,
        "positive_recall": sum(bool(row["triggered"]) for row in positives) / len(positives),
        "negative_specificity": sum(not bool(row["triggered"]) for row in negatives) / len(negatives),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evals", type=Path, default=HERE / "trigger-eval.json")
    parser.add_argument("--candidate-file", type=Path)
    parser.add_argument("--candidate-index", type=int, default=0)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.candidate_file:
        candidate = json.loads(args.candidate_file.read_text())["candidates"][args.candidate_index]
        description = candidate["description"]
    else:
        description = current_description()
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
                classify,
                item,
                index,
                repetition,
                description,
                args.model,
                args.timeout,
                args.output,
            )
            for item, index, repetition in jobs
        ]
        for future in concurrent.futures.as_completed(futures):
            record = future.result()
            records.append(record)
            print(
                f'{"PASS" if record["correct"] else "FAIL"} '
                f'q{int(record["query_index"]) + 1:02d} r{record["repetition"]}: '
                f'expected={record["should_trigger"]} observed={record["triggered"]}',
                flush=True,
            )

    records.sort(key=lambda row: (int(row["query_index"]), int(row["repetition"])))
    train = [row for row in records if row["split"] == "train"]
    held_out = [row for row in records if row["split"] == "held_out"]
    result = {
        "description": description,
        "model": args.model,
        "runs_per_query": args.runs,
        "eval_count": len(items),
        "summary": {
            "overall": metrics(records),
            "train": metrics(train),
            "held_out": metrics(held_out),
            "failures": [row for row in records if not row["correct"]],
        },
        "records": records,
    }
    (args.output / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result["summary"], indent=2))


if __name__ == "__main__":
    main()
