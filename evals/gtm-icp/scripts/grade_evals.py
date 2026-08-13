#!/usr/bin/env python3
"""Deterministically grade gtm-icp eval artifacts and transcripts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else ""


def user_output(run_dir: Path) -> str:
    outputs = run_dir / "outputs"
    return "\n".join(
        path.read_text(errors="replace")
        for path in (outputs / "conversation.md", outputs / "final.md")
        if path.is_file()
    )


def assistant_output(run_dir: Path) -> str:
    turns, _ = conversation_turns(run_dir)
    final = run_dir / "outputs" / "final.md"
    values = [text for role, text in turns if role == "Assistant"]
    if final.is_file():
        values.append(final.read_text(errors="replace"))
    return "\n".join(values)


def conversation_turns(run_dir: Path) -> tuple[list[tuple[str, str]], bool]:
    path = run_dir / "outputs" / "conversation.md"
    if not path.is_file():
        return [], False
    text = path.read_text(errors="replace")
    headings = list(re.finditer(r"(?m)^## (Assistant|User)$", text))
    turns = [
        (
            match.group(1),
            text[match.end() : headings[index + 1].start() if index + 1 < len(headings) else len(text)].strip(),
        )
        for index, match in enumerate(headings)
    ]
    alternating = bool(turns) and all(left[0] != right[0] for left, right in zip(turns, turns[1:]))
    return turns, alternating


def executor_items(run_dir: Path) -> list[dict]:
    transcript = run_dir / "transcript.md"
    if not transcript.is_file():
        return []
    items = []
    for line in transcript.read_text(errors="replace").splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        item = event.get("item", {})
        if event.get("type") == "item.completed" and isinstance(item, dict):
            items.append(item)
    return items


def direct_interaction_ok(run_dir: Path) -> tuple[bool, str]:
    turns, alternating = conversation_turns(run_dir)
    problems = []
    assistant_turns = [text for role, text in turns if role == "Assistant"]
    for index, text in enumerate(assistant_turns, start=1):
        nonempty = [line.strip() for line in text.splitlines() if line.strip()]
        bold_questions = [
            line for line in nonempty if re.fullmatch(r"\*\*[^*\n]+\?\*\*", line)
        ]
        if "?" in text and (len(bold_questions) != 1 or not nonempty or nonempty[0] != bold_questions[0]):
            problems.append(f"assistant turn {index} does not directly render exactly one bold question first")
        numbered = [line for line in nonempty if re.match(r"^\d+\.\s", line)]
        if numbered:
            if not text.rstrip().endswith("Reply with a number, or type your answer."):
                problems.append(f"assistant turn {index} lacks the exact reply line")
            recommended = [line for line in numbered if "(Recommended)" in line]
            if len(recommended) > 1 or (recommended and not recommended[0].startswith("1.")):
                problems.append(f"assistant turn {index} has invalid recommendation placement")
    ask_tool = any(
        item.get("type") == "mcp_tool_call"
        and re.search(r"ask_?user_?question", json.dumps(item), re.I)
        for item in executor_items(run_dir)
    )
    if ask_tool:
        problems.append("AskUserQuestion was used")
    return alternating and not problems, f"alternating={alternating}; problems={problems!r}"


def no_dead_model(run_dir: Path, repo: Path) -> tuple[bool, str]:
    text = user_output(run_dir)
    text += "\n" + "\n".join(
        path.read_text(errors="replace")
        for path in repo.rglob("*.md")
        if ".git" not in path.parts
    )
    patterns = (
        r"Working in .+ as ",
        r"git identity",
        r"nearest[- ]wins",
        r"inherited ICP",
        r"state\.json",
        r"Status:\s*(?:draft|working definition)",
        r"Evidence And Confidence",
    )
    hits = [pattern for pattern in patterns if re.search(pattern, text, re.I)]
    return not hits, f"dead-model pattern hits={hits!r}"


def proposal_fences(run_dir: Path, path_marker: str) -> list[str]:
    turns, _ = conversation_turns(run_dir)
    values = []
    for role, text in turns:
        if role != "Assistant" or path_marker not in text:
            continue
        values.extend(re.findall(r"```(?:markdown)?\s*\n(.*?)```", text, re.S))
    return [value.rstrip() + "\n" for value in values]


def changed_paths(repo: Path) -> list[str]:
    return [line for line in git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").splitlines() if line]


def result(ok: bool, evidence: str) -> tuple[bool, str]:
    return bool(ok), evidence


def checks_for(name: str, snapshot: Path, run_dir: Path) -> list[tuple[bool, str]]:
    root = snapshot / ".gtm"
    output = user_output(run_dir)
    assistant = assistant_output(run_dir)
    raw = (run_dir / "transcript.md").read_text(errors="replace") if (run_dir / "transcript.md").is_file() else ""
    interaction = direct_interaction_ok(run_dir)

    if name == "guided-root-create":
        repo = root / "beacon-yards"
        target = repo / "icps/regional-field-service-operators/ICP.md"
        text = target.read_text() if target.is_file() else ""
        turns, _ = conversation_turns(run_dir)
        menu = next((value for role, value in turns if role == "Assistant" and "create" in value.lower() and "doctor" in value.lower()), "")
        repo_choice = next((value for role, value in turns if role == "Assistant" and "Beacon Yards" in value and "Orbit Craft" in value), "")
        fences = proposal_fences(run_dir, "icps/regional-field-service-operators/ICP.md")
        substantive = all(
            phrase in text.lower()
            for phrase in ("25", "150", "fragment", "consolidat", "one technician", "budget", "dispatch handoff", "missed appointment")
        )
        freeform = text.startswith("# Regional Field Service Operators") and "{{" not in text and not all(
            heading in text
            for heading in ("## Identity", "## Account Profile", "## Fit Signals", "## Buying Context", "## Evidence And Confidence")
        )
        token_safe = "secret-123" not in assistant and "token=secret-123" not in text and not re.search(r"(?:curl|wget)[^\n]*secret-123", raw, re.I)
        return [
            result(all(term in menu.lower() for term in ("create", "update", "delete", "doctor")) and "import" not in menu.lower() and "clear" not in menu.lower() and bool(repo_choice), "Checked guided menu ownership and two-repo selection turn."),
            result("Using GTM workspace: Beacon Yards — 0 ICPs visible" in output and "own this ICP" not in output, "Checked root context line and absence of an owner question."),
            result(target.is_file() and substantive, "Checked target path, H1, and every supplied matching/disqualifying/open fact."),
            result(freeform, "Checked freeform flat content, no placeholders, and absence of the complete old fixed schema."),
            result(token_safe, "Checked assistant output, artifact, and commands for suppression of the unsafe token."),
            result(bool(fences) and fences[-1] == text and git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and not git(repo, "status", "--porcelain") and changed_paths(repo) == ["icps/regional-field-service-operators/ICP.md"], "Compared complete preview with saved bytes and checked one clean, scoped main commit."),
            result("saved to history" in output.lower() and re.search(r"\bregional-field-service-operators\b", output), "Checked saved-history close and bare root label."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "suborg-create-destination":
        repo = root / "nimbus-labs"
        target = repo / "suborgs/enterprise/icps/national-insurers/ICP.md"
        text = target.read_text() if target.is_file() else ""
        turns, _ = conversation_turns(run_dir)
        owner = next((value for role, value in turns if role == "Assistant" and "Which organization should own this ICP?" in value), "")
        root_first = re.search(r"(?m)^1\.[^\n]*Nimbus Labs[^\n]*\(Recommended\)", owner) is not None
        enterprise_listed = re.search(r"(?m)^2\.[^\n]*Nimbus Enterprise", owner) is not None
        forbidden_root = "product-led adoption" in raw.lower()
        enterprise_grounding = "security review is mandatory" in raw.lower()
        substantive = all(phrase in text.lower() for phrase in ("1,000", "insurance", "regulated data", "modernization", "prohibit cloud"))
        fences = proposal_fences(run_dir, "suborgs/enterprise/icps/national-insurers/ICP.md")
        return [
            result(bool(owner) and root_first and enterprise_listed, "Checked exact owner question with root recommended first and Enterprise second."),
            result("Using GTM workspace: Nimbus Enterprise — 1 ICP visible" in output, "Checked Enterprise context line after selection."),
            result(enterprise_grounding and not forbidden_root, "Checked Enterprise-local source content was read and root ICP content was absent from the raw execution."),
            result(target.is_file() and text.startswith("# National Insurers") and substantive, "Checked Enterprise target path, H1, and all supplied facts."),
            result("Regulated Platforms" not in text and "{{" not in text, "Checked distinct freeform draft without copied adjacent-ICP or placeholder content."),
            result(bool(fences) and fences[-1] == text and git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and not git(repo, "status", "--porcelain") and changed_paths(repo) == ["suborgs/enterprise/icps/national-insurers/ICP.md"], "Compared preview bytes and checked a clean scoped commit."),
            result("saved to history" in output.lower() and "enterprise/national-insurers" in output, "Checked saved-history close and qualified label."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "root-update-node-local":
        repo = root / "nimbus-labs"
        target = repo / "icps/developer-tools-startups/ICP.md"
        text = target.read_text() if target.is_file() else ""
        fences = proposal_fences(run_dir, "icps/developer-tools-startups/ICP.md")
        forbidden_suborg = "5,000+ employees" in raw.lower() or "formal security review" in raw.lower()
        preserved = "engineering team owns cloud operations" in text.lower() and "no internal engineering capacity" in text.lower()
        return [
            result("Using GTM workspace: Nimbus Labs — 1 ICP visible" in output and "which organization" not in output.lower(), "Checked explicit root target, root context line, and no node question."),
            result("Developer Tools Startups" in raw and not forbidden_suborg, "Checked root ICP use and absence of Enterprise-only content."),
            result(len(fences) >= 2 and "20–200" in fences[0] and "30–250" in fences[-1], "Checked complete before and after Markdown fences."),
            result("30–250" in text and "product-led" in text.lower() and "20–200" not in text and preserved, "Checked requested changes and preservation of unrelated facts."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and not git(repo, "status", "--porcelain") and changed_paths(repo) == ["icps/developer-tools-startups/ICP.md"] and "saved to history" in output.lower(), "Checked one clean scoped main commit and saved-history close."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "delete-obvious-node":
        repo = root / "arbor-systems"
        target = repo / "suborgs/mobility/icps/public-transit-agencies/ICP.md"
        persona = repo / "suborgs/mobility/personas/transit-planning-director/PERSONA.md"
        return [
            result("Using GTM workspace: Arbor Mobility — 1 ICP visible" in output and "which organization" not in output.lower(), "Checked obvious-node default and context line without a node question."),
            result(all(phrase in output.lower() for phrase in ("arbor mobility", "mobility/public-transit-agencies", "definition", "no longer", "available")), "Checked owner, qualified label, and definition-availability consequence language."),
            result("suborgs/mobility/icps/public-transit-agencies/ICP.md" in output, "Checked exact deletion path in user-facing proposal."),
            result(not target.exists() and (repo / "ORG.md").is_file() and (repo / "suborgs/mobility/ORG.md").is_file() and persona.is_file() and "Owns network planning" in persona.read_text(), "Checked exact ICP deletion and preservation of org/persona artifacts."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and not git(repo, "status", "--porcelain") and changed_paths(repo) == ["suborgs/mobility/icps/public-transit-agencies/ICP.md"] and "saved to history" in output.lower() and "recover" in output.lower() and "history" in output.lower(), "Checked one clean deletion commit plus saved-history and recovery close."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "doctor-icp-scope":
        repo = root / "kestrel-works"
        persona = repo / "personas/Broken_Persona/PERSONA.md"
        root_icps = sorted((repo / "icps").glob("*/ICP.md")) if (repo / "icps").is_dir() else []
        useful = [path for path in root_icps if "500–5,000" in path.read_text(errors="replace")]
        useful_ok = len(useful) == 1 and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", useful[0].parent.name) and useful[0].read_text().startswith("# ") and "paper-based quality" in useful[0].read_text()
        report_terms = all(term in output.lower() for term in ("archive/icps", "bad_slug", "h1", "todo", "vague"))
        icp_changes_only = all("personas/" not in path for path in changed_paths(repo))
        return [
            result(report_terms and ("substance" in output.lower() or "match" in output.lower()), "Checked report for all five seeded ICP defect classes."),
            result(
                "persona" in output.lower()
                and "icp" in output.lower()
                and ("outside" in output.lower() or ("non-icp" in output.lower() and "untouched" in output.lower())),
                "Checked explicit ICP-only scope and persona exclusion.",
            ),
            result(useful_ok and not (repo / "icps/Bad_Slug/ICP.md").exists(), "Checked preservation of useful facts in one repaired kebab-case H1 ICP."),
            result(not (repo / "icps/todo/ICP.md").exists() and not (repo / "suborgs/europe/icps/vague/ICP.md").exists() and not (repo / "archive/icps/rogue/ICP.md").exists(), "Checked removal of husk, non-matchable, and stray ICP artifacts."),
            result(persona.is_file() and persona.read_text() == "TODO persona details\n", "Compared malformed persona bytes with the fixture."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and git(repo, "log", "-1", "--pretty=%s") == "Repair ICP artifacts" and not git(repo, "status", "--porcelain") and icp_changes_only, "Checked exact one-commit repair on main with ICP-only changed paths."),
            result(("healthy" in output.lower() or "verified" in output.lower()) and "saved" in output.lower() and "history" in output.lower(), "Checked verified healthy rerun and saved-history close."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "persona-near-miss-boundary":
        repo = root / "boundary-labs"
        icps = sorted(path.relative_to(repo).as_posix() for path in repo.glob("icps/*/ICP.md"))
        personas = sorted(path.relative_to(repo).as_posix() for path in repo.glob("personas/*/PERSONA.md"))
        return [
            result("persona" in output.lower() and "gtm-persona" in output.lower() and "ideal customer profiles?" not in output.lower(), "Checked explicit persona ownership and sibling handoff without the ICP menu."),
            result(icps == ["icps/mid-market-manufacturers/ICP.md"] and personas == ["personas/operations-leader/PERSONA.md"], "Inventoried both artifact directories and found no lifecycle mutation."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1 and not git(repo, "status", "--porcelain"), "Checked clean main and the unchanged seed history."),
            result("100–500" not in raw and "internal implementation owner" not in assistant, "Checked that seeded ICP content was not read, quoted, or used in the handoff."),
        ]

    if name == "hosted-save-unavailable":
        repo = root / "boundary-labs"
        target = repo / "icps/mid-market-manufacturers.md"
        text = target.read_text() if target.is_file() else ""
        fences = proposal_fences(run_dir, "icps/mid-market-manufacturers.md")
        recovery_ok, recovery_evidence = direct_interaction_ok(run_dir)
        turns, _ = conversation_turns(run_dir)
        recovery = next((value for role, value in turns if role == "Assistant" and "CLI" in value and "durable" in value.lower()), "")
        return [
            result(len(fences) >= 2 and "100–500" in fences[0] and "150–500" in fences[-1] and "100–500" not in fences[-1], "Checked complete before/after proposal for the one requested threshold change."),
            result(("durable" in output.lower() and any(term in output.lower() for term in ("unavailable", "cannot", "could not"))) and not re.search(r"(?<!cannot be )(?<!not )\bsaved to history\b", output, re.I) and not re.search(r"\b(?:was|is|has been|successfully)\s+(?:saved|committed)\b", output, re.I), "Checked plain save-failure explanation and absence of a success claim."),
            result(recovery_ok and "(Recommended)" in recovery and recovery.rstrip().endswith("Reply with a number, or type your answer."), recovery_evidence),
            result("100–500" in text and "150–500" not in text and git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1 and not git(repo, "status", "--porcelain"), "Compared target content and checked clean one-entry seed history."),
            result(not git(repo, "remote") and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1 and "push" not in assistant.lower(), "Checked no remote addition, commit, push, or repair."),
        ]
    raise ValueError(name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("iteration", type=Path)
    args = parser.parse_args()
    for eval_dir in sorted(args.iteration.glob("eval-*")):
        metadata = json.loads((eval_dir / "eval_metadata.json").read_text())
        for configuration in ("with_skill", "baseline_skill", "without_skill"):
            run_dir = eval_dir / configuration / "run-1"
            if not (run_dir / "executor_status.json").is_file():
                continue
            checks = checks_for(metadata["eval_name"], run_dir / "sandbox_snapshot", run_dir)
            expectations = [
                {"text": text, "passed": passed, "evidence": evidence}
                for text, (passed, evidence) in zip(metadata["assertions"], checks, strict=True)
            ]
            passed = sum(item["passed"] for item in expectations)
            metrics_path = run_dir / "outputs" / "metrics.json"
            timing_path = run_dir / "timing.json"
            grading = {
                "expectations": expectations,
                "summary": {"passed": passed, "failed": len(expectations) - passed, "total": len(expectations), "pass_rate": round(passed / len(expectations), 4)},
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
