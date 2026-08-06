#!/usr/bin/env python3
"""Deterministically grade lead-scoring eval artifacts and transcripts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess


EXACT_CLOSE = "No files, git history, or external systems changed."
FIELDS = ("Lead", "Label", "Band", "Reasoning", "Confidence", "Needs review", "Open questions")


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else ""


def final_text(run_dir: Path) -> str:
    path = run_dir / "outputs/final.md"
    return path.read_text(errors="replace") if path.is_file() else ""


def transcript_text(run_dir: Path) -> str:
    path = run_dir / "transcript.md"
    return path.read_text(errors="replace") if path.is_file() else ""


def clean_seed(snapshot: Path, slug: str) -> tuple[bool, str]:
    repo = snapshot / ".gtm" / slug
    count = int(git(repo, "rev-list", "--count", "HEAD") or 0)
    status = git(repo, "status", "--porcelain")
    return count == 1 and not status, f"commit_count={count}; status={status!r}"


def no_question(text: str) -> bool:
    return not re.search(r"(?m)^\*\*[^*\n]+\?\*\*$", text) and "Reply with a number" not in text


def has_fields(text: str, leads: int = 1) -> bool:
    return all(len(re.findall(rf"(?im)^\s*(?:[-*]\s*)?\**{re.escape(field)}\**\s*:", text)) >= leads for field in FIELDS)


def assigned(text: str, label: str) -> bool:
    return re.search(rf"(?im)^\s*(?:[-*]\s*)?\**Label\**\s*:\s*`?{re.escape(label)}`?\s*$", text) is not None


def banded(text: str, band: str) -> bool:
    return re.search(rf"(?im)^\s*(?:[-*]\s*)?\**Band\**\s*:\s*`?{re.escape(band)}`?\s*$", text) is not None


def no_dead_model(run_dir: Path) -> tuple[bool, str]:
    text = final_text(run_dir) + "\n" + transcript_text(run_dir)
    patterns = (
        r"Working in .+ as ",
        r"git identity",
        r"nearest[- ]wins",
        r"inherited persona",
        r"state\.json",
        r"promotion",
    )
    hits = [pattern for pattern in patterns if re.search(pattern, text, re.I)]
    return not hits, f"dead-model pattern hits={hits!r}"


def result(ok: bool, evidence: str) -> tuple[bool, str]:
    return bool(ok), evidence


def checks_for(name: str, snapshot: Path, run_dir: Path) -> list[tuple[bool, str]]:
    output = final_text(run_dir)
    raw = transcript_text(run_dir)

    if name == "bulk-bands-and-no-match":
        clean = clean_seed(snapshot, "beacon-revenue")
        labels = re.findall(r"(?im)^\s*(?:[-*]\s*)?\**Label\**\s*:\s*`?([^`\n]+?)`?\s*$", output)
        return [
            result("Using GTM context: Beacon Revenue — 1 persona visible" in output, "Checked exact root context line."),
            result(labels.count("revenue-operations-leader") == 2 and labels.count("no-match") == 1 and len(labels) == 3 and "developer-experience-lead" not in output, "Checked exact preservation of three supplied labels."),
            result(sum(banded(output, band) for band in ("strong-fit", "good-fit", "no-fit")) == 3 and all(banded(output, band) for band in ("strong-fit", "good-fit", "no-fit")) and not banded(output, "weak-fit"), "Checked the three expected band fields."),
            result(all(term in output.lower() for term in ("counts by label", "band distribution", "low-confidence count", "review-needed count")) and all(re.search(rf"(?i){re.escape(band)}[^\n]*\b1\b", output) for band in ("strong-fit", "good-fit", "no-fit")), "Checked opening label and band counts."),
            result(all(term in output.lower() for term in ("forecasting", "pipeline governance", "revenue systems")) and not re.search(r"\b(?:score|points?|weights?|percent)\s*[:=]?\s*\d", output, re.I), "Checked prose grounding without arithmetic or point rubric."),
            result(has_fields(output, leads=3) and no_question(output) and output.rstrip().endswith(EXACT_CLOSE) and not re.search(r"(?i)(?:working|operating|acting)\s+as\s+(?:jordan|casey|evan)", raw + "\n" + output), "Checked compact fields, lead/operator separation, no question, and exact close."),
            result(clean[0], clean[1]),
        ]

    if name == "suborg-disqualifier-cap":
        clean = clean_seed(snapshot, "northstar-cloud")
        forbidden = "ORCHID ROOT LEAD-SCORING PHRASE"
        return [
            result("Using GTM context: Northstar Enterprise — 1 persona visible" in output, "Checked exact Enterprise context line."),
            result(assigned(output, "enterprise/cloud-security-director") and len(re.findall(r"(?im)^\s*(?:[-*]\s*)?\**Label\**\s*:", output)) == 1, "Checked validation and preservation of the supplied qualified label."),
            result(banded(output, "weak-fit") and "cap" in output.lower() and "disqualifier" in output.lower(), "Checked weak-fit disqualifier cap."),
            result("External consultants without internal approval authority are not a fit" in output and all(term in output.lower() for term in ("cloud-risk", "vendor evaluation")), "Checked exact disqualifier quote and retained matched responsibilities."),
            result(forbidden not in raw and forbidden not in output and "developer-experience-lead" not in output, "Checked absence of root-only content in transcript and output."),
            result(has_fields(output) and no_question(output) and output.rstrip().endswith(EXACT_CLOSE) and not re.search(r"(?i)(?:working|operating|acting)\s+as\s+mira", raw + "\n" + output), "Checked compact fields, lead/operator separation, no question, and exact close."),
            result(clean[0], clean[1]),
        ]

    if name == "root-unknown-label":
        clean = clean_seed(snapshot, "northstar-cloud")
        forbidden = "COBALT ENTERPRISE LEAD-SCORING PHRASE"
        return [
            result("Using GTM context: Northstar Cloud — 1 persona visible" in output, "Checked exact root context line."),
            result(assigned(output, "enterprise/cloud-security-director") and "unknown" in output.lower(), "Checked unknown-label flag and verbatim preservation."),
            result(banded(output, "no-fit") and not assigned(output, "developer-experience-lead") and ("re-segment" in output.lower() or "reinterpret" in output.lower()), "Checked no-fit without re-segmentation."),
            result(forbidden not in raw and forbidden not in output and "cloud-risk" not in raw and "cloud-risk" not in output, "Checked absence of Enterprise-only persona prose."),
            result(has_fields(output) and no_question(output) and re.search(r"(?im)^\s*(?:[-*]\s*)?\**Needs review\**\s*:\s*true\s*$", output) is not None and not re.search(r"(?i)(?:working|operating|acting)\s+as\s+priya", raw + "\n" + output), "Checked compact fields, review flag, lead/operator separation, and no question."),
            result(clean[0] and output.rstrip().endswith(EXACT_CLOSE), f"Checked clean state and exact close: {clean[1]}"),
        ]

    if name == "thin-persona-confidence":
        clean = clean_seed(snapshot, "broadview")
        return [
            result("Using GTM context: Broadview — 1 persona visible" in output and assigned(output, "senior-decision-maker"), "Checked context and label preservation."),
            result(banded(output, "strong-fit") and not re.search(r"\b(?:score|points?|weights?|percent)\s*[:=]?\s*\d", output, re.I), "Checked prose-only strong-fit band."),
            result(any(term in output.lower() for term in ("thin", "limited", "broad", "not discriminat", "little detail")), "Checked explicit thin-persona caveat."),
            result(re.search(r"(?im)^\s*(?:[-*]\s*)?\**Confidence\**\s*:\s*high\s*$", output) is not None and re.search(r"(?im)^\s*(?:[-*]\s*)?\**Needs review\**\s*:\s*false\s*$", output) is not None, "Checked item-based high confidence and no review."),
            result(has_fields(output) and output.rstrip().endswith(EXACT_CLOSE), "Checked compact fields and exact close."),
            result(clean[0], clean[1]),
        ]

    if name == "empty-visible-set":
        clean = clean_seed(snapshot, "empty-harbor")
        forbidden = "BRONZE SUBORG LEAD-SCORING PHRASE"
        band_lines = re.findall(r"(?im)^\s*(?:[-*]\s*)?\**Band\**\s*:", output)
        return [
            result("Using GTM context: Empty Harbor — 0 personas visible" in output, "Checked exact zero-visible context line."),
            result(("no visible persona" in output or "does not have any visible persona" in output or ("cannot proceed until" in output and "has a persona" in output)) and not band_lines, "Checked missing-prerequisite stop and absence of a band."),
            result(forbidden not in raw and forbidden not in output and "BRONZE" not in output, "Checked absence of suborg-only content."),
            result("plant-operations-director" in output and no_question(output) and ("re-segment" in output.lower() or "preserv" in output.lower() or "supplied label" in output.lower()) and not re.search(r"(?i)(?:working|operating|acting)\s+as\s+sam", raw + "\n" + output), "Checked label preservation, lead/operator separation, no question, and no re-segmentation."),
            result(clean[0] and output.rstrip().endswith(EXACT_CLOSE), f"Checked clean state and exact close: {clean[1]}"),
        ]

    raise ValueError(name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    args = parser.parse_args()
    for eval_dir in sorted(args.iteration.glob("eval-*")):
        metadata = json.loads((eval_dir / "eval_metadata.json").read_text())
        for configuration in ("with_skill", "without_skill"):
            run_dir = eval_dir / configuration / "run-1"
            if not (run_dir / "executor_status.json").is_file():
                continue
            checks = checks_for(metadata["eval_name"], run_dir / "sandbox_snapshot", run_dir)
            checks.append(no_dead_model(run_dir))
            texts = list(metadata["assertions"]) + ["No old-model concept appears in execution or output."]
            expectations = [
                {"text": text, "passed": passed, "evidence": evidence}
                for text, (passed, evidence) in zip(texts, checks, strict=True)
            ]
            passed = sum(item["passed"] for item in expectations)
            metrics_path = run_dir / "outputs/metrics.json"
            timing_path = run_dir / "timing.json"
            grading = {
                "expectations": expectations,
                "summary": {
                    "passed": passed,
                    "failed": len(expectations) - passed,
                    "total": len(expectations),
                    "pass_rate": round(passed / len(expectations), 4),
                },
                "execution_metrics": json.loads(metrics_path.read_text()) if metrics_path.exists() else {},
                "timing": json.loads(timing_path.read_text()) if timing_path.exists() else {},
                "claims": [],
                "user_notes_summary": {"uncertainties": [], "needs_review": [], "workarounds": []},
                "eval_feedback": {"suggestions": [], "overall": "Assertions are deterministic and scenario-specific."},
            }
            (run_dir / "grading.json").write_text(json.dumps(grading, indent=2) + "\n")
            print(f"{metadata['eval_name']} {configuration}: {passed}/{len(expectations)}")


if __name__ == "__main__":
    main()
