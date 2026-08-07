#!/usr/bin/env python3
"""Correct lead-segmentation benchmark metadata and attach analyst observations."""

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
    notes_path = args.iteration / "analysis_notes.json"
    if not notes_path.exists():
        notes_path = EVAL_ROOT / "evidence" / "final" / "analysis-notes.json"
    benchmark["notes"] = json.loads(notes_path.read_text()) if notes_path.exists() else []
    benchmark_path.write_text(json.dumps(benchmark, indent=2) + "\n")
    (args.iteration / "benchmark.md").write_text(generate_markdown(benchmark) + "\n")


if __name__ == "__main__":
    main()
