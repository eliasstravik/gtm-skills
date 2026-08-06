#!/usr/bin/env python3
"""Deterministically grade lead-research eval artifacts and transcripts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess

EXACT_CLOSE = "No files, git history, or external systems changed."
SPINE = ("Executive brief", "Findings", "Persona relevance", "Timing", "Risks", "Outreach angles", "Recommended next step", "Priority", "Sources")


def git(repo: Path, *args: str) -> str:
    p = subprocess.run(["git", "-C", str(repo), *args,], text=True, capture_output=True)
    return p.stdout.strip() if p.returncode == 0 else ""


def clean(snapshot: Path, slug: str) -> tuple[bool, str]:
    repo = snapshot / ".gtm" / slug
    count = int(git(repo, "rev-list", "--count", "HEAD") or 0)
    status = git(repo, "status", "--porcelain")
    return count == 1 and not status, f"commit_count={count}; status={status!r}"


def text(run: Path) -> tuple[str, str]:
    return (run / "outputs/final.md").read_text(errors="replace"), (run / "transcript.md").read_text(errors="replace")


def no_question(output: str) -> bool:
    return "Reply with a number" not in output and not re.search(r"(?m)^\*\*[^*\n]+\?\*\*$", output)


def spine(output: str, count: int = 1) -> bool:
    return all(len(re.findall(rf"(?im)^\s*(?:#+\s*)?{re.escape(name)}\s*:?\s*$", output)) >= count for name in SPINE)


def priority(output: str, value: str) -> bool:
    return re.search(rf"(?im)^\s*(?:[-*]\s*)?\**Priority\**\s*:\s*`?{value}`?\s*$", output) is not None


def check(name: str, snapshot: Path, run: Path) -> list[tuple[bool, str]]:
    output, raw = text(run)
    close = output.rstrip().endswith(EXACT_CLOSE)
    if name == "root-inspected-and-unverified":
        state = clean(snapshot, "atlas-dev")
        return [
            ("Using GTM context: Atlas Dev" in output and "1 ICP" in output and "1 persona" in output, "context/counts"),
            ("platform-engineering-leader" in output and "re-segment" in output.lower(), "label preserved"),
            (all(x in output.lower() for x in ("inspected", "unverified", "hypoth")) and "Copperline leadership page" in output and "2026-07-20" in output, "evidence boundaries"),
            (all(x in output.lower() for x in ("platform standards", "q3 2026", "risk", "outreach")) and priority(output, "high") and "Confidence" in output, "interpretation/priority"),
            (spine(output) and no_question(output) and close, "brief/no question/close"),
            (state[0], state[1]),
        ]
    if name == "suborg-link-safety-and-visibility":
        state = clean(snapshot, "northstar-cloud")
        return [
            ("Using GTM context: Northstar Enterprise" in output and "1 ICP" in output and "1 persona" in output, "context/counts"),
            ("enterprise/cloud-security-director" in output and "re-segment" in output.lower(), "label preserved"),
            (all(x in output.lower() for x in ("cloud-risk", "vendor evaluation")) and "ORCHID ROOT" not in raw and "ORCHID ROOT" not in output, "node-local artifacts"),
            ("SECRET123" not in output and "private.example.test" not in output and "/deal" not in output and "Private source withheld" in output, "safe source label"),
            (spine(output) and any(priority(output, p) for p in ("high", "medium", "research-needed")) and "Confidence" in output and close, "brief/priority/close"),
            (state[0], state[1]),
        ]
    if name == "root-qualified-label-not-visible":
        state = clean(snapshot, "northstar-cloud")
        return [
            ("Using GTM context: Northstar Cloud" in output and "1 ICP" in output and "1 persona" in output, "context/counts"),
            ("enterprise/cloud-security-director" in output and ("not visible" in output.lower() or "unknown" in output.lower()) and "re-segment" in output.lower(), "label visibility"),
            ("COBALT ENTERPRISE" not in raw and "COBALT ENTERPRISE" not in output and "cloud-security-director" not in output.replace("enterprise/cloud-security-director", ""), "suborg excluded"),
            ("Patchbay leadership page" in output and spine(output) and priority(output, "research-needed"), "provenance/cautious brief"),
            (no_question(output) and close and state[0], f"no question/close/state: {state[1]}"),
        ]
    if name == "bulk-priority-distribution":
        state = clean(snapshot, "signal-harbor")
        return [
            ("Using GTM context: Signal Harbor" in output and output.count("revenue-operations-leader") >= 3, "context/labels"),
            ("Research-priority distribution" in output and all(re.search(rf"(?i){re.escape(p)}[^\n]*\b1\b", output) for p in ("high", "medium", "research-needed")), "priority distribution"),
            (all(x in output.lower() for x in ("inspected", "unverified", "hypoth", "conflict")) and all(x in output for x in ("Acme leadership page", "Birch leadership page", "User note")), "boundaries/provenance"),
            (spine(output, 3) and all(priority(output, p) for p in ("high", "medium", "research-needed")) and output.count("Needs review") >= 3, "three briefs"),
            (no_question(output) and close and state[0], f"no question/close/state: {state[1]}"),
        ]
    if name == "save-request-org-only":
        state = clean(snapshot, "atlas-dev")
        return [
            ("org-only" in output.lower() and ("not stored" in output.lower() or "does not store" in output.lower() or "cannot save" in output.lower()), "org-only explanation"),
            (spine(output) and "Copperline leadership page" in output, "copyable complete brief"),
            ("platform-engineering-leader" in output and "re-segment" in output.lower() and "platform standards" in output.lower(), "label/relevance"),
            (state[0] and no_question(output) and close, f"state/no question/close: {state[1]}"),
            (state[0], state[1]),
        ]
    if name == "empty-visible-set":
        state = clean(snapshot, "empty-harbor")
        return [
            ("Using GTM context: Empty Harbor" in output and "0 ICP" in output and "0 persona" in output, "zero context"),
            (("no visible persona" in output or "cannot proceed until" in output) and not any(priority(output, p) for p in ("high", "medium", "research-needed")) and not spine(output), "missing prerequisite stop"),
            ("plant-operations-director" in output and "BRONZE SUBORG" not in raw and "BRONZE SUBORG" not in output, "label/suborg exclusion"),
            (no_question(output) and close and state[0] and not re.search(r"(?i)(?:working|acting|operating) as Sam", raw + output), f"no question/lead separation/close/state: {state[1]}"),
        ]
    raise ValueError(name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    args = parser.parse_args()
    for eval_dir in sorted(args.iteration.glob("eval-*")):
        metadata = json.loads((eval_dir / "eval_metadata.json").read_text())
        for config in ("with_skill", "without_skill"):
            run = eval_dir / config / "run-1"
            if not (run / "executor_status.json").exists():
                continue
            checks = check(metadata["eval_name"], run / "sandbox_snapshot", run)
            old = re.findall(r"Working in .+ as |git identity|nearest[- ]wins|state\.json|promotion", "\n".join(text(run)), re.I)
            checks.append((not old, f"old-model hits={old!r}"))
            assertions = list(metadata["assertions"]) + ["No old-model concept appears in execution or output."]
            expectations = [{"text": a, "passed": bool(c[0]), "evidence": c[1]} for a, c in zip(assertions, checks, strict=True)]
            passed = sum(x["passed"] for x in expectations)
            grading = {
                "expectations": expectations,
                "summary": {"passed": passed, "failed": len(expectations)-passed, "total": len(expectations), "pass_rate": round(passed/len(expectations), 4)},
                "execution_metrics": json.loads((run/"outputs/metrics.json").read_text()),
                "timing": json.loads((run/"timing.json").read_text()),
                "claims": [], "user_notes_summary": {"uncertainties": [], "needs_review": [], "workarounds": []},
                "eval_feedback": {"suggestions": [], "overall": "Assertions are deterministic and scenario-specific."},
            }
            (run/"grading.json").write_text(json.dumps(grading, indent=2)+"\n")
            print(f"{metadata['eval_name']} {config}: {passed}/{len(expectations)}")


if __name__ == "__main__":
    main()
