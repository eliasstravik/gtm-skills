#!/usr/bin/env python3
"""Check user-visible eval messages for unsolicited implementation detail."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys


MUTATION_CASES = {
    "fresh-setup-invoke-only-connection",
    "setup-second-target",
    "create-local-materializes-registry",
    "create-triggered-infrastructure",
    "clay-on-demand-publish-and-cancel",
    "inspect-node-health-repair",
    "update-draft-registry-and-bare-publish",
    "delete-record-only-and-bound-target",
}
LOCAL_NONTECH_CASES = {
    "create-local-materializes-registry",
    "run-local-ungated",
    "show-business-workflow",
    "open-and-share-saved-results",
}
DIAGNOSTIC_ID_CASES = {
    "run-external-cost-gate",
    "run-local-ungated",
    "inspect-single-workflow",
    "open-and-share-saved-results",
}


def assistant_text(run_dir: Path) -> str:
    conversation = run_dir / "outputs/conversation.md"
    final = run_dir / "outputs/final.md"
    parts: list[str] = []
    if conversation.is_file():
        chunks = re.split(r"(?m)^## (Assistant|User)\s*$", conversation.read_text(errors="replace"))
        for index in range(1, len(chunks), 2):
            if chunks[index] == "Assistant" and index + 1 < len(chunks):
                parts.append(chunks[index + 1])
    if final.is_file():
        parts.append(final.read_text(errors="replace"))
    return "\n".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    parser.add_argument("--configurations", default="with_skill")
    args = parser.parse_args()
    selected = {item.strip() for item in args.configurations.split(",") if item.strip()}
    failures: list[str] = []

    for eval_dir in sorted(args.iteration.glob("eval-*")):
        metadata = json.loads((eval_dir / "eval_metadata.json").read_text())
        name = metadata["eval_name"]
        if name == "expert-technical-details":
            continue
        for configuration_dir in sorted(path for path in eval_dir.iterdir() if path.is_dir()):
            if configuration_dir.name not in selected:
                continue
            run_dir = configuration_dir / "run-1"
            if not (run_dir / "executor_status.json").is_file():
                continue
            chat = assistant_text(run_dir)
            checks: list[tuple[str, str]] = [
                (r"```(?:typescript|ts|javascript|js|sql|json|diff)", "fenced implementation content"),
                (r"(?m)^# Workflows$|^Target:\s|^Kind:\s", "complete workflow file body"),
                (r"(?i)(?:/Users/|/private/tmp/|/tmp/|~/.gtm/)", "raw filesystem path"),
                (r"(?i)\b(?:token count|token usage|telemetry)\b", "telemetry"),
                (r"(?i)\b(?:branch|upstream|remote|agent-harness)\b|`main`|\bon main\b", "Git or scheduler mechanics"),
                (r"(?i)\bclay-\d+\b", "target identifier"),
                (r"\b[A-Z][A-Z0-9_]*(?:_URL|_TOKEN|_KEY|_SECRET)\b", "credential pointer"),
            ]
            if name in MUTATION_CASES:
                checks.append((r"(?m)^\*\*/workflows/\*/state\.sqlite|^@@ |^\+\+\+ |^--- ", "config, ignore, or diff body"))
            if name in LOCAL_NONTECH_CASES:
                checks.append((r"(?i)\b(?:TypeScript|SQLite|Datasette|sqlite-web|immutable mode|process id|PID)\b", "local implementation product"))
            if name in DIAGNOSTIC_ID_CASES:
                checks.append((r"(?i)\b(?:clay-\d+|run-\d+|run-local-[a-z0-9-]+|run_id)\b", "internal run or workflow identifier"))
            for pattern, label in checks:
                if re.search(pattern, chat):
                    failures.append(f"{name} {configuration_dir.name}: {label}")

    if failures:
        print("FAIL")
        for failure in failures:
            print(f"- {failure}")
        sys.exit(1)
    print("PASS: user-visible transcripts contain no unsolicited implementation detail")


if __name__ == "__main__":
    main()
