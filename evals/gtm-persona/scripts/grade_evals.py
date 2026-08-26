#!/usr/bin/env python3
"""Deterministically grade gtm-persona eval artifacts and transcripts."""

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
        r"inherited persona",
        r"state\.json",
        r"canonical position",
        r"altitude decision",
        r"Titles And Responsibilities",
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
        repo = root / "harbor-signal"
        target = repo / "personas/regional-operations-director/PERSONA.md"
        text = target.read_text() if target.is_file() else ""
        turns, _ = conversation_turns(run_dir)
        menu = next((value for role, value in turns if role == "Assistant" and "create" in value.lower() and "doctor" in value.lower()), "")
        repo_choice = next((value for role, value in turns if role == "Assistant" and "Harbor Signal" in value and "Stonebridge Data" in value), "")
        fences = proposal_fences(run_dir, "personas/regional-operations-director/PERSONA.md")
        substantive = all(
            phrase in text.lower()
            for phrase in ("five", "dispatch", "technician", "standard", "service-level", "acquisition", "advisory", "operational authority", "budget", "coo")
        )
        freeform = text.startswith("# Regional Operations Director") and "{{" not in text and not all(
            heading in text
            for heading in ("## Identity", "## Titles And Responsibilities", "## Buying Role", "## Pains And Priorities", "## Evidence And Confidence")
        )
        token_safe = "persona-secret-456" not in assistant and "token=persona-secret-456" not in text and not re.search(r"(?:curl|wget)[^\n]*persona-secret-456", raw, re.I)
        return [
            result(all(term in menu.lower() for term in ("create", "update", "delete", "doctor")) and "import" not in menu.lower() and "clear" not in menu.lower() and bool(repo_choice), "Checked guided menu ownership and two-repo selection turn."),
            result("Using GTM workspace: Harbor Signal — 0 personas visible" in output and "own this persona" not in output.lower(), "Checked root context line and absence of an owner question."),
            result(target.is_file() and substantive, "Checked target path, H1, and every supplied matching/disqualifying/open fact."),
            result(freeform, "Checked freeform flat content, no placeholders, and absence of the complete old fixed schema."),
            result(token_safe, "Checked assistant output, artifact, and commands for suppression of the unsafe token."),
            result(bool(fences) and fences[-1] == text and git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and not git(repo, "status", "--porcelain") and changed_paths(repo) == ["personas/regional-operations-director/PERSONA.md"], "Compared complete preview with saved bytes and checked one clean, scoped main commit."),
            result("saved to history" in output.lower() and re.search(r"\bregional-operations-director\b", output), "Checked saved-history close and bare root label."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "suborg-create-destination":
        repo = root / "solace-cloud"
        target = repo / "suborgs/enterprise/personas/cloud-governance-lead/PERSONA.md"
        text = target.read_text() if target.is_file() else ""
        turns, _ = conversation_turns(run_dir)
        owner = next((value for role, value in turns if role == "Assistant" and "Which organization should own this persona?" in value), "")
        root_first = re.search(r"(?m)^1\.[^\n]*Solace Cloud[^\n]*\(Recommended\)", owner) is not None
        enterprise_listed = re.search(r"(?m)^2\.[^\n]*Solace Enterprise", owner) is not None
        forbidden_root = "self-service adoption" in raw.lower() or "developer velocity" in raw.lower()
        enterprise_grounding = "final security-control sign-off" in raw.lower() or "does not write cross-functional cloud policy" in raw.lower()
        substantive = all(phrase in text.lower() for phrase in ("cross-functional", "cloud policy", "regulated", "security review", "budget", "advisory architect", "policy ownership"))
        fences = proposal_fences(run_dir, "suborgs/enterprise/personas/cloud-governance-lead/PERSONA.md")
        return [
            result(bool(owner) and root_first and enterprise_listed, "Checked exact owner question with root recommended first and Enterprise second."),
            result("Using GTM workspace: Solace Enterprise — 1 persona visible" in output, "Checked Enterprise context line after selection."),
            result(enterprise_grounding and not forbidden_root, "Checked Enterprise-local source content was read and root persona content was absent from the raw execution."),
            result(target.is_file() and text.startswith("# Cloud Governance Lead") and substantive, "Checked Enterprise target path, H1, and all supplied facts."),
            result("Security Assurance Director" not in text and "{{" not in text, "Checked distinct freeform draft without copied adjacent-persona or placeholder content."),
            result(bool(fences) and fences[-1] == text and git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and not git(repo, "status", "--porcelain") and changed_paths(repo) == ["suborgs/enterprise/personas/cloud-governance-lead/PERSONA.md"], "Compared preview bytes and checked a clean scoped commit."),
            result("saved to history" in output.lower() and "enterprise/cloud-governance-lead" in output, "Checked saved-history close and qualified label."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "root-update-node-local":
        repo = root / "solace-cloud"
        target = repo / "personas/founder-led-revenue-leader/PERSONA.md"
        text = target.read_text() if target.is_file() else ""
        fences = proposal_fences(run_dir, "personas/founder-led-revenue-leader/PERSONA.md")
        forbidden_suborg = "one million dollars" in raw.lower() or "formal evidence review" in raw.lower()
        preserved = "does not own procurement approval" in text.lower()
        return [
            result("Using GTM workspace: Solace Cloud — 1 persona visible" in output and "which organization" not in output.lower(), "Checked explicit root target, root context line, and no node question."),
            result("Founder-Led Revenue Leader" in raw and not forbidden_suborg, "Checked root persona use and absence of Enterprise-only content."),
            result(len(fences) >= 2 and "3–8" in fences[0] and "5–12" in fences[-1], "Checked complete before and after Markdown fences."),
            result("5–12" in text and "partner-led pipeline" in text.lower() and "3–8" not in text and preserved, "Checked requested changes and preservation of unrelated facts."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and not git(repo, "status", "--porcelain") and changed_paths(repo) == ["personas/founder-led-revenue-leader/PERSONA.md"] and "saved to history" in output.lower(), "Checked one clean scoped main commit and saved-history close."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "delete-obvious-node":
        repo = root / "northstar-transit"
        target = repo / "suborgs/mobility/personas/transit-innovation-director/PERSONA.md"
        icp = repo / "suborgs/mobility/icps/public-transit-networks/ICP.md"
        return [
            result("Using GTM workspace: Northstar Mobility — 1 persona visible" in output and "which organization" not in output.lower(), "Checked obvious-node default and context line without a node question."),
            result(all(phrase in output.lower() for phrase in ("northstar mobility", "mobility/transit-innovation-director", "definition", "no longer", "available")), "Checked owner, qualified label, and definition-availability consequence language."),
            result("suborgs/mobility/personas/transit-innovation-director/PERSONA.md" in output, "Checked exact deletion path in user-facing proposal."),
            result(not target.exists() and (repo / "ORG.md").is_file() and (repo / "suborgs/mobility/ORG.md").is_file() and icp.is_file() and "scheduled urban networks" in icp.read_text(), "Checked exact persona deletion and preservation of org/ICP artifacts."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and not git(repo, "status", "--porcelain") and changed_paths(repo) == ["suborgs/mobility/personas/transit-innovation-director/PERSONA.md"] and "saved to history" in output.lower() and "recover" in output.lower() and "history" in output.lower(), "Checked one clean deletion commit plus saved-history and recovery close."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "doctor-persona-scope":
        repo = root / "copper-finch"
        icp = repo / "icps/Broken_ICP/ICP.md"
        root_personas = sorted((repo / "personas").glob("*/PERSONA.md")) if (repo / "personas").is_dir() else []
        useful = [path for path in root_personas if "500–5,000" in path.read_text(errors="replace")]
        useful_ok = len(useful) == 1 and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", useful[0].parent.name) and useful[0].read_text().startswith("# Revenue Operations Leader") and "spreadsheet-based forecasting" in useful[0].read_text()
        report_terms = all(term in output.lower() for term in ("archive/personas", "revenue_operations_leader", "h1", "todo", "vague"))
        persona_changes_only = all("icps/" not in path for path in changed_paths(repo))
        return [
            result(report_terms and ("substance" in output.lower() or "match" in output.lower()), "Checked report for all five seeded persona defect classes."),
            result(
                "persona" in output.lower() and "icp" in output.lower() and ("owning skill" in output.lower() or "untouched" in output.lower()),
                "Checked explicit persona-only scope and ICP exclusion.",
            ),
            result(useful_ok and not (repo / "personas/Revenue_Operations_Leader/PERSONA.md").exists(), "Checked preservation of useful facts in one repaired kebab-case H1 persona."),
            result(not (repo / "personas/todo/PERSONA.md").exists() and not (repo / "suborgs/europe/personas/vague/PERSONA.md").exists() and not (repo / "archive/personas/rogue/PERSONA.md").exists(), "Checked removal of husk, non-matchable, and stray persona artifacts."),
            result(icp.is_file() and icp.read_text() == "TODO ICP details\n", "Compared malformed ICP bytes with the fixture."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and git(repo, "log", "-1", "--pretty=%s") == "Repair Persona artifacts" and not git(repo, "status", "--porcelain") and persona_changes_only, "Checked exact one-commit repair on main with persona-only changed paths."),
            result("healthy" in output.lower() and "saved to history" in output.lower(), "Checked healthy rerun and saved-history close."),
            result(*interaction),
            result(*no_dead_model(run_dir, repo)),
        ]

    if name == "icp-near-miss-boundary":
        repo = root / "boundary-labs"
        icps = sorted(path.relative_to(repo).as_posix() for path in repo.glob("icps/*/ICP.md"))
        personas = sorted(path.relative_to(repo).as_posix() for path in repo.glob("personas/*/PERSONA.md"))
        return [
            result("ICP" in output and "gtm-icp" in output.lower() and "buyer and stakeholder personas?" not in output.lower(), "Checked explicit ICP ownership and sibling handoff without the persona menu."),
            result(icps == ["icps/regional-distributors/ICP.md"] and personas == ["personas/procurement-director/PERSONA.md"], "Inventoried both artifact directories and found no lifecycle mutation."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1 and not git(repo, "status", "--porcelain"), "Checked clean main and the unchanged seed history."),
            result("owns vendor selection" not in raw.lower() and "budget approval" not in assistant.lower(), "Checked that seeded persona content was not read, quoted, or used in the handoff."),
        ]

    if name == "hosted-save-unavailable":
        repo = root / "boundary-labs"
        target = repo / "personas/procurement-director.md"
        text = target.read_text() if target.is_file() else ""
        fences = proposal_fences(run_dir, "personas/procurement-director.md")
        recovery_ok, recovery_evidence = direct_interaction_ok(run_dir)
        turns, _ = conversation_turns(run_dir)
        recovery = next((value for role, value in turns if role == "Assistant" and "CLI" in value and "durabl" in value.lower()), "")
        return [
            result(len(fences) >= 2 and "vendor security review" not in fences[0].lower() and "vendor security review" in fences[-1].lower(), "Checked complete before/after proposal for the one requested responsibility."),
            result(("durabl" in output.lower() and any(term in output.lower() for term in ("unavailable", "cannot", "could not"))) and not re.search(r"(?<!cannot be )(?<!not )\bsaved to history\b", output, re.I) and not re.search(r"\b(?:was|is|has been|successfully)\s+(?:saved|committed)\b", output, re.I), "Checked plain save-failure explanation and absence of a success claim."),
            result(recovery_ok and "(Recommended)" in recovery and recovery.rstrip().endswith("Reply with a number, or type your answer."), recovery_evidence),
            result("vendor security review" not in text.lower() and git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1 and not git(repo, "status", "--porcelain"), "Compared target content and checked clean one-entry seed history."),
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
