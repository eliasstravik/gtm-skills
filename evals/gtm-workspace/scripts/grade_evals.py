#!/usr/bin/env python3
"""Programmatically grade gtm-workspace artifact assertions."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_ROOT = REPO_ROOT / "skills" / "gtm-workspace"
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

ROOT_IDENTITY_QUESTION = "What is the organization's name, website, and any social profiles such as LinkedIn?"
ROOT_NAME_RECOVERY = "What is the organization's name?"
ROOT_SOURCES_QUESTION = "Are there any other links, files, or folders you'd like me to research for this context?"
SUBORG_IDENTITY_QUESTION = "What is the suborganization's name, website, and any social profiles?"
SUBORG_NAME_RECOVERY = "What is the suborganization's name?"
SUBORG_SOURCES_QUESTION = "Are there any other links, files, or folders you'd like me to research for this suborganization's context?"
OPERATOR_IDENTITY_QUESTION = "What is your full name, email address, role, and any social profiles such as LinkedIn?"
OPERATOR_AFFILIATION_QUESTION = "What is your full name, email address, role, any social profiles such as LinkedIn, and which suborganizations you work with?"
MEMBER_OWNER_QUESTION = "What is this member's full name, email address, role, any social profiles such as LinkedIn, which organization should own their member record, and which other suborganizations they work with?"
MEMBER_BOTH_RECOVERY = "What are this member's full name and email address?"
MEMBER_SOURCES_QUESTION = "Are there any other links, files, or folders you'd like me to research for this member's context?"
BULK_SUBORGS_QUESTION = "Which suborganizations would you like to add?"
BULK_MEMBERS_QUESTION = "Which members would you like to add?"
MENU_QUESTION = "What would you like to do with an organization's GTM workspace?"
SHARING_QUESTION = "How would you like to use this GTM workspace repository?"

CANONICAL_EXAMPLE_INVENTORY = (
    "Brightpath Analytics",
    "https://brightpath.example",
    "https://linkedin.example/company/brightpath-analytics",
    "https://docs.brightpath.example",
    "/path/to/Brightpath sales deck.pdf",
    "/path/to/customer-interviews/",
    "Brightpath Enterprise",
    "https://enterprise.brightpath.example",
    "https://linkedin.example/company/brightpath-enterprise",
    "https://enterprise.brightpath.example/docs",
    "/path/to/Brightpath Enterprise deck.pdf",
    "/path/to/enterprise-interviews/",
    "Jordan Lee",
    "jordan@brightpath.example",
    "Head of Sales",
    "https://linkedin.example/in/jordan-lee",
    "https://brightpath.example/team/jordan",
    "/path/to/Jordan Lee resume.pdf",
    "/path/to/interview-notes/",
)

CANONICAL_EXAMPLE_LINES = Counter(
    [
        "Example (fictional): `Brightpath Analytics — https://brightpath.example — LinkedIn: https://linkedin.example/company/brightpath-analytics`",
        "Example (fictional): `https://docs.brightpath.example`, `/path/to/Brightpath sales deck.pdf`, or `/path/to/customer-interviews/`. You can paste several items or say `none`.",
        "Example (fictional): `Brightpath Enterprise — https://enterprise.brightpath.example — LinkedIn: https://linkedin.example/company/brightpath-enterprise`",
        "Example (fictional): `https://enterprise.brightpath.example/docs`, `/path/to/Brightpath Enterprise deck.pdf`, or `/path/to/enterprise-interviews/`. You can paste several items or say `none`.",
        "Example (fictional): `Jordan Lee — jordan@brightpath.example — Head of Sales — LinkedIn: https://linkedin.example/in/jordan-lee`",
        "Example (fictional): `https://brightpath.example/team/jordan`, `/path/to/Jordan Lee resume.pdf`, or `/path/to/interview-notes/`. You can paste several items or say `none`.",
        "Example (fictional): `Brightpath Enterprise — parent: Brightpath Analytics — https://enterprise.brightpath.example — LinkedIn: https://linkedin.example/company/brightpath-enterprise`",
        "Example (fictional): `Jordan Lee — jordan@brightpath.example — Head of Sales — LinkedIn: https://linkedin.example/in/jordan-lee`",
    ]
)

PROPOSAL_OPENINGS = (
    "Here is the complete proposed",
    "Here is the proposed suborganization set:",
    "Here is the proposed members set:",
    "Here is the complete proposed suborganization batch:",
    "Here is the complete proposed members batch:",
)


def digest_tree(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        digest.update(str(path.relative_to(root)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else ""


def has_contract(repo: Path) -> bool:
    expected = {
        "AGENTS.md": SKILL_ROOT / "templates" / "AGENTS.md",
        "CLAUDE.md": SKILL_ROOT / "templates" / "CLAUDE.md",
        ".gitignore": SKILL_ROOT / "templates" / "gitignore",
    }
    return all((repo / name).is_file() and (repo / name).read_bytes() == source.read_bytes() for name, source in expected.items())


def member_files(repo: Path) -> list[Path]:
    return [p for p in repo.rglob("MEMBER.md") if ".git" not in p.parts]


def organization_nodes(repo: Path) -> list[Path]:
    if not (repo / "ORG.md").is_file():
        return []
    found = [repo]
    pending = [repo]
    while pending:
        node = pending.pop()
        suborgs = node / "suborgs"
        if not suborgs.is_dir():
            continue
        children = sorted(path for path in suborgs.iterdir() if path.is_dir())
        found.extend(children)
        pending.extend(children)
    return found


def canonical_org_tree(repo: Path) -> bool:
    nodes = organization_nodes(repo)
    return bool(nodes) and all(
        (node / "ORG.md").is_file()
        and (node == repo or SLUG.fullmatch(node.name))
        for node in nodes
    )


def canonical_member_paths(repo: Path) -> bool:
    nodes = set(organization_nodes(repo))
    return all(
        path.parent.parent.name == "members"
        and path.parent.parent.parent in nodes
        and SLUG.fullmatch(path.parent.name)
        for path in member_files(repo)
    )


def no_legacy_layout(repo: Path) -> bool:
    paths = [path for path in repo.rglob("*") if ".git" not in path.parts]
    return (
        not any(path.is_file() and path.name == "org.md" for path in paths)
        and not any(path.is_dir() and path.name == "people" for path in paths)
        and not any(path.is_file() and path.name in {"person.md", "PERSON.md"} for path in paths)
    )


def legacy_migration_targets(repo: Path) -> dict[Path, Path]:
    targets: dict[Path, Path] = {}
    for legacy_org in repo.rglob("*"):
        if legacy_org.is_file() and legacy_org.name == "org.md" and ".git" not in legacy_org.parts:
            targets[legacy_org] = legacy_org.with_name("ORG.md")
    for legacy_member in repo.rglob("*"):
        if (
            legacy_member.is_file()
            and legacy_member.name in {"person.md", "PERSON.md"}
            and legacy_member.parent.parent.name == "people"
            and SLUG.fullmatch(legacy_member.parent.name)
            and ".git" not in legacy_member.parts
        ):
            owner = legacy_member.parent.parent.parent
            targets[legacy_member] = owner / "members" / legacy_member.parent.name / "MEMBER.md"
    return targets


def canonical_workspace(repo: Path) -> bool:
    return canonical_org_tree(repo) and canonical_member_paths(repo) and no_legacy_layout(repo)


def no_machine_state(repo: Path) -> bool:
    for path in repo.rglob("*"):
        if ".git" in path.parts:
            continue
        if path.is_dir() and not any(path.iterdir()):
            return False
        if path.is_file() and (path.name == "state.json" or path.suffix == ".log" or ".tmp" in path.parts):
            return False
        if path.is_file():
            text = path.read_text(errors="ignore")
            if "{{" in text or re.fullmatch(r"\s*(TODO|TBD|PLACEHOLDER)\s*", text, re.I):
                return False
    return True


def root_members_only(repo: Path) -> bool:
    found = member_files(repo)
    return all(path.parent.parent == repo / "members" for path in found) and canonical_member_paths(repo)


def result(ok: bool, evidence: str) -> tuple[bool, str]:
    return ok, evidence


def same_non_git_tree(left: Path, right: Path) -> bool:
    def files(root: Path) -> dict[str, bytes]:
        return {
            str(path.relative_to(root)): path.read_bytes()
            for path in root.rglob("*")
            if path.is_file() and ".git" not in path.parts
        }

    return files(left) == files(right)


def user_output(run_dir: Path) -> str:
    outputs = run_dir / "outputs"
    return "\n".join(
        path.read_text(errors="replace")
        for path in (outputs / "conversation.md", outputs / "final.md")
        if path.is_file()
    )


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


def executor_commands(run_dir: Path) -> list[str]:
    return [
        str(item.get("command", ""))
        for item in executor_items(run_dir)
        if item.get("type") == "command_execution"
    ]


def conversation_turns(run_dir: Path) -> tuple[list[tuple[str, str]], bool]:
    path = run_dir / "outputs" / "conversation.md"
    if not path.is_file():
        return [], False
    text = path.read_text(errors="replace")
    headings = list(re.finditer(r"(?m)^## (Assistant|User)$", text))
    turns = [
        (match.group(1), text[match.end() : headings[index + 1].start() if index + 1 < len(headings) else len(text)].strip())
        for index, match in enumerate(headings)
    ]
    alternating = bool(turns) and all(left[0] != right[0] for left, right in zip(turns, turns[1:]))
    return turns, alternating


def bold_question(turn: str) -> str | None:
    lines = [line.strip() for line in turn.splitlines() if line.strip()]
    bold_questions = [match.group(1) for line in lines if (match := re.fullmatch(r"\*\*(.+\?)\*\*", line))]
    if len(bold_questions) != 1 or not re.fullmatch(r"\*\*(.+\?)\*\*", lines[0]):
        return None
    return " ".join(bold_questions[0].split())


def question_turn(turns: list[tuple[str, str]], question: str) -> str | None:
    return next((text for role, text in turns if role == "Assistant" and bold_question(text) == question), None)


def exact_intake_window(
    turns: list[tuple[str, str]],
    identity_question: str,
    allowed_sequence: list[set[str]],
    proposal_path: str,
) -> tuple[bool, str]:
    starts = [
        index
        for index, (role, text) in enumerate(turns)
        if role == "Assistant" and bold_question(text) == identity_question
    ]
    if len(starts) != 1:
        return False, f"Expected one identity turn for {identity_question!r}; found {len(starts)}."
    start = starts[0]
    assistant_after = [
        (index, text)
        for index, (role, text) in enumerate(turns[start:], start=start)
        if role == "Assistant"
    ]
    sentinel_position = next(
        (
            position
            for position, (_, text) in enumerate(assistant_after)
            if "Here is the complete proposed" in text and proposal_path in text
        ),
        None,
    )
    if sentinel_position is None:
        return False, f"No complete-proposal sentinel found for {proposal_path}."
    window = [text for _, text in assistant_after[:sentinel_position]]
    actual = [bold_question(text) for text in window]
    expected_length = len(allowed_sequence)
    ok = (
        sentinel_position == expected_length
        and len(actual) == expected_length
        and all(question is not None and question in allowed for question, allowed in zip(actual, allowed_sequence, strict=True))
    )
    return ok, f"Ordered assistant sequence before {proposal_path}: {actual!r}; sentinel immediately followed it: {sentinel_position == expected_length}."


def exact_bulk_window(
    turns: list[tuple[str, str]],
    intake_question: str,
    allowed_sequence: list[set[str]],
    proposal_opening: str,
) -> tuple[bool, str]:
    starts = [
        index
        for index, (role, text) in enumerate(turns)
        if role == "Assistant" and bold_question(text) == intake_question
    ]
    if len(starts) != 1:
        return False, f"Expected one bulk turn for {intake_question!r}; found {len(starts)}."
    assistant_after = [
        text
        for role, text in turns[starts[0] :]
        if role == "Assistant"
    ]
    sentinel_position = next(
        (position for position, text in enumerate(assistant_after) if proposal_opening in text),
        None,
    )
    if sentinel_position is None:
        return False, f"No bulk proposal sentinel found for {proposal_opening!r}."
    actual = [bold_question(text) for text in assistant_after[:sentinel_position]]
    expected_length = len(allowed_sequence)
    ok = (
        sentinel_position == expected_length
        and len(actual) == expected_length
        and all(question is not None and question in allowed for question, allowed in zip(actual, allowed_sequence, strict=True))
    )
    return ok, f"Ordered bulk assistant sequence before {proposal_opening!r}: {actual!r}; sentinel immediately followed it: {sentinel_position == expected_length}."


def completion_request_check(output: str, request: str) -> bool:
    context_statement = re.search(
        r"(?is)(?:will|I'll|I’ll).{0,100}\buse\b.{0,100}\bsaved\b.{0,60}\bGTM workspace\b|"
        r"\buse\b.{0,100}\bsaved\b.{0,60}\bGTM workspace\b",
        output,
    )
    return request in output and context_statement is not None


def proposal_fenced_text(turns: list[tuple[str, str]]) -> str:
    proposal_text = []
    for role, text in turns:
        if role != "Assistant" or not any(opening in text for opening in PROPOSAL_OPENINGS):
            continue
        fences = re.findall(r"```[^\n]*\n(.*?)```", text, re.S)
        proposal_text.extend(fences or [text])
    return "\n".join(proposal_text)


def research_argument_text(run_dir: Path) -> str:
    values = []
    for item in executor_items(run_dir):
        item_type = item.get("type")
        if item_type == "command_execution":
            command = str(item.get("command", ""))
            is_research = re.search(
                r"\b(?:curl|wget|lynx|links|httpie|pdftotext|pandoc|tika|requests|httpx)\b",
                command,
                re.I,
            )
            mentions_example_source = any(value in command for value in CANONICAL_EXAMPLE_INVENTORY)
            if is_research or mentions_example_source:
                values.append(command)
        elif item_type == "mcp_tool_call":
            identity = " ".join(str(item.get(key, "")) for key in ("server", "tool", "name"))
            if re.search(r"(?:web|search|browser|research|fetch|open_url)", identity, re.I):
                arguments = next(
                    (item.get(key) for key in ("arguments", "params", "input") if key in item),
                    {},
                )
                values.append(json.dumps(arguments, sort_keys=True, default=str))
    return "\n".join(values)


def generated_context_text(snapshot: Path) -> str:
    root = snapshot / ".gtm"
    if not root.exists():
        return ""
    return "\n".join(
        path.read_text(errors="replace")
        for path in sorted(root.rglob("*"))
        if path.is_file() and ".git" not in path.parts
    )


def example_leakage_check(metadata: dict, snapshot: Path, run_dir: Path) -> tuple[bool, str]:
    allowed = metadata.get("allowed_example_values", [])
    unknown_allowed = sorted(set(allowed) - set(CANONICAL_EXAMPLE_INVENTORY))
    turns, _ = conversation_turns(run_dir)
    surfaces = {
        "research arguments": research_argument_text(run_dir),
        "artifact proposals": proposal_fenced_text(turns),
        "generated context artifacts": generated_context_text(snapshot),
    }
    forbidden = [value for value in CANONICAL_EXAMPLE_INVENTORY if value not in allowed]
    hits = {
        surface: [value for value in forbidden if value in text]
        for surface, text in surfaces.items()
    }
    hits = {surface: values for surface, values in hits.items() if values}
    ok = not unknown_allowed and not hits
    return ok, f"Allowed exceptions: {allowed!r}; unknown exceptions: {unknown_allowed!r}; leakage by surface: {hits!r}."


def example_inventory_sync_check() -> tuple[bool, str]:
    flows = (SKILL_ROOT / "references" / "flows.md").read_text(errors="replace")
    actual_lines = Counter(
        normalized
        for line in flows.splitlines()
        if "Example (fictional):" in line
        for normalized in [line.strip().removeprefix("> ")]
    )
    inventory_covered = all(any(value in line for line in actual_lines) for value in CANONICAL_EXAMPLE_INVENTORY)
    ok = actual_lines == CANONICAL_EXAMPLE_LINES and inventory_covered
    return ok, f"Expected and actual example-line counters match: {actual_lines == CANONICAL_EXAMPLE_LINES}; every inventory value is represented: {inventory_covered}."


def all_output_text(run_dir: Path) -> str:
    outputs = run_dir / "outputs"
    return "\n".join(
        path.read_text(errors="replace")
        for path in sorted(outputs.iterdir())
        if path.is_file()
        and path.suffix in {".md", ".txt"}
        and path.name != "artifact-report.md"
    )


def attempted_git_write(commands: list[str]) -> bool:
    return any(
        re.search(r"\bgit\b.*\b(?:commit|push|remote\s+add|remote\s+set-url)\b", command, re.I | re.S)
        for command in commands
    )


def checks_for(name: str, snapshot: Path, run_dir: Path) -> list[tuple[bool, str]]:
    root = snapshot / ".gtm"
    if name == "create-simple-local":
        repo = root / "acme-lantern"; org = repo / "ORG.md"; member = repo / "members/maria-chen/MEMBER.md"
        org_text = org.read_text().lower() if org.is_file() else ""
        turns, alternating = conversation_turns(run_dir)
        root_window = exact_intake_window(
            turns,
            ROOT_IDENTITY_QUESTION,
            [{ROOT_IDENTITY_QUESTION}, {ROOT_SOURCES_QUESTION}],
            "~/.gtm/acme-lantern/ORG.md",
        )
        operator_window = exact_intake_window(
            turns,
            OPERATOR_IDENTITY_QUESTION,
            [{OPERATOR_IDENTITY_QUESTION}, {MEMBER_SOURCES_QUESTION}],
            "members/maria-chen/MEMBER.md",
        )
        operator_turns = "\n".join(
            text
            for role, text in turns
            if role == "Assistant" and bold_question(text) in {OPERATOR_IDENTITY_QUESTION, MEMBER_SOURCES_QUESTION}
        ).lower()
        sharing = question_turn(turns, SHARING_QUESTION) or ""
        output = user_output(run_dir)
        return [
            result(has_contract(repo) and org.is_file(), "Compared all three root files byte-for-byte with templates and checked ORG.md."),
            result(org.is_file() and org.read_text().startswith("# Acme Lantern") and "scheduling" in org_text and ("plumb" in org_text or "electric" in org_text), "Checked the org H1 and normalized stems for the supplied scheduling and plumbing/electrical market facts."),
            result(member.is_file() and "- Email: maria@acme-lantern.example" in member.read_text() and root_members_only(repo) and "Suborganizations:" not in member.read_text(), "Checked Maria's canonical root member path, email, and absence of invented affiliation."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 2 and git(repo, "config", "--local", "user.email") == "maria@acme-lantern.example", "Checked main, history count, and repo-local operator email."),
            result(not git(repo, "remote") and no_machine_state(repo), "Checked no remotes and scanned the artifact for machine state/placeholders."),
            result(alternating and root_window[0], root_window[1] + f" Transcript alternates: {alternating}."),
            result(operator_window[0] and "affiliat" not in operator_turns and "which suborganization" not in operator_turns, operator_window[1] + " Checked the flat member intake text for no affiliation language."),
            result(all(term in sharing.lower() for term in ("local", "single-player", "multiplayer", "private", "github")), "Checked all five required sharing terms in the exact sharing-question turn."),
            result(completion_request_check(output, "Define the ideal customer profile for Acme Lantern."), "Checked the exact ICP fallback request, saved organization name, and saved-context statement."),
        ]
    if name == "create-complex-bulk":
        repo = root / "meridian-holdings"
        found_members = {p.parent.name: p for p in member_files(repo)}
        turns, alternating = conversation_turns(run_dir)
        suborg_bulk = exact_bulk_window(
            turns,
            BULK_SUBORGS_QUESTION,
            [{BULK_SUBORGS_QUESTION}],
            "Here is the proposed suborganization set:",
        )
        member_bulk = exact_bulk_window(
            turns,
            BULK_MEMBERS_QUESTION,
            [{BULK_MEMBERS_QUESTION}],
            "Here is the proposed members set:",
        )
        suborg_turn = question_turn(turns, BULK_SUBORGS_QUESTION) or ""
        member_turn = question_turn(turns, BULK_MEMBERS_QUESTION) or ""
        output = user_output(run_dir)
        organization_paths = (
            "ORG.md",
            "suborgs/meridian-cloud/ORG.md",
            "suborgs/meridian-cloud/suborgs/meridian-cloud-europe/ORG.md",
            "suborgs/meridian-home/ORG.md",
        )
        member_paths = {
            "devon-price": repo / "members/devon-price/MEMBER.md",
            "priya-shah": repo / "suborgs/meridian-cloud/suborgs/meridian-cloud-europe/members/priya-shah/MEMBER.md",
            "leo-martins": repo / "suborgs/meridian-home/members/leo-martins/MEMBER.md",
        }
        return [
            result(has_contract(repo) and canonical_org_tree(repo) and all((repo / path).is_file() for path in organization_paths), "Checked the root, two direct suborganizations, and recursively nested Europe ORG.md files."),
            result(set(found_members) == set(member_paths) and all(path.is_file() and "- Email:" in path.read_text() for path in member_paths.values()) and canonical_member_paths(repo) and no_legacy_layout(repo), "Checked exact root, direct-suborganization, and recursively nested MEMBER.md paths with no legacy layout."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 7, "Checked main and at least seven artifact history entries."),
            result(not git(repo, "remote"), "Checked that no remote remains after multiplayer was declined."),
            result(no_machine_state(repo), "Scanned for empty directories, placeholder markers, logs, temp content, and state.json."),
            result(alternating and suborg_bulk[0] and "one message" in suborg_turn.lower(), suborg_bulk[1] + " Checked the prompt explicitly requests one freeform message."),
            result(member_bulk[0] and "one message" in member_turn.lower() and "own" in member_turn.lower(), member_bulk[1] + " Checked one-message collection with ownership embedded in the initial bulk turn."),
            result(completion_request_check(output, "Define the ideal customer profile for Meridian Holdings."), "Checked fixed-priority ICP authoring despite both catalog IDs, plus the saved-context statement."),
        ]
    if name == "import-local-folder":
        repo = root / "orbit-analytics"; source = snapshot / "source/orbit-notes"; before = (run_dir / "source_digest_before.txt").read_text().strip()
        org = repo / "ORG.md"; member = repo / "members/ari-gomez/MEMBER.md"
        return [
            result(source.exists() and digest_tree(source) == before, "Compared the post-run source digest with the pre-run SHA-256 digest."),
            result(has_contract(repo) and org.is_file() and org.read_text().startswith("# Orbit Analytics") and "route-performance" in org.read_text().lower(), "Checked exact contract files and shaped organization facts."),
            result(member.is_file() and "ari@orbit-analytics.example" in member.read_text() and root_members_only(repo), "Checked Ari's canonical root MEMBER.md path and supplied email."),
            result(not list(repo.rglob("state.json")) and canonical_org_tree(repo) and canonical_member_paths(repo) and no_legacy_layout(repo) and git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 1, "Checked state removal, canonical layout, main, and conversion history."),
            result(not git(repo, "remote"), "Checked that local import has no remote."),
        ]
    if name == "update-a-member":
        repo = root / "ember-health"; member = repo / "members/casey-lee/MEMBER.md"; text = member.read_text() if member.exists() else ""
        return [
            result("- Email: casey@ember-health.example" in text and "- Role: VP Sales" in text and "Sales Lead" not in text, "Checked preserved email and exact role replacement."),
            result("## Links" in text and "https://www.linkedin.com/in/casey-lee-example" in text, "Checked accepted LinkedIn URL under a Links section."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2, "Checked main and exactly one commit beyond the seed."),
            result(len(member_files(repo)) == 1 and root_members_only(repo) and no_legacy_layout(repo) and not (repo / "suborgs").exists() and no_machine_state(repo) and not git(repo, "remote"), "Checked no new entity, legacy path, state, or remote."),
        ]
    if name == "delete-a-suborg":
        repo = root / "northstar-group"; member = repo / "members/amina-yusuf/MEMBER.md"; text = member.read_text() if member.exists() else ""
        turns, _ = conversation_turns(run_dir)
        consequence = next(
            (
                turn
                for role, turn in turns
                if role == "Assistant" and "Accept and save" in turn and "suborgs/consumer" in turn
            ),
            "",
        )
        owned_paths = (
            "suborgs/consumer/icps/family-learning.md",
            "suborgs/consumer/personas/household-buyer.md",
            "suborgs/consumer/members/layla-chen/MEMBER.md",
            "suborgs/consumer/suborgs/youth/personas/teen-program-director.md",
            "suborgs/consumer/suborgs/youth/members/noah-okafor/MEMBER.md",
        )
        return [
            result(not (repo / "suborgs/consumer").exists() and (repo / "suborgs/enterprise/ORG.md").is_file() and (repo / "ORG.md").is_file(), "Checked Consumer subtree absence and Enterprise/root survival."),
            result("enterprise" in text and "consumer" not in text.lower() and "youth" not in text.lower(), "Checked affiliation cleanup while preserving Enterprise."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2, "Checked main and exactly one deletion commit beyond seed."),
            result(bool(git(repo, "remote", "get-url", "origin")) and "northstar-group.git" in git(repo, "remote", "get-url", "origin"), "Checked that origin remains configured to the seeded remote."),
            result(all(path in consequence for path in owned_paths), f"Checked the accepted consequence proposal for owned artifact paths: {owned_paths!r}."),
        ]
    if name == "doctor-broken-repo":
        repo = root / "atlas-labs"; europe = repo / "suborgs/europe/ORG.md"; member = repo / "suborgs/europe/members/sam-rivera/MEMBER.md"
        agents = (repo / "AGENTS.md").read_text() if (repo / "AGENTS.md").is_file() else ""
        contract_restored = (
            all((repo / name).is_file() for name in ["AGENTS.md", "CLAUDE.md", ".gitignore"])
            and (repo / "CLAUDE.md").read_bytes() == b"@AGENTS.md\n"
            and agents.startswith("# GTM Workspace")
            and "Members live under their owning organization node" in agents
            and "Work only on `main`" in agents
            and "Preview durable changes" in agents
        )
        return [
            result(contract_restored, "Checked all root contract files, exact CLAUDE.md bytes, and the required node-owned/main/preview AGENTS.md semantics."),
            result(europe.is_file() and europe.read_text().startswith("# ") and "serves manufacturers in the European Union" in europe.read_text(), "Checked restored H1 and preserved overview."),
            result(member.is_file() and "sam@atlas-labs.example" in member.read_text() and canonical_member_paths(repo) and no_legacy_layout(repo), "Checked the in-place Europe legacy migration to canonical MEMBER.md and removal of all legacy paths."),
            result(not (repo / "state.json").exists() and not (repo / "suborgs/europe/empty-notes").exists(), "Checked seeded state file and empty directory removal."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and git(repo, "log", "-1", "--pretty=%s") == "Repair GTM workspace repo", "Checked main, exactly one repair commit, and exact repair message."),
        ]
    if name == "doctor-root-workflow-project":
        repo = root / "solstice-freight"
        output = user_output(run_dir)
        lower = output.lower()
        expected_paths = (
            "workflows/package.json",
            "workflows/package-lock.json",
            "workflows/flows/account-health.ts",
            "workflows/.env.example",
        )
        unchanged = (
            git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1
            and not git(repo, "status", "--porcelain")
            and all((repo / path).is_file() for path in expected_paths)
            and (repo / "workflows/.env").is_file()
            and (repo / "workflows/data/result.json").is_file()
        )
        placements_reported = (
            "workflows/" in lower
            and "root" in lower
            and any(word in lower for word in ("healthy", "valid", "permitted"))
            and any(marker in lower for marker in ("ignored", "untracked", ".env", "data/"))
        )
        no_repair = "repair proposal" not in lower and "accept and save" not in output and "repair gtm context repo" not in lower
        no_defect_claim = not any(
            marker in lower
            for marker in ("defects found", "defect:", "needs repair", "invalid placement")
        )
        return [
            result(unchanged, "Checked main, one seeded commit, a clean tree, tracked workflow files, and ignored runtime files."),
            result(placements_reported, "Checked the report for healthy root placement and permitted ignored state."),
            result(no_repair and no_defect_claim and "use workflow" not in lower, "Checked that no workflow-content review, defect, repair proposal, or commit was reported."),
        ]
    if name == "doctor-suborg-workflow-project":
        repo = root / "aster-ridge"
        output = user_output(run_dir)
        lower = output.lower()
        unchanged = (
            git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1
            and not git(repo, "status", "--porcelain")
            and (repo / "suborgs/europe/workflows/package.json").is_file()
            and (repo / "suborgs/europe/workflows/flows/account-health.ts").is_file()
        )
        misplaced_explained = "suborgs/europe/workflows" in lower and "root" in lower
        ownership_routed = "gtm-workflow" in lower and re.search(r"\buse workflow\b", lower) is None
        return [
            result(unchanged, "Checked main, one seeded commit, a clean tree, and preservation of the misplaced project."),
            result(misplaced_explained, "Checked the report for the exact suborganization path and root-only explanation."),
            result(ownership_routed, "Checked gtm-workflow ownership without workflow-content inspection."),
            result("cancel" in lower and unchanged, "Checked cancellation language and confirmed no repair commit or filesystem change."),
        ]
    if name == "hosted-create-refusal":
        repo = root / "northwind-gtm"
        fixture = REPO_ROOT / "evals/gtm-workspace/fixtures/hosted-connected/home/.gtm/northwind-gtm"
        output = user_output(run_dir)
        lower = output.lower()
        all_outputs = all_output_text(run_dir).lower()
        inventory = json.loads((run_dir / "home_inventory.json").read_text())
        items = executor_items(run_dir)
        commands = executor_commands(run_dir)
        researched = any(re.search(r"\b(?:curl|wget)\b", command, re.I) for command in commands) or any(
            item.get("type") == "mcp_tool_call"
            and re.search(r"(?:web|search|browser|research)", json.dumps(item), re.I)
            for item in items
        )
        unchanged = (
            repo.is_dir()
            and same_non_git_tree(repo, fixture)
            and not git(repo, "status", "--porcelain")
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2
            and git(repo, "log", "--pretty=%s") == "Add member: Rae Santos\nCreate GTM workspace scaffold"
        )
        two_redirects = lower.count("keyboard") >= 2 and lower.count("deployment") >= 2
        delta_draft = re.search(
            r"# delta robotics|delta-robotics/|delta robotics.{0,400}## overview|## overview.{0,400}delta robotics",
            all_outputs,
            re.S,
        )
        return [
            result(not any("delta-robotics" in path.lower() for path in inventory) and root.is_dir() and {path.name for path in root.iterdir()} == {"northwind-gtm"}, "Inventoried HOME outside harness internals and checked that Northwind is the only context repo."),
            result(unchanged, "Compared every non-git repo byte with the fixture and checked a clean, exact two-entry history."),
            result("fixed" in lower and "deployment" in lower and "cli" in lower and "keyboard" in lower, "Checked the refusal explanation and CLI-at-a-keyboard redirect in user-facing output."),
            result(unchanged and two_redirects and "delete" in lower, "Checked a second fixed-deployment keyboard redirect for the whole-repo delete request and verified no deletion."),
            result(
                not researched
                and delta_draft is None,
                "Checked every produced text artifact plus executor tool calls for absence of a Delta draft or external research.",
            ),
        ]
    if name == "hosted-update-proceeds":
        repo = root / "northwind-gtm"
        member = repo / "members/rae-santos/MEMBER.md"
        text = member.read_text() if member.is_file() else ""
        output = user_output(run_dir).lower()
        commands = executor_commands(run_dir)
        pushed = any(re.search(r"\bgit\b.*\bpush\b", command, re.I | re.S) for command in commands)
        accepted = """# Rae Santos

## Identity

- Email: rae@northwind-gear.example
- Role: VP Sales

## Links

- LinkedIn: https://www.linkedin.com/in/rae-santos-example"""
        persisted = (
            git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 3
            and not git(repo, "status", "--porcelain")
            and text.strip() == accepted
            and git(repo, "show", "HEAD:members/rae-santos/MEMBER.md") == accepted
            and git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD") == "members/rae-santos/MEMBER.md"
        )
        remote_problem = any(
            phrase in output
            for phrase in ("missing remote", "remote is missing", "remote problem", "remote defect", "failed to push")
        )
        return [
            result("- Email: rae@northwind-gear.example" in text and "- Role: VP Sales" in text and "Head of Sales" not in text, "Checked preserved email and exact role replacement."),
            result("## Links" in text and "https://www.linkedin.com/in/rae-santos-example" in text, "Checked the accepted LinkedIn URL under Links."),
            result(persisted, "Checked main, a clean tree, exactly one new commit, the exact accepted bytes in HEAD, and no unrelated path in that commit."),
            result(not git(repo, "remote") and not pushed and "failed to push" not in output, "Checked that no remote was added, no git push command ran, and no push failure was reported."),
            result(not remote_problem, "Checked user-facing output for absence of missing-remote problem or defect language."),
        ]
    if name == "hosted-save-failure-recovery":
        repo = root / "northwind-gtm"
        fixture = REPO_ROOT / "evals/gtm-workspace/fixtures/hosted-connected/home/.gtm/northwind-gtm"
        output = user_output(run_dir)
        lower = output.lower().replace("’", "'").replace("‘", "'")
        commands = executor_commands(run_dir)
        used_ask_user_question = any(
            item.get("type") == "mcp_tool_call"
            and re.search(
                r"ask_?user_?question",
                " ".join(str(item.get(key, "")) for key in ("server", "tool", "name")),
                re.I,
            )
            for item in executor_items(run_dir)
        )
        unchanged = (
            repo.is_dir()
            and same_non_git_tree(repo, fixture)
            and not git(repo, "status", "--porcelain")
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2
            and git(repo, "log", "--pretty=%s") == "Add member: Rae Santos\nCreate GTM workspace scaffold"
        )
        formatted_recovery = re.search(
            r"(?ims)^\*\*[^*\n]+\?\*\*\s*\n"
            r"(?:(?!^\*\*).){1,800}?durable(?:(?!^\*\*).){0,800}?"
            r"^1\.[^\n]*(?:cli|command line)[^\n]*keyboard[^\n]*\(Recommended\)\s*$\n"
            r"^2\.\s*Cancel\s*$\n\s*"
            r"^Reply with a number, or type your answer\.\s*$",
            output,
        ) is not None
        negative_save = (
            any(phrase in lower for phrase in ("could not save", "could not be saved", "couldn't save", "couldn't be saved", "not saved", "unable to save"))
            and "durable" in lower
            and not re.search(r"(?:has been|was successfully|is now|successfully) (?:saved|committed)", lower)
        )
        proposal = all(
            value in output
            for value in (
                "Head of Sales",
                "VP Sales",
                "https://www.linkedin.com/in/rae-santos-example",
            )
        )
        no_persistence_attempt = not git(repo, "remote") and not attempted_git_write(commands)
        return [
            result(unchanged, "Compared every non-git byte with the fixture and checked a clean, exact two-entry history."),
            result(negative_save, "Checked that the response explains the durable-save failure and never reports successful persistence."),
            result(formatted_recovery and not used_ask_user_question, "Checked a direct bold recovery question, recommended CLI-at-a-keyboard option first, cancel second, exact reply line, and no AskUserQuestion call."),
            result(no_persistence_attempt, "Checked that no commit, push, or remote mutation was attempted after the declared durable-save failure."),
            result(proposal and "cancel" in lower, "Checked that the exact role and LinkedIn proposal was shown before the user canceled recovery."),
        ]
    if name == "create-bundled-recovery":
        repo = root / "copperline-systems"
        org = repo / "ORG.md"
        suborg = repo / "suborgs/copperline-enterprise/ORG.md"
        operator = repo / "members/taylor-kim/MEMBER.md"
        member = repo / "suborgs/copperline-enterprise/members/nora-patel/MEMBER.md"
        turns, alternating = conversation_turns(run_dir)
        menu = next(
            (
                text
                for role, text in turns
                if role == "Assistant" and f"**{MENU_QUESTION}**" in text
            ),
            "",
        )
        root_window = exact_intake_window(
            turns,
            ROOT_IDENTITY_QUESTION,
            [{ROOT_IDENTITY_QUESTION}, {ROOT_NAME_RECOVERY}, {ROOT_SOURCES_QUESTION}],
            "~/.gtm/copperline-systems/ORG.md",
        )
        named_suborg_sources = "Are there any other links, files, or folders you'd like me to research for Copperline Enterprise's context?"
        suborg_window = exact_intake_window(
            turns,
            SUBORG_IDENTITY_QUESTION,
            [{SUBORG_IDENTITY_QUESTION}, {SUBORG_NAME_RECOVERY}, {SUBORG_SOURCES_QUESTION, named_suborg_sources}],
            "suborgs/copperline-enterprise/ORG.md",
        )
        operator_window = exact_intake_window(
            turns,
            OPERATOR_AFFILIATION_QUESTION,
            [{OPERATOR_AFFILIATION_QUESTION}, {MEMBER_SOURCES_QUESTION}],
            "members/taylor-kim/MEMBER.md",
        )
        member_window = exact_intake_window(
            turns,
            MEMBER_OWNER_QUESTION,
            [{MEMBER_OWNER_QUESTION}, {MEMBER_BOTH_RECOVERY}, {MEMBER_SOURCES_QUESTION}],
            "suborgs/copperline-enterprise/members/nora-patel/MEMBER.md",
        )
        operator_turn = question_turn(turns, OPERATOR_AFFILIATION_QUESTION) or ""
        member_turn = question_turn(turns, MEMBER_OWNER_QUESTION) or ""
        all_questions = [bold_question(text) for role, text in turns if role == "Assistant"]
        standalone_affiliation = any(question and "affiliat" in question.lower() for question in all_questions)
        menu_ok = (
            "A GTM workspace is a saved folder for one organization. It gives your agent the background it needs for GTM work." in menu
            and "Create a GTM workspace for a new organization" in menu
            and "Import an organization's existing folder or GitHub repository" in menu
            and "Check and repair a context that may be broken" in menu
        )
        artifact_ok = (
            has_contract(repo)
            and all(path.is_file() for path in (org, suborg, operator, member))
            and canonical_member_paths(repo)
            and no_legacy_layout(repo)
            and "- Email: taylor@copperline.example" in operator.read_text()
            and "Suborganizations:" not in operator.read_text()
            and "- Email: nora@copperline.example" in member.read_text()
            and git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 4
        )
        output = user_output(run_dir)
        return [
            result(artifact_ok, "Checked contract files, root/suborganization artifacts, root and suborganization member ownership, emails, main, and per-artifact history."),
            result(alternating and menu_ok, f"Checked exact menu explanation, question, representative organization-aware choices, and turn alternation ({alternating})."),
            result(root_window[0] and suborg_window[0], root_window[1] + " " + suborg_window[1]),
            result(operator_window[0] and member_window[0], operator_window[1] + " " + member_window[1]),
            result("Copperline Enterprise" in operator_turn and "Copperline Enterprise" in member_turn and not standalone_affiliation, "Checked both first member turns for the valid saved display name and found no standalone owner or affiliation question."),
            result(completion_request_check(output, "Define the ideal customer profile for Copperline Systems."), "Checked the exact recognized ICP request, saved display name, and saved-context statement."),
        ]
    if name == "create-unrecognized-workflow-fallback":
        repo = root / "pine-harbor"
        org = repo / "ORG.md"
        member = repo / "members/iris-wong/MEMBER.md"
        output = user_output(run_dir)
        artifact_ok = (
            has_contract(repo)
            and org.is_file()
            and org.read_text().startswith("# Pine Harbor")
            and member.is_file()
            and "- Email: iris@pine-harbor.example" in member.read_text()
            and root_members_only(repo)
            and no_legacy_layout(repo)
            and git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 2
            and not git(repo, "remote")
        )
        return [
            result(artifact_ok, "Checked exact contract, accepted organization/operator artifacts, canonical root member email, main history, and no remote."),
            result(
                completion_request_check(output, "Define the ideal customer profile for Pine Harbor.")
                and "gtm-market-orbit" not in output,
                "Checked the exact generic fallback and saved-context statement, with no rendering of the unrecognized ID.",
            ),
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
            snapshot = run_dir / "sandbox_snapshot"
            checks = checks_for(metadata["eval_name"], snapshot, run_dir)
            checks.append(example_leakage_check(metadata, snapshot, run_dir))
            if metadata["eval_name"] == "create-unrecognized-workflow-fallback":
                checks.append(example_inventory_sync_check())
            expectations = [
                {"text": text, "passed": passed, "evidence": evidence}
                for text, (passed, evidence) in zip(metadata["assertions"], checks, strict=True)
            ]
            passed = sum(item["passed"] for item in expectations)
            metrics_path = run_dir / "outputs/metrics.json"
            timing_path = run_dir / "timing.json"
            timing_data = json.loads(timing_path.read_text()) if timing_path.exists() else {}
            grading = {
                "expectations": expectations,
                "summary": {"passed": passed, "failed": len(expectations) - passed, "total": len(expectations), "pass_rate": round(passed / len(expectations), 4)},
                "execution_metrics": json.loads(metrics_path.read_text()) if metrics_path.exists() else {},
                "timing": {"executor_duration_seconds": timing_data.get("total_duration_seconds", 0)},
                "claims": [],
                "user_notes_summary": {"uncertainties": [], "needs_review": [], "workarounds": []},
                "eval_feedback": {"suggestions": [], "overall": "Artifact assertions are deterministic and scenario-specific."},
            }
            (run_dir / "grading.json").write_text(json.dumps(grading, indent=2) + "\n")
            print(f"{metadata['eval_name']} {configuration}: {passed}/{len(expectations)}")


if __name__ == "__main__":
    main()
