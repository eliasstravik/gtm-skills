#!/usr/bin/env python3
"""Deterministically grade gtm-icp eval artifacts and transcripts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess


REPLY_LINE = "Reply with a number, or type your answer."
SAVE_OPENER = "**Save this?**"
SAVE_CLOSING = "Approve to save, or Cancel and tell me what to change."
BOLD_QUESTION = re.compile(r"\*\*[^*\n]+\?\*\*")
NUMBERED = re.compile(r"^\d+\.\s")
BANNED_WORDS = re.compile(
    r"\b(?:git|github|commit|commits|committed|committing|push|pushed|pull request|branch|hash|sha|manifest)\b"
    r"|saved to history",
    re.I,
)
BANNED_PATHS = re.compile(r"(?:^|[\s`(\"'])(?:icps|personas|members|suborgs)/|\S+\.md\b|~/\.gtm/")
VISIBLE_COUNT = re.compile(r"— \d+ (?:ICPs?|personas?) visible")


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


def assistant_turns(run_dir: Path) -> list[str]:
    turns, _ = conversation_turns(run_dir)
    values = [text for role, text in turns if role == "Assistant"]
    final = run_dir / "outputs" / "final.md"
    if final.is_file():
        values.append(final.read_text(errors="replace"))
    return values


def assistant_output(run_dir: Path) -> str:
    return "\n".join(assistant_turns(run_dir))


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


def message_shape_problems(text: str, index: int) -> list[str]:
    """Apply the shared interaction standard's question shape to one assistant turn."""
    nonempty = [line.strip() for line in text.splitlines() if line.strip()]
    problems: list[str] = []
    bold_questions = [line for line in nonempty if BOLD_QUESTION.fullmatch(line)]
    if "?" in text and (len(bold_questions) != 1 or not nonempty or nonempty[0] != bold_questions[0]):
        problems.append(f"assistant turn {index} does not render exactly one bold lead question first")
    numbered_positions = [position for position, line in enumerate(nonempty) if NUMBERED.match(line)]
    if numbered_positions:
        if numbered_positions != list(range(numbered_positions[0], numbered_positions[-1] + 1)):
            problems.append(f"assistant turn {index} has more than one numbered block")
        if not text.rstrip().endswith(REPLY_LINE):
            problems.append(f"assistant turn {index} lacks the exact reply line")
        recommended = [nonempty[position] for position in numbered_positions if "(Recommended)" in nonempty[position]]
        if len(recommended) > 1 or (recommended and not recommended[0].startswith("1.")):
            problems.append(f"assistant turn {index} has invalid recommendation placement")
    elif REPLY_LINE in text:
        problems.append(f"assistant turn {index} carries the reply line without a numbered block")
    return problems


def grouped_interaction_ok(run_dir: Path) -> tuple[bool, str]:
    turns, alternating = conversation_turns(run_dir)
    problems: list[str] = []
    for index, text in enumerate((text for role, text in turns if role == "Assistant"), start=1):
        problems.extend(message_shape_problems(text, index))
    ask_tool = any(
        item.get("type") == "mcp_tool_call" and re.search(r"ask_?user_?question", json.dumps(item), re.I)
        for item in executor_items(run_dir)
    )
    if ask_tool:
        problems.append("AskUserQuestion was used")
    return alternating and not problems, f"alternating={alternating}; problems={problems!r}"


def banned_language(run_dir: Path, *, paths: bool = True, extra: tuple[str, ...] = ()) -> tuple[bool, str]:
    hits: list[str] = []
    for index, text in enumerate(assistant_turns(run_dir), start=1):
        for match in BANNED_WORDS.finditer(text):
            hits.append(f"turn {index}: {match.group(0)!r}")
        if paths:
            for match in BANNED_PATHS.finditer(text):
                hits.append(f"turn {index}: path {match.group(0).strip()!r}")
        for match in VISIBLE_COUNT.finditer(text):
            hits.append(f"turn {index}: {match.group(0)!r}")
        for needle in extra:
            if needle in text:
                hits.append(f"turn {index}: {needle!r}")
    return not hits, f"banned-language hits={hits[:12]!r}"


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


def language_and_dead_model(run_dir: Path, repo: Path, *, paths: bool = True, extra: tuple[str, ...] = ()) -> tuple[bool, str]:
    language_ok, language_evidence = banned_language(run_dir, paths=paths, extra=extra)
    dead_ok, dead_evidence = no_dead_model(run_dir, repo)
    return language_ok and dead_ok, f"{language_evidence}; {dead_evidence}"


def proposal_turns(run_dir: Path) -> list[str]:
    turns, _ = conversation_turns(run_dir)
    return [text for role, text in turns if role == "Assistant" and text.lstrip().startswith(SAVE_OPENER)]


def context_line_under_opener(text: str, root_name: str) -> bool:
    nonempty = [line.strip() for line in text.splitlines() if line.strip()]
    return len(nonempty) >= 2 and nonempty[0] == SAVE_OPENER and nonempty[1] == f"Using GTM workspace: {root_name}"


def fenced(text: str) -> bool:
    return "```" in text


def closes_saved(run_dir: Path) -> bool:
    final = run_dir / "outputs" / "final.md"
    text = final.read_text(errors="replace").rstrip() if final.is_file() else ""
    if not text:
        turns = assistant_turns(run_dir)
        text = turns[-1].rstrip() if turns else ""
    return text.endswith("Saved.")


def bold_questions(run_dir: Path) -> list[str]:
    return [
        line.strip()
        for text in assistant_turns(run_dir)
        for line in text.splitlines()
        if BOLD_QUESTION.fullmatch(line.strip())
    ]


def grouped_intake_turns(run_dir: Path) -> list[str]:
    """Question-bearing turns that are not the guided menu, repo choice, or proposal."""
    values = []
    for text in assistant_turns(run_dir):
        nonempty = [line.strip() for line in text.splitlines() if line.strip()]
        if not nonempty or not BOLD_QUESTION.fullmatch(nonempty[0]):
            continue
        lead = nonempty[0].lower()
        if "what would you like to do" in lead or "which gtm workspace" in lead or nonempty[0] == SAVE_OPENER:
            continue
        values.append(text)
    return values


def has_bullets(text: str) -> bool:
    return any(line.strip().startswith(("- ", "* ")) for line in text.splitlines())


def approvals(snapshot: Path) -> list[dict]:
    path = snapshot / ".gtm-eval" / "approvals.jsonl"
    if not path.is_file():
        return []
    records = []
    for line in path.read_text(errors="replace").splitlines():
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def plain_text(summary: str) -> bool:
    lines = [line.strip() for line in summary.splitlines() if line.strip()]
    return (
        "**" not in summary
        and "```" not in summary
        and not any(line.startswith("#") for line in lines)
        and not any(NUMBERED.match(line) for line in lines)
        and "|" not in summary
        and "->" not in summary
        and "→" not in summary
    )


def changed_paths(repo: Path) -> list[str]:
    return [line for line in git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").splitlines() if line]


def clean_main(repo: Path, commits: int) -> bool:
    return (
        git(repo, "branch", "--show-current") == "main"
        and int(git(repo, "rev-list", "--count", "HEAD") or 0) == commits
        and not git(repo, "status", "--porcelain")
    )


def result(ok: bool, evidence: str) -> tuple[bool, str]:
    return bool(ok), evidence


def checks_for(name: str, snapshot: Path, run_dir: Path) -> list[tuple[bool, str]]:
    root = snapshot / ".gtm"
    output = user_output(run_dir)
    assistant = assistant_output(run_dir)
    raw = (run_dir / "transcript.md").read_text(errors="replace") if (run_dir / "transcript.md").is_file() else ""
    interaction = grouped_interaction_ok(run_dir)
    proposals = proposal_turns(run_dir)
    proposal = proposals[-1] if proposals else ""

    if name == "guided-root-create":
        repo = root / "beacon-yards"
        target = repo / "icps/regional-field-service-operators/ICP.md"
        text = target.read_text() if target.is_file() else ""
        turns, _ = conversation_turns(run_dir)
        menu = next((value for role, value in turns if role == "Assistant" and "create" in value.lower() and "doctor" in value.lower()), "")
        repo_choice = next((value for role, value in turns if role == "Assistant" and "Beacon Yards" in value and "Orbit Craft" in value), "")
        intake = grouped_intake_turns(run_dir)
        substantive = all(
            phrase in text.lower()
            for phrase in ("25", "150", "fragment", "consolidat", "one technician", "budget", "dispatch handoff", "missed appointment")
        )
        freeform = text.startswith("# Regional Field Service Operators") and "{{" not in text and not all(
            heading in text
            for heading in ("## Identity", "## Account Profile", "## Fit Signals", "## Buying Context", "## Evidence And Confidence")
        )
        token_safe = "secret-123" not in assistant and "token=secret-123" not in text and not re.search(r"(?:curl|wget)[^\n]*secret-123", raw, re.I)
        identity = "Regional Field Service Operators (Beacon Yards)"
        return [
            result(all(term in menu.lower() for term in ("create", "update", "delete", "doctor")) and not any(term in menu.lower() for term in ("import", "clear", "suggest", "brainstorm")) and bool(repo_choice), "Checked guided menu ownership and two-repo selection turn."),
            result(len(intake) == 1 and has_bullets(intake[0]) and "own this icp" not in output.lower(), f"Checked one grouped intake with bulleted facts and no owner question; intake turns={len(intake)}."),
            result(target.is_file() and substantive, "Checked target path, H1, and every supplied matching/disqualifying/open fact."),
            result(freeform, "Checked freeform flat content, no placeholders, and absence of the complete old fixed schema."),
            result(token_safe, "Checked assistant output, artifact, and commands for suppression of the unsafe token."),
            result(len(proposals) == 1 and context_line_under_opener(proposal, "Beacon Yards") and identity in proposal and "technician" in proposal.lower() and not fenced(assistant), "Checked the keyboard proposal opener, context line, identity, criteria, and absence of fenced content."),
            result(clean_main(repo, 2) and changed_paths(repo) == ["icps/regional-field-service-operators/ICP.md"] and identity in assistant_turns(run_dir)[-1] and closes_saved(run_dir), "Checked one clean scoped main commit and the identity plus `Saved.` close."),
            result(*interaction),
            result(*language_and_dead_model(run_dir, repo, extra=("regional-field-service-operators",))),
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
        identity = "National Insurers (Nimbus Labs › Nimbus Enterprise)"
        return [
            result(bool(owner) and root_first and enterprise_listed, "Checked exact owner question with root recommended first and Enterprise second."),
            result(len(proposals) == 1 and context_line_under_opener(proposal, "Nimbus Labs") and identity in proposal, "Checked the keyboard proposal opener, root context line, and owner-chain identity."),
            result(enterprise_grounding and not forbidden_root, "Checked Enterprise-local source content was read and root ICP content was absent from the raw execution."),
            result(target.is_file() and text.startswith("# National Insurers") and substantive, "Checked Enterprise target path, H1, and all supplied facts."),
            result("Regulated Platforms" not in text and "{{" not in text, "Checked distinct freeform draft without copied adjacent-ICP or placeholder content."),
            result(not fenced(assistant) and clean_main(repo, 2) and changed_paths(repo) == ["suborgs/enterprise/icps/national-insurers/ICP.md"], "Checked no fenced content and a clean scoped commit."),
            result(identity in assistant_turns(run_dir)[-1] and closes_saved(run_dir) and "enterprise/national-insurers" not in assistant, "Checked the identity plus `Saved.` close and absence of the qualified label."),
            result(*interaction),
            result(*language_and_dead_model(run_dir, repo)),
        ]

    if name == "root-update-node-local":
        repo = root / "nimbus-labs"
        target = repo / "icps/developer-tools-startups/ICP.md"
        text = target.read_text() if target.is_file() else ""
        forbidden_suborg = "5,000+ employees" in raw.lower() or "formal security review" in raw.lower()
        preserved = "engineering team owns cloud operations" in text.lower() and "no internal engineering capacity" in text.lower()
        was_now = re.search(r"was 20[–-]200.{0,40}now 30[–-]250", proposal, re.S) is not None
        identity = "Developer Tools Startups (Nimbus Labs)"
        return [
            result(len(proposals) == 1 and context_line_under_opener(proposal, "Nimbus Labs") and "which organization" not in output.lower(), "Checked explicit root target, root context line under the opener, and no node question."),
            result("Developer Tools Startups" in raw and not forbidden_suborg, "Checked root ICP use and absence of Enterprise-only content."),
            result(was_now and "product-led" in proposal.lower() and not fenced(assistant), "Checked the `was X, now Y` proposal and absence of complete before/after content."),
            result("30–250" in text and "product-led" in text.lower() and "20–200" not in text and preserved, "Checked requested changes and preservation of unrelated facts."),
            result(clean_main(repo, 2) and changed_paths(repo) == ["icps/developer-tools-startups/ICP.md"] and identity in assistant_turns(run_dir)[-1] and closes_saved(run_dir), "Checked one clean scoped main commit and the identity plus `Saved.` close."),
            result(*interaction),
            result(*language_and_dead_model(run_dir, repo)),
        ]

    if name == "delete-obvious-node":
        repo = root / "arbor-systems"
        target = repo / "suborgs/mobility/icps/public-transit-agencies/ICP.md"
        persona = repo / "suborgs/mobility/personas/transit-planning-director/PERSONA.md"
        identity = "Public Transit Agencies (Arbor Systems › Arbor Mobility)"
        return [
            result(len(proposals) == 1 and context_line_under_opener(proposal, "Arbor Systems") and "which organization" not in output.lower(), "Checked obvious-node default, root context line under the opener, and no node question."),
            result(identity in proposal and all(phrase in proposal.lower() for phrase in ("definition", "no longer", "available")), "Checked identity and definition-availability consequence language in the proposal."),
            result("suborgs/mobility/icps/public-transit-agencies/ICP.md" not in assistant and "mobility/public-transit-agencies" not in assistant and not fenced(assistant), "Checked absence of the file path, qualified label, and fenced content."),
            result(not target.exists() and (repo / "ORG.md").is_file() and (repo / "suborgs/mobility/ORG.md").is_file() and persona.is_file() and "Owns network planning" in persona.read_text(), "Checked exact ICP deletion and preservation of org/persona artifacts."),
            result(clean_main(repo, 2) and changed_paths(repo) == ["suborgs/mobility/icps/public-transit-agencies/ICP.md"] and closes_saved(run_dir) and "restore" in assistant_turns(run_dir)[-1].lower(), "Checked one clean deletion commit plus the `Saved.` close and restore guidance."),
            result(*interaction),
            result(*language_and_dead_model(run_dir, repo)),
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
            result(clean_main(repo, 2) and git(repo, "log", "-1", "--pretty=%s") == "Repair ICP artifacts" and icp_changes_only, "Checked exact one-commit repair on main with ICP-only changed paths."),
            result(("healthy" in output.lower() or "verified" in output.lower()) and closes_saved(run_dir), "Checked verified healthy rerun and the `Saved.` close."),
            result(*interaction),
            result(*language_and_dead_model(run_dir, repo, paths=False)),
        ]

    if name == "persona-near-miss-boundary":
        repo = root / "boundary-labs"
        icps = sorted(path.relative_to(repo).as_posix() for path in repo.glob("icps/*/ICP.md"))
        personas = sorted(path.relative_to(repo).as_posix() for path in repo.glob("personas/*/PERSONA.md"))
        return [
            result("persona" in output.lower() and "gtm-persona" in output.lower() and "ideal customer profiles?" not in output.lower(), "Checked explicit persona ownership and sibling handoff without the ICP menu."),
            result(icps == ["icps/mid-market-manufacturers/ICP.md"] and personas == ["personas/operations-leader/PERSONA.md"], "Inventoried both artifact directories and found no lifecycle mutation."),
            result(clean_main(repo, 1), "Checked clean main and the unchanged seed history."),
            result("100–500" not in raw and "internal implementation owner" not in assistant, "Checked that seeded ICP content was not read, quoted, or used in the handoff."),
        ]

    if name == "hosted-save-unavailable":
        repo = root / "boundary-labs"
        target = repo / "icps/mid-market-manufacturers.md"
        text = target.read_text() if target.is_file() else ""
        recovery_ok, recovery_evidence = grouped_interaction_ok(run_dir)
        turns, _ = conversation_turns(run_dir)
        recovery = next((value for role, value in turns if role == "Assistant" and "CLI" in value and "durable" in value.lower()), "")
        was_now = re.search(r"was 100[–-]500.{0,40}now 150[–-]500", proposal, re.S) is not None
        return [
            result(len(proposals) == 1 and was_now and not fenced(assistant), "Checked the `was X, now Y` proposal for the one requested threshold change without fenced content."),
            result(("durable" in output.lower() and any(term in output.lower() for term in ("unavailable", "cannot", "could not"))) and not re.search(r"(?<!cannot be )(?<!not )\bsaved\.\s*$", output, re.I | re.M) and not re.search(r"\b(?:was|is|has been|successfully)\s+(?:saved|committed)\b", output, re.I), "Checked plain save-failure explanation and absence of a success claim."),
            result(recovery_ok and "(Recommended)" in recovery and recovery.rstrip().endswith(REPLY_LINE), recovery_evidence),
            result("100–500" in text and "150–500" not in text and clean_main(repo, 1), "Compared target content and checked clean one-entry seed history."),
            result(not git(repo, "remote") and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1 and "push" not in assistant.lower(), "Checked no remote addition, commit, push, or repair."),
        ]

    if name == "batch-create":
        repo = root / "tidewater-logistics"
        files = {
            "Regional Cold Chain Carriers": repo / "icps/regional-cold-chain-carriers/ICP.md",
            "Port Drayage Operators": repo / "icps/port-drayage-operators/ICP.md",
            "Grocery Distribution Centers": repo / "icps/grocery-distribution-centers/ICP.md",
        }
        facts = {
            "Regional Cold Chain Carriers": ("50", "400", "three states", "broker"),
            "Port Drayage Operators": ("container port", "20", "150", "single truck"),
            "Grocery Distribution Centers": ("3", "15", "routing", "outsource"),
        }
        identities = [f"{name} (Tidewater Logistics)" for name in files]
        files_ok = all(
            path.is_file()
            and path.read_text().startswith(f"# {name}")
            and all(fact in path.read_text().lower() for fact in facts[name])
            for name, path in files.items()
        )
        expected_paths = sorted(path.relative_to(repo).as_posix() for path in files.values())
        return [
            result(not grouped_intake_turns(run_dir) and "own this icp" not in output.lower(), "Checked that no intake or owner question was asked."),
            result(len(proposals) == 1 and context_line_under_opener(proposal, "Tidewater Logistics") and all(identity in proposal for identity in identities) and "disqualif" in proposal.lower(), "Checked one proposal with the context line and all three identities with criteria and disqualifiers."),
            result(files_ok, "Checked all three canonical files, H1s, and supplied facts."),
            result(clean_main(repo, 2) and sorted(changed_paths(repo)) == expected_paths, "Checked one clean commit beyond the seed changing exactly the three ICP paths."),
            result(not fenced(assistant) and all(identity in assistant_turns(run_dir)[-1] for identity in identities) and closes_saved(run_dir), "Checked no fenced content and the three-identity `Saved.` close."),
            result(*interaction),
            result(*language_and_dead_model(run_dir, repo)),
        ]

    if name == "hosted-native-approval":
        repo = root / "summit-ridge"
        target = repo / "icps/community-credit-unions/ICP.md"
        text = target.read_text() if target.is_file() else ""
        records = approvals(snapshot)
        summary = records[0].get("summary", "") if len(records) == 1 and isinstance(records[0].get("summary"), str) else ""
        lines = [line.strip() for line in summary.splitlines() if line.strip()]
        identity = "Community Credit Unions (Summit Ridge)"
        numbered_save_block = re.search(r"(?m)^1\.\s*(?:Save|Accept)", assistant) is not None
        return [
            result(len(records) == 1 and bool(summary.strip()), f"Checked the stand-in control log for exactly one record with a summary; records={len(records)}."),
            result(bool(lines) and lines[0] == "For Summit Ridge:" and lines[-1] == SAVE_CLOSING, f"Checked the summary's first and last lines: {lines[:1]!r} … {lines[-1:]!r}."),
            result(identity in summary and "20,000" in summary and "technology lead" in summary.lower() and plain_text(summary), "Checked identity, criteria, disqualifier, and plain-text shape of the summary."),
            result(SAVE_OPENER not in assistant and "Accept and save" not in assistant and "Would you like to save" not in assistant and not numbered_save_block, "Checked that no proposal message or numbered accept block appeared in the transcript."),
            result(target.is_file() and text.startswith("# Community Credit Unions") and "20,000" in text and "technology lead" in text.lower() and clean_main(repo, 2) and changed_paths(repo) == ["icps/community-credit-unions/ICP.md"], "Checked the file written through the control and one clean scoped commit."),
            result(identity in assistant_turns(run_dir)[-1] and closes_saved(run_dir) and "apply_gtm_workspace_changes" not in assistant, "Checked the identity plus `Saved.` close without a path, commit, or tool name."),
            result(*language_and_dead_model(run_dir, repo, extra=("apply_gtm_workspace_changes",))),
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
