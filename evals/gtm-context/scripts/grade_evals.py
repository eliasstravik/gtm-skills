#!/usr/bin/env python3
"""Programmatically grade gtm-context artifact assertions."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_ROOT = REPO_ROOT / "skills" / "gtm-context"
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

ROOT_IDENTITY_QUESTION = "What is the organization's name, website, and any social profiles such as LinkedIn?"
ROOT_NAME_RECOVERY = "What is the organization's name?"
ROOT_SOURCES_QUESTION = "Are there any other links, files, or folders you'd like me to research for this context?"
SUBORG_IDENTITY_QUESTION = "What is the suborganization's name, website, and any social profiles?"
SUBORG_NAME_RECOVERY = "What is the suborganization's name?"
SUBORG_SOURCES_QUESTION = "Are there any other links, files, or folders you'd like me to research for this suborganization's context?"
OPERATOR_IDENTITY_QUESTION = "What is your full name, email address, role, and any social profiles such as LinkedIn?"
OPERATOR_AFFILIATION_QUESTION = "What is your full name, email address, role, any social profiles such as LinkedIn, and which suborganizations you work with?"
PERSON_AFFILIATION_QUESTION = "What is this person's full name, email address, role, any social profiles such as LinkedIn, and which suborganizations they work with?"
PERSON_BOTH_RECOVERY = "What are this person's full name and email address?"
PERSON_SOURCES_QUESTION = "Are there any other links, files, or folders you'd like me to research for this person's context?"
BULK_SUBORGS_QUESTION = "Which suborganizations would you like to add?"
BULK_PEOPLE_QUESTION = "Which people would you like to add?"
MENU_QUESTION = "What would you like to do with an organization's GTM context?"
SHARING_QUESTION = "How would you like to use this GTM context repository?"

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
    "Here is the proposed people set:",
    "Here is the complete proposed suborganization batch:",
    "Here is the complete proposed people batch:",
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


def people(repo: Path) -> list[Path]:
    return [p for p in repo.rglob("person.md") if ".git" not in p.parts]


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


def root_only_people(repo: Path) -> bool:
    found = people(repo)
    return all(p.parent.parent == repo / "people" and SLUG.fullmatch(p.parent.name) for p in found)


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
            if text.startswith("Here is the complete proposed") and proposal_path in text
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
        (position for position, text in enumerate(assistant_after) if text.startswith(proposal_opening)),
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
        r"(?is)(?:will|I'll|I’ll).{0,100}\buse\b.{0,100}\bsaved\b.{0,60}\bGTM context\b|"
        r"\buse\b.{0,100}\bsaved\b.{0,60}\bGTM context\b",
        output,
    )
    return request in output and context_statement is not None


def proposal_fenced_text(turns: list[tuple[str, str]]) -> str:
    proposal_text = []
    for role, text in turns:
        if role != "Assistant" or not text.startswith(PROPOSAL_OPENINGS):
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
        repo = root / "acme-lantern"; org = repo / "org.md"; person = repo / "people/maria-chen/person.md"
        org_text = org.read_text().lower() if org.is_file() else ""
        turns, alternating = conversation_turns(run_dir)
        root_window = exact_intake_window(
            turns,
            ROOT_IDENTITY_QUESTION,
            [{ROOT_IDENTITY_QUESTION}, {ROOT_SOURCES_QUESTION}],
            "~/.gtm/acme-lantern/org.md",
        )
        operator_window = exact_intake_window(
            turns,
            OPERATOR_IDENTITY_QUESTION,
            [{OPERATOR_IDENTITY_QUESTION}, {PERSON_SOURCES_QUESTION}],
            "people/maria-chen/person.md",
        )
        operator_turns = "\n".join(
            text
            for role, text in turns
            if role == "Assistant" and bold_question(text) in {OPERATOR_IDENTITY_QUESTION, PERSON_SOURCES_QUESTION}
        ).lower()
        sharing = question_turn(turns, SHARING_QUESTION) or ""
        output = user_output(run_dir)
        return [
            result(has_contract(repo) and org.is_file(), "Compared all three root files byte-for-byte with templates and checked org.md."),
            result(org.is_file() and org.read_text().startswith("# Acme Lantern") and "scheduling" in org_text and ("plumb" in org_text or "electric" in org_text), "Checked the org H1 and normalized stems for the supplied scheduling and plumbing/electrical market facts."),
            result(person.is_file() and "- Email: maria@acme-lantern.example" in person.read_text() and root_only_people(repo) and "Suborgs:" not in person.read_text(), "Checked Maria's root path, email, and absence of invented affiliation."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 2 and git(repo, "config", "--local", "user.email") == "maria@acme-lantern.example", "Checked main, history count, and repo-local operator email."),
            result(not git(repo, "remote") and no_machine_state(repo), "Checked no remotes and scanned the artifact for machine state/placeholders."),
            result(alternating and root_window[0], root_window[1] + f" Transcript alternates: {alternating}."),
            result(operator_window[0] and "affiliat" not in operator_turns and "which suborganization" not in operator_turns, operator_window[1] + " Checked the flat person intake text for no affiliation language."),
            result(all(term in sharing.lower() for term in ("local", "single-player", "multiplayer", "private", "github")), "Checked all five required sharing terms in the exact sharing-question turn."),
            result(completion_request_check(output, "Research [target account] as a potential customer for Acme Lantern."), "Checked the exact fallback request, bracketed target placeholder, saved organization name, and saved-context statement."),
        ]
    if name == "create-complex-bulk":
        repo = root / "meridian-holdings"
        persons = {p.parent.name: p for p in people(repo)}
        turns, alternating = conversation_turns(run_dir)
        suborg_bulk = exact_bulk_window(
            turns,
            BULK_SUBORGS_QUESTION,
            [{BULK_SUBORGS_QUESTION}],
            "Here is the proposed suborganization set:",
        )
        people_bulk = exact_bulk_window(
            turns,
            BULK_PEOPLE_QUESTION,
            [{BULK_PEOPLE_QUESTION}],
            "Here is the proposed people set:",
        )
        suborg_turn = question_turn(turns, BULK_SUBORGS_QUESTION) or ""
        people_turn = question_turn(turns, BULK_PEOPLE_QUESTION) or ""
        output = user_output(run_dir)
        return [
            result(has_contract(repo) and all((repo / path).is_file() for path in ["org.md", "suborgs/meridian-cloud/org.md", "suborgs/meridian-home/org.md"]), "Checked root contract and all three organization files."),
            result(set(persons) == {"devon-price", "priya-shah", "leo-martins"} and root_only_people(repo) and all("- Email:" in p.read_text() for p in persons.values()) and "meridian-cloud" in persons["priya-shah"].read_text() and "meridian-home" in persons["leo-martins"].read_text(), "Checked exact root-only people, emails, and supplied affiliations."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 6, "Checked main and at least six artifact history entries."),
            result(not git(repo, "remote"), "Checked that no remote remains after multiplayer was declined."),
            result(no_machine_state(repo), "Scanned for empty directories, placeholder markers, logs, temp content, and state.json."),
            result(alternating and suborg_bulk[0] and "one message" in suborg_turn.lower(), suborg_bulk[1] + " Checked the prompt explicitly requests one freeform message."),
            result(people_bulk[0] and "one message" in people_turn.lower() and "affiliation" in people_turn.lower(), people_bulk[1] + " Checked one-message collection with affiliations embedded in the initial bulk turn."),
            result(completion_request_check(output, "Research [target account] as a potential customer for Meridian Holdings."), "Checked fixed-priority account research despite all three catalog IDs, plus the saved-context statement."),
        ]
    if name == "import-local-folder":
        repo = root / "orbit-analytics"; source = snapshot / "source/orbit-notes"; before = (run_dir / "source_digest_before.txt").read_text().strip()
        org = repo / "org.md"; person = repo / "people/ari-gomez/person.md"
        return [
            result(source.exists() and digest_tree(source) == before, "Compared the post-run source digest with the pre-run SHA-256 digest."),
            result(has_contract(repo) and org.is_file() and org.read_text().startswith("# Orbit Analytics") and "route-performance" in org.read_text().lower(), "Checked exact contract files and shaped organization facts."),
            result(person.is_file() and "ari@orbit-analytics.example" in person.read_text() and root_only_people(repo), "Checked Ari's root-only person path and supplied email."),
            result(not list(repo.rglob("state.json")) and root_only_people(repo) and git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 1, "Checked state removal, people placement, main, and conversion history."),
            result(not git(repo, "remote"), "Checked that local import has no remote."),
        ]
    if name == "update-a-person":
        repo = root / "ember-health"; person = repo / "people/casey-lee/person.md"; text = person.read_text() if person.exists() else ""
        return [
            result("- Email: casey@ember-health.example" in text and "- Role: VP Sales" in text and "Sales Lead" not in text, "Checked preserved email and exact role replacement."),
            result("## Links" in text and "https://www.linkedin.com/in/casey-lee-example" in text, "Checked accepted LinkedIn URL under a Links section."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2, "Checked main and exactly one commit beyond the seed."),
            result(len(people(repo)) == 1 and not (repo / "suborgs").exists() and no_machine_state(repo) and not git(repo, "remote"), "Checked no new entity, state, or remote."),
        ]
    if name == "delete-a-suborg":
        repo = root / "northstar-group"; person = repo / "people/amina-yusuf/person.md"; text = person.read_text() if person.exists() else ""
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
            "suborgs/consumer/suborgs/youth/personas/teen-program-director.md",
        )
        return [
            result(not (repo / "suborgs/consumer").exists() and (repo / "suborgs/enterprise/org.md").is_file() and (repo / "org.md").is_file(), "Checked Consumer subtree absence and Enterprise/root survival."),
            result("enterprise" in text and "consumer" not in text.lower() and "youth" not in text.lower(), "Checked affiliation cleanup while preserving Enterprise."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2, "Checked main and exactly one deletion commit beyond seed."),
            result(bool(git(repo, "remote", "get-url", "origin")) and "northstar-group.git" in git(repo, "remote", "get-url", "origin"), "Checked that origin remains configured to the seeded remote."),
            result(all(path in consequence for path in owned_paths), f"Checked the accepted consequence proposal for owned artifact paths: {owned_paths!r}."),
        ]
    if name == "doctor-broken-repo":
        repo = root / "atlas-labs"; europe = repo / "suborgs/europe/org.md"; person = repo / "people/sam-rivera/person.md"
        agents = (repo / "AGENTS.md").read_text() if (repo / "AGENTS.md").is_file() else ""
        contract_restored = (
            all((repo / name).is_file() for name in ["AGENTS.md", "CLAUDE.md", ".gitignore"])
            and (repo / "CLAUDE.md").read_bytes() == b"@AGENTS.md\n"
            and agents.startswith("# GTM Context")
            and "People live only at root" in agents
            and "Work only on `main`" in agents
            and "Preview durable changes" in agents
        )
        return [
            result(contract_restored, "Checked all root contract files, exact CLAUDE.md bytes, and the required root-only/main/preview AGENTS.md semantics."),
            result(europe.is_file() and europe.read_text().startswith("# ") and "serves manufacturers in the European Union" in europe.read_text(), "Checked restored H1 and preserved overview."),
            result(person.is_file() and "sam@atlas-labs.example" in person.read_text() and root_only_people(repo), "Checked Sam's root-only move and supplied email."),
            result(not (repo / "state.json").exists() and not (repo / "suborgs/europe/empty-notes").exists(), "Checked seeded state file and empty directory removal."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and git(repo, "log", "-1", "--pretty=%s") == "Repair GTM context repo", "Checked main, exactly one repair commit, and exact repair message."),
        ]
    if name == "doctor-healthy-skill-content":
        repo = root / "solstice-freight"
        output = user_output(run_dir)
        lower = output.lower()
        expected_paths = (
            "icps/logistics-operators.md",
            "personas/vp-operations.md",
            "suborgs/europe/icps/regional-carriers.md",
            "suborgs/europe/personas/compliance-director.md",
        )
        unchanged = (
            git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1
            and not git(repo, "status", "--porcelain")
            and all((repo / path).is_file() for path in expected_paths)
        )
        placements_reported = all(
            marker in lower
            for marker in ("icps/", "personas/", "suborgs/europe")
        ) and any(word in lower for word in ("healthy", "valid", "legitimate"))
        no_repair = "repair proposal" not in lower and "accept and save" not in output and "repair gtm context repo" not in lower
        no_defect_claim = not any(
            marker in lower
            for marker in ("defects found", "defect:", "needs repair", "invalid placement", "stray placement")
        )
        return [
            result(unchanged, "Checked main, one seeded commit, a clean tree, and all four skill-owned artifact paths."),
            result(placements_reported, "Checked the health report for root and Europe ICP/persona placement plus healthy language."),
            result(no_repair and no_defect_claim, "Checked that no defect, repair proposal, acceptance gate, or repair commit was reported."),
        ]
    if name == "doctor-stray-skill-content":
        repo = root / "aster-ridge"
        output = user_output(run_dir)
        lower = output.lower()
        unchanged = (
            git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1
            and not git(repo, "status", "--porcelain")
            and (repo / "archive/icps/legacy-targets.md").is_file()
            and (repo / "personas/revenue-leader.md").is_file()
        )
        stray_explained = "archive/icps" in lower and (
            "org.md" in lower or "organization node" in lower or "organisation node" in lower
        )
        root_persona_ok = not re.search(
            r"(?:defect|invalid|stray|wrong|repair)[^\n]{0,120}(?:root/)?personas/|(?:root/)?personas/[^\n]{0,120}(?:defect|invalid|stray|wrong|repair)",
            lower,
        )
        return [
            result(unchanged, "Checked main, one seeded commit, a clean tree, and preservation of the stray ICP plus legitimate root persona."),
            result(stray_explained, "Checked the report for archive/icps and an explanation tied to the missing org.md or organization node."),
            result(root_persona_ok, "Checked that root personas/ was not paired with defect or repair language."),
            result("cancel" in lower and unchanged, "Checked cancellation language and confirmed no repair commit or filesystem change."),
        ]
    if name == "hosted-create-refusal":
        repo = root / "northwind-gtm"
        fixture = REPO_ROOT / "evals/gtm-context/fixtures/hosted-connected/home/.gtm/northwind-gtm"
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
            and git(repo, "log", "--pretty=%s") == "Add person: Rae Santos\nCreate GTM context scaffold"
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
        person = repo / "people/rae-santos/person.md"
        text = person.read_text() if person.is_file() else ""
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
            and git(repo, "show", "HEAD:people/rae-santos/person.md") == accepted
            and git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD") == "people/rae-santos/person.md"
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
        fixture = REPO_ROOT / "evals/gtm-context/fixtures/hosted-connected/home/.gtm/northwind-gtm"
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
            and git(repo, "log", "--pretty=%s") == "Add person: Rae Santos\nCreate GTM context scaffold"
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
        org = repo / "org.md"
        suborg = repo / "suborgs/copperline-enterprise/org.md"
        operator = repo / "people/taylor-kim/person.md"
        person = repo / "people/nora-patel/person.md"
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
            "~/.gtm/copperline-systems/org.md",
        )
        named_suborg_sources = "Are there any other links, files, or folders you'd like me to research for Copperline Enterprise's context?"
        suborg_window = exact_intake_window(
            turns,
            SUBORG_IDENTITY_QUESTION,
            [{SUBORG_IDENTITY_QUESTION}, {SUBORG_NAME_RECOVERY}, {SUBORG_SOURCES_QUESTION, named_suborg_sources}],
            "suborgs/copperline-enterprise/org.md",
        )
        operator_window = exact_intake_window(
            turns,
            OPERATOR_AFFILIATION_QUESTION,
            [{OPERATOR_AFFILIATION_QUESTION}, {PERSON_SOURCES_QUESTION}],
            "people/taylor-kim/person.md",
        )
        person_window = exact_intake_window(
            turns,
            PERSON_AFFILIATION_QUESTION,
            [{PERSON_AFFILIATION_QUESTION}, {PERSON_BOTH_RECOVERY}, {PERSON_SOURCES_QUESTION}],
            "people/nora-patel/person.md",
        )
        operator_turn = question_turn(turns, OPERATOR_AFFILIATION_QUESTION) or ""
        person_turn = question_turn(turns, PERSON_AFFILIATION_QUESTION) or ""
        all_questions = [bold_question(text) for role, text in turns if role == "Assistant"]
        standalone_affiliation = any(question and "affiliat" in question.lower() for question in all_questions)
        menu_ok = (
            "A GTM context is a saved folder for one organization. It gives your agent the background it needs for GTM work." in menu
            and "Create a GTM context for a new organization" in menu
            and "Import an organization's existing folder or GitHub repository" in menu
            and "Check and repair a context that may be broken" in menu
        )
        artifact_ok = (
            has_contract(repo)
            and all(path.is_file() for path in (org, suborg, operator, person))
            and root_only_people(repo)
            and "- Email: taylor@copperline.example" in operator.read_text()
            and "Suborgs:" not in operator.read_text()
            and "- Email: nora@copperline.example" in person.read_text()
            and "copperline-enterprise" in person.read_text()
            and git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 4
        )
        output = user_output(run_dir)
        return [
            result(artifact_ok, "Checked contract files, root/suborganization artifacts, both root-only people and emails, supplied-only affiliations, main, and per-artifact history."),
            result(alternating and menu_ok, f"Checked exact menu explanation, question, representative organization-aware choices, and turn alternation ({alternating})."),
            result(root_window[0] and suborg_window[0], root_window[1] + " " + suborg_window[1]),
            result(operator_window[0] and person_window[0], operator_window[1] + " " + person_window[1]),
            result("Copperline Enterprise" in operator_turn and "Copperline Enterprise" in person_turn and not standalone_affiliation, "Checked both first person turns for the valid saved display name and found no standalone affiliation question."),
            result(completion_request_check(output, "Define the ideal customer profile for Copperline Systems."), "Checked the exact recognized ICP request, saved display name, and saved-context statement."),
        ]
    if name == "create-unrecognized-workflow-fallback":
        repo = root / "pine-harbor"
        org = repo / "org.md"
        person = repo / "people/iris-wong/person.md"
        output = user_output(run_dir)
        artifact_ok = (
            has_contract(repo)
            and org.is_file()
            and org.read_text().startswith("# Pine Harbor")
            and person.is_file()
            and "- Email: iris@pine-harbor.example" in person.read_text()
            and root_only_people(repo)
            and git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 2
            and not git(repo, "remote")
        )
        return [
            result(artifact_ok, "Checked exact contract, accepted organization/operator artifacts, root-only person email, main history, and no remote."),
            result(
                completion_request_check(output, "Research [target account] as a potential customer for Pine Harbor.")
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
        for configuration in ("with_skill", "without_skill"):
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
