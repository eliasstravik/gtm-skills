#!/usr/bin/env python3
"""Correct generated benchmark metadata, names, token totals, and analyst notes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


SKILL_CREATOR = Path("/Users/eliasstravik/.agents/skills/skill-creator")
sys.path.insert(0, str(SKILL_CREATOR))
from scripts.aggregate_benchmark import calculate_stats, generate_markdown  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    args = parser.parse_args()
    benchmark_path = args.iteration / "benchmark.json"
    benchmark = json.loads(benchmark_path.read_text())
    benchmark["metadata"].update({"executor_model": "gpt-5.6-sol", "analyzer_model": "gpt-5.6-sol", "runs_per_configuration": 1, "skill_path": "skills/gtm-workflow"})

    names: dict[int, str] = {}
    totals: dict[str, list[int]] = {}
    for eval_dir in args.iteration.glob("eval-*"):
        metadata = json.loads((eval_dir / "eval_metadata.json").read_text())
        names[int(metadata["eval_id"])] = metadata["eval_name"]
    for run in benchmark["runs"]:
        run["eval_name"] = names[run["eval_id"]]
        run_dir = next(args.iteration.glob(f"eval-{run['eval_id']}-*")) / run["configuration"] / f"run-{run['run_number']}"
        total = json.loads((run_dir / "timing.json").read_text())["total_tokens"]
        run["result"]["tokens"] = total
        totals.setdefault(run["configuration"], []).append(total)
    for configuration, values in totals.items():
        benchmark["run_summary"][configuration]["tokens"] = calculate_stats(values)
    candidate = benchmark["run_summary"]["with_skill"]
    baseline_name = "old_skill" if "old_skill" in benchmark["run_summary"] else "without_skill"
    baseline = benchmark["run_summary"][baseline_name]
    benchmark["run_summary"]["delta"] = {
        "pass_rate": f"{candidate['pass_rate']['mean'] - baseline['pass_rate']['mean']:+.2f}",
        "time_seconds": f"{candidate['time_seconds']['mean'] - baseline['time_seconds']['mean']:+.1f}",
        "tokens": f"{candidate['tokens']['mean'] - baseline['tokens']['mean']:+.0f}",
    }
    benchmark["runs"].sort(key=lambda run: (run["eval_id"], 0 if run["configuration"] == "with_skill" else 1))
    notes_path = args.iteration / "analysis_notes.json"
    benchmark["notes"] = json.loads(notes_path.read_text()) if notes_path.is_file() else []
    benchmark_path.write_text(json.dumps(benchmark, indent=2) + "\n")
    markdown = generate_markdown(benchmark).replace("(1 runs each per configuration)", "(1 run per configuration)")
    (args.iteration / "benchmark.md").write_text(markdown + "\n")


if __name__ == "__main__":
    main()
