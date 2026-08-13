#!/usr/bin/env python3
"""Evaluate gtm-icp descriptions with an isolated Codex/GPT classifier."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time


HERE = Path(__file__).resolve().parent
AUTH_FILES = ("auth.json", ".credentials.json", "installation_id")


def copy_auth(target: Path) -> None:
    target.mkdir(parents=True)
    for name in AUTH_FILES:
        source = Path.home() / ".codex" / name
        if source.exists():
            shutil.copy2(source, target / name)


def classify(item: dict, index: int, repetition: int, description: str, model: str, timeout: int, output: Path) -> dict:
    prompt = f"""Decide whether the model-invoked skill described below should trigger for the user request. Judge the requested outcome, not keyword overlap. Explicit invocation triggers. Exclusions win when the requested outcome belongs to a sibling workflow. Return only the required JSON object.

SKILL DESCRIPTION:
{description}

USER REQUEST:
{item['query']}
"""
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="gtm-icp-description-") as temp:
        sandbox = Path(temp)
        codex_home = sandbox / ".codex"
        work = sandbox / "work"
        work.mkdir()
        copy_auth(codex_home)
        response = sandbox / "response.json"
        env = os.environ.copy()
        env.update({"HOME": str(sandbox), "CODEX_HOME": str(codex_home), "GIT_CONFIG_GLOBAL": str(sandbox / ".gitconfig")})
        completed = subprocess.run(
            [
                "codex", "exec", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "--ephemeral",
                "-m", model, "-s", "read-only", "-C", str(work), "--output-schema", str(HERE / "classifier-schema.json"),
                "-o", str(response), prompt,
            ],
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
        )
        raw = completed.stdout
        parsed = json.loads(response.read_text())
    observed = bool(parsed["should_trigger"])
    expected = bool(item["should_trigger"])
    split = "train" if index % 10 < 6 else "held_out"
    transcript = output / "transcripts" / f"q{index + 1:02d}-r{repetition}.txt"
    transcript.parent.mkdir(parents=True, exist_ok=True)
    transcript.write_text(raw)
    token_match = re.search(r"tokens used\s*\n([\d,]+)", raw)
    return {
        "query_index": index,
        "repetition": repetition,
        "split": split,
        "query": item["query"],
        "should_trigger": expected,
        "triggered": observed,
        "correct": observed == expected,
        "reason": parsed["reason"],
        "duration_seconds": round(time.monotonic() - started, 3),
        "tokens_used": int(token_match.group(1).replace(",", "")) if token_match else 0,
        "model": model,
        "transcript": str(transcript.relative_to(output)),
    }


def metrics(rows: list[dict]) -> dict:
    positives = [row for row in rows if row["should_trigger"]]
    negatives = [row for row in rows if not row["should_trigger"]]
    return {
        "runs": len(rows),
        "correct": sum(bool(row["correct"]) for row in rows),
        "accuracy": sum(bool(row["correct"]) for row in rows) / len(rows) if rows else 0,
        "positive_recall": sum(bool(row["triggered"]) for row in positives) / len(positives) if positives else 0,
        "negative_specificity": sum(not bool(row["triggered"]) for row in negatives) / len(negatives) if negatives else 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evals", type=Path, default=HERE / "trigger-eval.json")
    parser.add_argument("--candidates", type=Path, default=HERE / "candidates.json")
    parser.add_argument("--candidate-index", type=int, required=True)
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    candidate = json.loads(args.candidates.read_text())["candidates"][args.candidate_index]
    description = candidate["description"]
    items = json.loads(args.evals.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    jobs = [(item, index, repetition) for index, item in enumerate(items) for repetition in range(1, args.runs + 1)]
    records = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(classify, item, index, repetition, description, args.model, args.timeout, args.output) for item, index, repetition in jobs]
        for future in concurrent.futures.as_completed(futures):
            record = future.result()
            records.append(record)
            print(f"{'PASS' if record['correct'] else 'FAIL'} q{record['query_index'] + 1:02d} r{record['repetition']}", flush=True)
    records.sort(key=lambda row: (row["query_index"], row["repetition"]))
    train = [row for row in records if row["split"] == "train"]
    held = [row for row in records if row["split"] == "held_out"]
    result = {
        "description": description,
        "rationale": candidate["rationale"],
        "model": args.model,
        "runs_per_query": args.runs,
        "eval_count": len(items),
        "summary": {
            "overall": metrics(records),
            "train": metrics(train),
            "held_out": metrics(held),
            "total_duration_seconds": round(sum(row["duration_seconds"] for row in records), 3),
            "total_tokens": sum(row["tokens_used"] for row in records),
            "failures": [row for row in records if not row["correct"]],
        },
        "records": records,
    }
    (args.output / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result["summary"], indent=2))


if __name__ == "__main__":
    main()
