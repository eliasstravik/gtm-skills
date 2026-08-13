#!/usr/bin/env python3
"""Correct generated benchmark metadata and attach analyst observations."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

SKILL_CREATOR = Path("/Users/eliasstravik/.agents/skills/skill-creator")
sys.path.insert(0, str(SKILL_CREATOR))
from scripts.aggregate_benchmark import calculate_stats, generate_markdown  # noqa: E402

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
    benchmark["metadata"]["skill_path"] = "skills/gtm-persona"
    tokens_by_configuration: dict[str, list[int]] = {}
    for run in benchmark["runs"]:
        run_dir = next(args.iteration.glob(f"eval-{run['eval_id']}-*")) / run["configuration"] / f"run-{run['run_number']}"
        timing = json.loads((run_dir / "timing.json").read_text())
        run["result"]["tokens"] = timing["total_tokens"]
        tokens_by_configuration.setdefault(run["configuration"], []).append(timing["total_tokens"])
    summary = benchmark["run_summary"]
    for configuration, values in tokens_by_configuration.items():
        summary[configuration]["tokens"] = calculate_stats(values)
    candidate = summary.get("with_skill", {})
    baseline = summary.get("baseline_skill", {})
    summary["delta"] = {
        "pass_rate": f"{candidate.get('pass_rate', {}).get('mean', 0) - baseline.get('pass_rate', {}).get('mean', 0):+.2f}",
        "time_seconds": f"{candidate.get('time_seconds', {}).get('mean', 0) - baseline.get('time_seconds', {}).get('mean', 0):+.1f}",
        "tokens": f"{candidate.get('tokens', {}).get('mean', 0) - baseline.get('tokens', {}).get('mean', 0):+.0f}",
    }
    benchmark["run_summary"] = {
        key: summary[key]
        for key in ("with_skill", "baseline_skill", "delta")
        if key in summary
    }
    benchmark["runs"].sort(
        key=lambda run: (
            0 if run["configuration"] == "with_skill" else 1,
            run["eval_id"],
            run["run_number"],
        )
    )
    notes_path = args.iteration / "analysis_notes.json"
    if not notes_path.exists():
        notes_path = EVAL_ROOT / "evidence" / "final" / "analysis-notes.json"
    benchmark["notes"] = json.loads(notes_path.read_text()) if notes_path.exists() else []
    benchmark_path.write_text(json.dumps(benchmark, indent=2) + "\n")
    (args.iteration / "benchmark.md").write_text(generate_markdown(benchmark) + "\n")


if __name__ == "__main__":
    main()
