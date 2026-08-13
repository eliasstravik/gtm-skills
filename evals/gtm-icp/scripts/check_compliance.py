#!/usr/bin/env python3
"""Validate SOP form, evidence coverage, resources, and optimizer selection."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys


EVAL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_NAME = EVAL_ROOT.name
SKILL_ROOT = REPO_ROOT / "skills" / SKILL_NAME
SKILL_FILE = SKILL_ROOT / "SKILL.md"
FINAL_EVIDENCE = EVAL_ROOT / "evidence" / "final"
SECTIONS = ["Trigger", "Scope", "Inputs", "Roles", "Procedure", "Outputs", "Exceptions", "QC", "References"]
SURVIVOR_CATEGORIES = {
    "private or internal facts",
    "chosen-among-equals conventions",
    "taste or quality bars",
    "authority or approval structures",
    "fresh local state",
    "deterministic scripts or tools",
}


def fail(message: str) -> None:
    raise AssertionError(message)


def frontmatter_and_body(text: str) -> tuple[dict[str, str], list[str]]:
    lines = text.splitlines()
    if len(lines) < 4 or lines[0] != "---":
        fail("missing YAML frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise AssertionError("unterminated YAML frontmatter") from exc
    metadata = {}
    for line in lines[1:end]:
        key, separator, value = line.partition(":")
        if separator:
            metadata[key.strip()] = value.strip()
    return metadata, lines[end + 1 :]


def main() -> None:
    text = SKILL_FILE.read_text()
    metadata, body = frontmatter_and_body(text)
    if metadata.get("name") != SKILL_NAME:
        fail("frontmatter name must match directory")
    description = metadata.get("description", "")
    if not description.startswith("Triggers when"):
        fail("description must be third-person and start with Triggers when")
    if len(description) > 1024 or re.search(r"<[^>]+>", description):
        fail("description length/XML constraint failed")
    if "Not for" not in description:
        fail("description lacks negative routing")
    headings = [line.removeprefix("## ") for line in body if line.startswith("## ")]
    if headings != SECTIONS:
        fail(f"ordered sections differ: {headings}")
    if len(body) >= 500 or len(" ".join(body).split()) >= 5000:
        fail("body exceeds SOP limit")
    if any(line in {"## Switch", "## Details", "## Calls"} for line in body):
        fail("obsolete form heading remains")
    lower_body = "\n".join(body).lower()
    if any(term in lower_body for term in ("use git status", "break a complex problem", "best practice")):
        fail("generic competence prose remains")

    references = SKILL_ROOT / "references"
    for path in references.rglob("*"):
        if path.is_dir() and path != references:
            fail(f"nested reference directory: {path}")
        if path.is_file() and path.suffix == ".md":
            lines = path.read_text().splitlines()
            if len(lines) > 100 and not any(line.strip() in {"## Contents", "## Table of contents"} for line in lines):
                fail(f"reference over 100 lines lacks contents: {path}")
    if (references / "context.md").exists():
        fail("obsolete context.md remains")
    for match in re.finditer(r"\((references|templates)/([^)]+)\)", "\n".join(body)):
        if not (SKILL_ROOT / match.group(1) / match.group(2)).exists():
            fail(f"broken resource link: {match.group(0)}")

    trigger_set = json.loads((EVAL_ROOT / "description" / "trigger-eval.json").read_text())
    positives = sum(bool(item["should_trigger"]) for item in trigger_set)
    if len(trigger_set) != 20 or not (8 <= positives <= 12):
        fail("trigger set must contain 20 balanced queries")

    optimization = json.loads((FINAL_EVIDENCE / "trigger-optimization.json").read_text())
    if description != optimization["selection"]["best_description"]:
        fail("description differs from optimizer best_description")

    evidence = json.loads((FINAL_EVIDENCE / "line-justifications.json").read_text())
    covered = set()
    for record in evidence["records"]:
        if record["survivor_category"] not in SURVIVOR_CATEGORIES:
            fail(f"unknown survivor category: {record['survivor_category']}")
        if not record["justification"].strip():
            fail("empty line justification")
        covered.update(record["line_numbers"])
    all_lines = text.splitlines()
    frontmatter_end = all_lines.index("---", 1)
    expected = {
        number
        for number, line in enumerate(all_lines, start=1)
        if number > frontmatter_end + 1 and line.strip()
    }
    if covered != expected:
        fail(f"line evidence mismatch: missing={sorted(expected-covered)} extra={sorted(covered-expected)}")

    print(f"{SKILL_NAME}: SOP compliance passed ({len(expected)} retained body lines evidenced)")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, KeyError, FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"{SKILL_NAME}: {exc}", file=sys.stderr)
        raise SystemExit(1)
