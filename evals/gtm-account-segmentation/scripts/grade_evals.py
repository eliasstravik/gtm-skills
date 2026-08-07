#!/usr/bin/env python3
"""Deterministically grade account-segmentation eval artifacts and transcripts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess


EXACT_CLOSE = "No files, git history, or external systems changed."
FIELDS = ("Account", "Label", "Reasoning", "Confidence", "Needs review", "Open questions")


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


def has_fields(text: str, accounts: int = 1) -> bool:
    return all(len(re.findall(rf"(?im)^\s*(?:[-*]\s*)?\**{re.escape(field)}\**\s*:", text)) >= accounts for field in FIELDS)


def assigned(text: str, label: str) -> bool:
    return re.search(rf"(?im)^\s*(?:[-*]\s*)?\**Label\**\s*:\s*`?{re.escape(label)}`?\s*$", text) is not None


def no_dead_model(run_dir: Path) -> tuple[bool, str]:
    text = final_text(run_dir) + "\n" + transcript_text(run_dir)
    patterns = (
        r"Working in .+ as ",
        r"git identity",
        r"nearest[- ]wins",
        r"inherited ICP",
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

    if name == "root-single-match":
        clean = clean_seed(snapshot, "atlas-grid")
        return [
            result("Using GTM context: Atlas Grid — 2 ICPs visible" in output, "Checked exact root context line."),
            result(assigned(output, "regional-utilities") and not assigned(output, "industrial-energy-operators") and not assigned(output, "no-match"), "Checked the single Label field."),
            result("industrial-energy-operators" in output and all(term in output.lower() for term in ("electric utilities", "200", "2,000", "grid operations")), "Checked winning ICP language and the named losing alternative."),
            result(has_fields(output) and re.search(r"(?im)^\s*(?:[-*]\s*)?\**Confidence\**\s*:\s*(?:high|medium|low)\s*$", output) is not None, "Checked compact fields and confidence vocabulary."),
            result(no_question(output) and not re.search(r"https?://|web search|enrich", output, re.I) and clean[0], f"Checked no question/enrichment and clean state: {clean[1]}"),
            result(output.rstrip().endswith(EXACT_CLOSE), "Checked exact terminal close."),
        ]

    if name == "suborg-bulk-node-local":
        clean = clean_seed(snapshot, "northstar-cloud")
        labels = ("enterprise/regulated-financial-platforms", "enterprise/national-insurers", "no-match")
        forbidden = "ORCHID ROOT PHRASE"
        return [
            result("Using GTM context: Northstar Enterprise — 2 ICPs visible" in output, "Checked exact Enterprise context line."),
            result(all(assigned(output, label) for label in labels) and len(re.findall(r"(?im)^\s*(?:[-*]\s*)?\**Label\**\s*:", output)) == 3, "Checked three exact Label fields."),
            result(all(term in output.lower() for term in ("counts by label", "low-confidence count", "review-needed count")) and all(re.search(rf"(?i){re.escape(label)}[^\n]*\b1\b", output) for label in labels), "Checked bulk opening and label counts."),
            result(all(term in output.lower() for term in ("mandatory third-party security review", "claims infrastructure", "residential solar installers")) and ("losing alternative" in output.lower() or ("plausible alternative" in output.lower() and "loses" in output.lower())), "Checked ICP-language grounding, alternatives, and disqualifier."),
            result(forbidden not in raw and forbidden not in output and "developer-tools-startups" not in output, "Checked absence of root-only content in transcript and output."),
            result(has_fields(output, accounts=3) and no_question(output) and output.rstrip().endswith(EXACT_CLOSE), "Checked every compact field, no question, and exact close."),
            result(clean[0], clean[1]),
        ]

    if name == "root-target-reverse-visibility":
        clean = clean_seed(snapshot, "northstar-cloud")
        forbidden = ("COBALT ENTERPRISE PHRASE", "MAGENTA INSURER PHRASE")
        return [
            result("Using GTM context: Northstar Cloud — 1 ICP visible" in output, "Checked exact root context line."),
            result(assigned(output, "developer-tools-startups"), "Checked bare root label."),
            result(all(term in output.lower() for term in ("product-led", "20", "200", "engineering-owned cloud stack")) and not any(term in raw or term in output for term in forbidden) and "enterprise/" not in output, "Checked root grounding and reverse visibility."),
            result(has_fields(output) and no_question(output), "Checked compact fields and no question."),
            result(clean[0] and output.rstrip().endswith(EXACT_CLOSE), f"Checked clean state and exact close: {clean[1]}"),
        ]

    if name == "obvious-suborg-node":
        clean = clean_seed(snapshot, "arbor-transit")
        return [
            result("Using GTM context: Arbor Mobility — 1 ICP visible" in output and no_question(output), "Checked obvious-node selection and no question."),
            result(assigned(output, "mobility/public-transit-agencies"), "Checked qualified suborg label."),
            result(all(term in output.lower() for term in ("public transit agencies", "bus or rail", "500", "network-planning modernization")) and ("no other visible" in output.lower() or "only visible" in output.lower()), "Checked ICP grounding and absence of an alternative."),
            result(has_fields(output) and output.rstrip().endswith(EXACT_CLOSE), "Checked compact fields and exact close."),
            result(clean[0], clean[1]),
        ]

    if name == "empty-visible-set":
        clean = clean_seed(snapshot, "empty-harbor")
        forbidden = "BRONZE SUBORG PHRASE"
        label_lines = re.findall(r"(?im)^\s*(?:[-*]\s*)?\**Label\**\s*:", output)
        return [
            result("Using GTM context: Empty Harbor — 0 ICPs visible" in output, "Checked exact zero-visible context line."),
            result(("no visible ICP" in output or "does not have any visible ICP" in output or ("cannot proceed until" in output and "has an ICP" in output)) and not label_lines, "Checked missing-prerequisite stop and absence of classification."),
            result(forbidden not in raw and forbidden not in output and "component-manufacturers" not in output, "Checked absence of suborg-only content."),
            result(no_question(output) and "no-match" not in output.lower() and not re.search(r"create|invent|assume an ICP", output, re.I), "Checked no question or invented label."),
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
