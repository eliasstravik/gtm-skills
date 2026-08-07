#!/usr/bin/env python3
"""Reject fixture-specific names and verdicts in the shipped lead-research skill."""

from pathlib import Path
import re
import sys


SKILL_ROOT = Path(__file__).resolve().parents[3] / "skills" / "gtm-lead-research"
FORBIDDEN = (
    "Jordan Lee",
    "Copperline",
    "Mira Chen",
    "Meridian Bank",
    "Priya Nair",
    "Patchbay",
    "Elena Park",
    "Marcus Bell",
    "Theo Grant",
    "Sam Okafor",
    "FoundryCo",
    "Alex Morgan",
    "Lea Novak",
    "ORCHID",
    "COBALT",
    "BRONZE",
)
OLD_LEAKED_NAMES = re.compile(r"\b(?:Nina|Omar|Owen)\b", re.IGNORECASE)
FIXTURE_VERDICT = re.compile(
    r"(?:Jordan|Mira|Priya|Elena|Marcus|Theo|Sam).{0,80}"
    r"(?:high|medium|research-needed|confidence|review)",
    re.IGNORECASE | re.DOTALL,
)


def main() -> int:
    text = "\n".join(
        path.read_text()
        for path in sorted(SKILL_ROOT.rglob("*"))
        if path.is_file()
    )
    hits = [value for value in FORBIDDEN if value.casefold() in text.casefold()]
    if OLD_LEAKED_NAMES.search(text):
        hits.append("old leaked standalone name")
    if FIXTURE_VERDICT.search(text):
        hits.append("fixture-specific verdict")
    if hits:
        print("Leakage check failed: " + ", ".join(hits), file=sys.stderr)
        return 1
    print("Leakage check passed: no fixture names or fixture-specific verdicts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
