#!/usr/bin/env python3
"""Correct generated benchmark metadata and attach analyst observations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

SKILL_CREATOR = Path("/Users/eliasstravik/.agents/skills/skill-creator")
sys.path.insert(0, str(SKILL_CREATOR))
from scripts.aggregate_benchmark import generate_markdown  # noqa: E402

EVAL_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    args = parser.parse_args()
    benchmark_path = args.iteration / "benchmark.json"
    benchmark = json.loads(benchmark_path.read_text())
    benchmark["metadata"]["executor_model"] = "gpt-5.6-sol"
    benchmark["metadata"]["analyzer_model"] = "gpt-5.6-sol"
    benchmark["metadata"]["runs_per_configuration"] = 1
    order = {"with_skill": 0, "baseline_skill": 1, "without_skill": 2}
    benchmark["runs"].sort(
        key=lambda run: (
            int(run["eval_id"]),
            order.get(run["configuration"], 99),
            int(run["run_number"]),
        )
    )
    summary = benchmark["run_summary"]
    baseline_name = "baseline_skill" if "baseline_skill" in summary else "without_skill"
    if "with_skill" in summary and baseline_name in summary:
        candidate = summary["with_skill"]
        baseline = summary[baseline_name]
        summary = {
            "with_skill": candidate,
            baseline_name: baseline,
            "delta": {
                "pass_rate": f'{candidate["pass_rate"]["mean"] - baseline["pass_rate"]["mean"]:+.2f}',
                "time_seconds": f'{candidate["time_seconds"]["mean"] - baseline["time_seconds"]["mean"]:+.1f}',
                "tokens": f'{candidate["tokens"]["mean"] - baseline["tokens"]["mean"]:+.0f}',
            },
        }
        benchmark["run_summary"] = summary
    notes_path = args.iteration / "analysis_notes.json"
    if not notes_path.exists():
        notes_path = EVAL_ROOT / "evidence" / "final" / "analysis-notes.json"
    benchmark["notes"] = json.loads(notes_path.read_text()) if notes_path.exists() else []
    benchmark_path.write_text(json.dumps(benchmark, indent=2) + "\n")
    (args.iteration / "benchmark.md").write_text(generate_markdown(benchmark) + "\n")


if __name__ == "__main__":
    main()
