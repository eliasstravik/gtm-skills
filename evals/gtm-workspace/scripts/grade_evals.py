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

INTAKE_QUESTION = "What is the organization's name, website, and any social profiles such as LinkedIn?"
ROOT_NAME_RECOVERY = "What is the organization's name?"
SUBORG_NAMES_RECOVERY = "What are the missing names for these suborganizations?"
OPERATOR_NAME_RECOVERY = "What is your full name?"
OPERATOR_EMAIL_RECOVERY = "What is your email address?"
OPERATOR_BOTH_RECOVERY = "What are your full name and email address?"
MEMBER_NAMES_RECOVERY = "What are the missing full names for these members?"
MEMBER_EMAILS_RECOVERY = "What are the missing email addresses for these members?"
MEMBER_BOTH_RECOVERY = "What are the missing full names and email addresses for these members?"
MENU_QUESTION = "What would you like to do with an organization's GTM workspace?"
SHARING_QUESTION = "How would you like to use this GTM workspace repository?"
SAVE_OPENER = "**Save this?**"
SAVE_CLOSING = "Approve to save, or Cancel and tell me what to change."
REPLY_LINE = "Reply with a number, or type your answer."
SETUP_FILES_PHRASE = "plus the workspace's standard setup files"
INTAKE_BULLETS = (
    "Other links, files, or folders I should research",
    "Suborganizations, if distinct businesses need their own GTM context",
    "You: full name, email, role, social profiles",
    "Other members: the same details for each",
)
BOLD_QUESTION = re.compile(r"\*\*[^*\n]+\?\*\*")
NUMBERED = re.compile(r"^\d+\.\s")
BANNED_WORDS = re.compile(
    r"\b(?:git|github|commit|commits|committed|committing|push|pushed|pull request|branch|hash|sha|manifest)\b"
    r"|saved to history",
    re.I,
)
BANNED_PATHS = re.compile(r"(?:^|[\s`(\"'])(?:icps|personas|members|suborgs)/|\S+\.md\b|~/\.gtm/")

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
    "Jordan Lee",
    "jordan@brightpath.example",
    "Head of Sales",
    "https://linkedin.example/in/jordan-lee",
)

CANONICAL_EXAMPLE_LINES = Counter(
    [
        "Share whatever you have in one message. Only the organization name is required. Example (fictional): `Brightpath Analytics — https://brightpath.example — LinkedIn: https://linkedin.example/company/brightpath-analytics`",
        "- Other links, files, or folders I should research. Example (fictional): `https://docs.brightpath.example`, `/path/to/Brightpath sales deck.pdf`, or `/path/to/customer-interviews/`",
        "- Suborganizations, if distinct businesses need their own GTM context: name, parent, website, links. Example (fictional): `Brightpath Enterprise — parent: Brightpath Analytics — https://enterprise.brightpath.example — LinkedIn: https://linkedin.example/company/brightpath-enterprise`",
        "- You: full name, email, role, social profiles, and which suborganizations you work with. Example (fictional): `Jordan Lee — jordan@brightpath.example — Head of Sales — LinkedIn: https://linkedin.example/in/jordan-lee`",
    ]
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
    return bool(ok), evidence


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


def assistant_turns(run_dir: Path) -> list[str]:
    turns, _ = conversation_turns(run_dir)
    values = [text for role, text in turns if role == "Assistant"]
    final = run_dir / "outputs" / "final.md"
    if final.is_file():
        values.append(final.read_text(errors="replace"))
    return values


def bold_question(turn: str) -> str | None:
    lines = [line.strip() for line in turn.splitlines() if line.strip()]
    bold_questions = [match.group(1) for line in lines if (match := re.fullmatch(r"\*\*(.+\?)\*\*", line))]
    if len(bold_questions) != 1 or not lines or not re.fullmatch(r"\*\*(.+\?)\*\*", lines[0]):
        return None
    return " ".join(bold_questions[0].split())


def question_turn(turns: list[tuple[str, str]], question: str) -> str | None:
    return next((text for role, text in turns if role == "Assistant" and bold_question(text) == question), None)


def proposal_turns(turns: list[tuple[str, str]]) -> list[str]:
    return [text for role, text in turns if role == "Assistant" and text.lstrip().startswith(SAVE_OPENER)]


def context_line_under_opener(text: str, root_name: str) -> bool:
    nonempty = [line.strip() for line in text.splitlines() if line.strip()]
    return len(nonempty) >= 2 and nonempty[0] == SAVE_OPENER and nonempty[1] == f"Using GTM workspace: {root_name}"


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


def grouped_shape_ok(turns: list[tuple[str, str]]) -> tuple[bool, str]:
    problems: list[str] = []
    for index, text in enumerate((text for role, text in turns if role == "Assistant"), start=1):
        problems.extend(message_shape_problems(text, index))
    return not problems, f"grouped-shape problems={problems!r}"


def intake_window(turns: list[tuple[str, str]]) -> tuple[list[str | None], list[str], bool]:
    """Bold leads of the assistant turns from the intake question up to the proposal, and whether that proposal exists."""
    starts = [index for index, (role, text) in enumerate(turns) if role == "Assistant" and bold_question(text) == INTAKE_QUESTION]
    if len(starts) != 1:
        return [], [], False
    window: list[str] = []
    for role, text in turns[starts[0] :]:
        if role != "Assistant":
            continue
        if text.lstrip().startswith(SAVE_OPENER):
            return [bold_question(item) for item in window], window, True
        window.append(text)
    return [bold_question(item) for item in window], window, False


def intake_has_bullets(text: str) -> bool:
    return all(prefix in text for prefix in INTAKE_BULLETS) and "Only the organization name is required" in text


def fenced(text: str) -> bool:
    return "```" in text


def closes_saved(run_dir: Path) -> bool:
    final = run_dir / "outputs" / "final.md"
    text = final.read_text(errors="replace").rstrip() if final.is_file() else ""
    if not text:
        turns = assistant_turns(run_dir)
        text = turns[-1].rstrip() if turns else ""
    return text.endswith("Saved.") or "Saved." in text.splitlines()[-3:] if text else False


def content_flow_turns(run_dir: Path) -> list[str]:
    """Assistant turns under the plumbing-language ban: everything before the sharing step, minus the guided menu."""
    values = []
    for text in assistant_turns(run_dir):
        if MENU_QUESTION in text:
            continue
        if SHARING_QUESTION in text:
            break
        values.append(text)
    return values


def banned_language(run_dir: Path, *, paths: bool = True) -> tuple[bool, str]:
    hits: list[str] = []
    for index, text in enumerate(content_flow_turns(run_dir), start=1):
        for match in BANNED_WORDS.finditer(text):
            hits.append(f"turn {index}: {match.group(0)!r}")
        if paths:
            for match in BANNED_PATHS.finditer(text):
                hits.append(f"turn {index}: path {match.group(0).strip()!r}")
    return not hits, f"banned-language hits={hits[:12]!r}"


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


def completion_request_check(output: str, request: str) -> bool:
    context_statement = re.search(
        r"(?is)(?:will|I'll|I’ll).{0,100}\buse\b.{0,100}\bsaved\b.{0,60}\bGTM workspace\b|"
        r"\buse\b.{0,100}\bsaved\b.{0,60}\bGTM workspace\b",
        output,
    )
    return request in output and context_statement is not None


def proposal_text(turns: list[tuple[str, str]]) -> str:
    return "\n".join(proposal_turns(turns))


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
        "artifact proposals": proposal_text(turns),
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


def changed_paths(repo: Path) -> list[str]:
    return [line for line in git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").splitlines() if line]


def checks_for(name: str, snapshot: Path, run_dir: Path) -> list[tuple[bool, str]]:
    root = snapshot / ".gtm"
    turns, alternating = conversation_turns(run_dir)
    output = user_output(run_dir)
    assistant = "\n".join(assistant_turns(run_dir))
    proposals = proposal_turns(turns)
    proposal = proposals[-1] if proposals else ""
    shape = grouped_shape_ok(turns)

    if name == "create-simple-local":
        repo = root / "acme-lantern"; org = repo / "ORG.md"; member = repo / "members/maria-chen/MEMBER.md"
        org_text = org.read_text().lower() if org.is_file() else ""
        leads, window, has_proposal = intake_window(turns)
        sharing = question_turn(turns, SHARING_QUESTION) or ""
        language = banned_language(run_dir)
        return [
            result(has_contract(repo) and org.is_file(), "Compared all three root files byte-for-byte with templates and checked ORG.md."),
            result(org.is_file() and org.read_text().startswith("# Acme Lantern") and "scheduling" in org_text and ("plumb" in org_text or "electric" in org_text), "Checked the org H1 and normalized stems for the supplied scheduling and plumbing/electrical market facts."),
            result(member.is_file() and "- Email: maria@acme-lantern.example" in member.read_text() and root_members_only(repo) and "Suborganizations:" not in member.read_text(), "Checked Maria's canonical root member path, email, and absence of invented affiliation."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1 and git(repo, "config", "--local", "user.email") == "maria@acme-lantern.example", "Checked main, exactly one history entry, and repo-local operator email."),
            result(not git(repo, "remote") and no_machine_state(repo), "Checked no remotes and scanned the artifact for machine state/placeholders."),
            result(alternating and has_proposal and leads == [INTAKE_QUESTION] and intake_has_bullets(window[0]) and shape[0], f"Intake window leads={leads!r}; proposal followed={has_proposal}; alternating={alternating}; {shape[1]}"),
            result(len(proposals) == 1 and context_line_under_opener(proposal, "Acme Lantern") and SETUP_FILES_PHRASE in proposal and "Maria Chen (Acme Lantern)" in proposal and not fenced(assistant) and language[0], f"Checked proposal opener, context line, setup-files phrase, member identity, no fences; {language[1]}"),
            result(all(term in sharing.lower() for term in ("local", "single-player", "multiplayer", "private", "github")), "Checked all five required sharing terms in the exact sharing-question turn."),
            result(completion_request_check(output, "Define the ideal customer profile for Acme Lantern.") and "Saved." in output, "Checked the exact ICP fallback request, the `Saved.` close, and the saved-context statement."),
        ]
    if name == "create-complex-bulk":
        repo = root / "meridian-holdings"
        found_members = {p.parent.name: p for p in member_files(repo)}
        leads, window, has_proposal = intake_window(turns)
        language = banned_language(run_dir)
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
        identities = (
            "Meridian Cloud (Meridian Holdings)",
            "Meridian Cloud Europe (Meridian Holdings › Meridian Cloud)",
            "Meridian Home (Meridian Holdings)",
            "Devon Price (Meridian Holdings)",
            "Priya Shah (Meridian Holdings › Meridian Cloud › Meridian Cloud Europe)",
            "Leo Martins (Meridian Holdings › Meridian Home)",
        )
        return [
            result(has_contract(repo) and canonical_org_tree(repo) and all((repo / path).is_file() for path in organization_paths), "Checked the root, two direct suborganizations, and recursively nested Europe ORG.md files."),
            result(set(found_members) == set(member_paths) and all(path.is_file() and "- Email:" in path.read_text() for path in member_paths.values()) and canonical_member_paths(repo) and no_legacy_layout(repo), "Checked exact root, direct-suborganization, and recursively nested MEMBER.md paths with no legacy layout."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1 and git(repo, "config", "--local", "user.email") == "devon@meridian-holdings.example", "Checked main, exactly one history entry, and Devon's repo-local identity."),
            result(not git(repo, "remote"), "Checked that no remote remains after multiplayer was declined."),
            result(no_machine_state(repo), "Scanned for empty directories, placeholder markers, logs, temp content, and state.json."),
            result(alternating and has_proposal and leads == [INTAKE_QUESTION] and intake_has_bullets(window[0]) and shape[0], f"Intake window leads={leads!r}; proposal followed={has_proposal}; {shape[1]}"),
            result(len(proposals) == 1 and SETUP_FILES_PHRASE in proposal and all(identity in proposal for identity in identities) and not fenced(assistant) and language[0], f"Checked one proposal with the setup-files phrase and every identity, no fences; {language[1]}"),
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
        language = banned_language(run_dir)
        was_now = re.search(r"was Sales Lead.{0,20}now VP Sales", proposal, re.S) is not None
        return [
            result("- Email: casey@ember-health.example" in text and "- Role: VP Sales" in text and "Sales Lead" not in text, "Checked preserved email and exact role replacement."),
            result("## Links" in text and "https://www.linkedin.com/in/casey-lee-example" in text, "Checked accepted LinkedIn URL under a Links section."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2, "Checked main and exactly one commit beyond the seed."),
            result(len(member_files(repo)) == 1 and root_members_only(repo) and no_legacy_layout(repo) and not (repo / "suborgs").exists() and no_machine_state(repo) and not git(repo, "remote"), "Checked no new entity, legacy path, state, or remote."),
            result(len(proposals) == 1 and context_line_under_opener(proposal, "Ember Health") and "Casey Lee (Ember Health)" in proposal and was_now and "linkedin" in proposal.lower() and not fenced(assistant) and closes_saved(run_dir) and language[0] and shape[0], f"Checked proposal shape, identity, `was X, now Y`, link, no fences, `Saved.` close; {language[1]}; {shape[1]}"),
        ]
    if name == "delete-a-suborg":
        repo = root / "northstar-group"; member = repo / "members/amina-yusuf/MEMBER.md"; text = member.read_text() if member.exists() else ""
        identities = (
            "Northstar Consumer (Northstar Group)",
            "Northstar Youth (Northstar Group › Northstar Consumer)",
            "Layla Chen (Northstar Group › Northstar Consumer)",
            "Family Learning (Northstar Group › Northstar Consumer)",
            "Household Buyer (Northstar Group › Northstar Consumer)",
            "Noah Okafor (Northstar Group › Northstar Consumer › Northstar Youth)",
            "Teen Program Director (Northstar Group › Northstar Consumer › Northstar Youth)",
        )
        language = banned_language(run_dir)
        return [
            result(not (repo / "suborgs/consumer").exists() and (repo / "suborgs/enterprise/ORG.md").is_file() and (repo / "ORG.md").is_file(), "Checked Consumer subtree absence and Enterprise/root survival."),
            result("enterprise" in text and "consumer" not in text.lower() and "youth" not in text.lower(), "Checked affiliation cleanup while preserving Enterprise."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2, "Checked main and exactly one deletion commit beyond seed."),
            result(bool(git(repo, "remote", "get-url", "origin")) and "northstar-group.git" in git(repo, "remote", "get-url", "origin"), "Checked that origin remains configured to the seeded remote."),
            result(len(proposals) == 1 and all(identity in proposal for identity in identities) and language[0] and shape[0], f"Checked the proposal for every owned identity; {language[1]}; {shape[1]}"),
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
            and "Describe durable changes" in agents
        )
        return [
            result(contract_restored, "Checked all root contract files, exact CLAUDE.md bytes, and the required node-owned/main/describe-before-write AGENTS.md semantics."),
            result(europe.is_file() and europe.read_text().startswith("# ") and "serves manufacturers in the European Union" in europe.read_text(), "Checked restored H1 and preserved overview."),
            result(member.is_file() and "sam@atlas-labs.example" in member.read_text() and canonical_member_paths(repo) and no_legacy_layout(repo), "Checked the in-place Europe legacy migration to canonical MEMBER.md and removal of all legacy paths."),
            result(not (repo / "state.json").exists() and not (repo / "suborgs/europe/empty-notes").exists(), "Checked seeded state file and empty directory removal."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and git(repo, "log", "-1", "--pretty=%s") == "Repair GTM workspace repo", "Checked main, exactly one repair commit, and exact repair message."),
        ]
    if name == "doctor-root-workflow-project":
        repo = root / "solstice-freight"
        lower = output.lower()
        expected_paths = (
            "workflows/package.json",
            "workflows/package-lock.json",
            "workflows/workflows/account-health.ts",
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
        no_repair = "repair proposal" not in lower and SAVE_OPENER not in output and "repair gtm workspace repo" not in lower
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
        lower = output.lower()
        unchanged = (
            git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1
            and not git(repo, "status", "--porcelain")
            and (repo / "suborgs/europe/workflows/package.json").is_file()
            and (repo / "suborgs/europe/workflows/workflows/account-health.ts").is_file()
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
            result(not researched and delta_draft is None, "Checked every produced text artifact plus executor tool calls for absence of a Delta draft or external research."),
        ]
    if name == "hosted-update-proceeds":
        repo = root / "northwind-gtm"
        member = repo / "members/rae-santos/MEMBER.md"
        text = member.read_text() if member.is_file() else ""
        lower = output.lower()
        commands = executor_commands(run_dir)
        pushed = any(re.search(r"\bgit\b.*\bpush\b", command, re.I | re.S) for command in commands)
        persisted = (
            git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 3
            and not git(repo, "status", "--porcelain")
            and git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD") == "members/rae-santos/MEMBER.md"
        )
        remote_problem = any(
            phrase in lower
            for phrase in ("missing remote", "remote is missing", "remote problem", "remote defect", "failed to push")
        )
        language = banned_language(run_dir)
        return [
            result("- Email: rae@northwind-gear.example" in text and "- Role: VP Sales" in text and "Head of Sales" not in text, "Checked preserved email and exact role replacement."),
            result("## Links" in text and "https://www.linkedin.com/in/rae-santos-example" in text, "Checked the accepted LinkedIn URL under Links."),
            result(persisted, "Checked main, a clean tree, exactly one new commit, and no unrelated path in that commit."),
            result(not git(repo, "remote") and not pushed and "failed to push" not in lower, "Checked that no remote was added, no git push command ran, and no push failure was reported."),
            result(not remote_problem and "Rae Santos (Northwind Gear)" in assistant_turns(run_dir)[-1] and closes_saved(run_dir) and language[0], f"Checked no remote-problem language, the identity plus `Saved.` close; {language[1]}"),
        ]
    if name == "hosted-save-failure-recovery":
        repo = root / "northwind-gtm"
        fixture = REPO_ROOT / "evals/gtm-workspace/fixtures/hosted-connected/home/.gtm/northwind-gtm"
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
        was_now = re.search(r"was Head of Sales.{0,20}now VP Sales", proposal, re.S) is not None
        no_persistence_attempt = not git(repo, "remote") and not attempted_git_write(commands)
        return [
            result(unchanged, "Compared every non-git byte with the fixture and checked a clean, exact two-entry history."),
            result(negative_save, "Checked that the response explains the durable-save failure and never reports successful persistence."),
            result(formatted_recovery and not used_ask_user_question, "Checked a direct bold recovery question, recommended CLI-at-a-keyboard option first, cancel second, exact reply line, and no AskUserQuestion call."),
            result(no_persistence_attempt, "Checked that no commit, push, or remote mutation was attempted after the declared durable-save failure."),
            result(len(proposals) == 1 and was_now and "https://www.linkedin.com/in/rae-santos-example" in proposal and "cancel" in lower, "Checked the `was X, now Y` proposal with the link before the user canceled recovery."),
        ]
    if name == "create-bundled-recovery":
        repo = root / "copperline-systems"
        org = repo / "ORG.md"
        suborg = repo / "suborgs/copperline-enterprise/ORG.md"
        operator = repo / "members/taylor-kim/MEMBER.md"
        member = repo / "suborgs/copperline-enterprise/members/nora-patel/MEMBER.md"
        menu = next((text for role, text in turns if role == "Assistant" and f"**{MENU_QUESTION}**" in text), "")
        leads, window, has_proposal = intake_window(turns)
        recovery = window[1] if len(window) >= 2 else ""
        recovery_lines = [line.strip() for line in recovery.splitlines() if line.strip()]
        composed_recovery = (
            bold_question(recovery) == ROOT_NAME_RECOVERY
            and any(line.lstrip("-* ").strip() == SUBORG_NAMES_RECOVERY for line in recovery_lines)
            and any(line.lstrip("-* ").strip() == MEMBER_BOTH_RECOVERY for line in recovery_lines)
            and f"**{SUBORG_NAMES_RECOVERY}**" not in recovery
            and f"**{MEMBER_BOTH_RECOVERY}**" not in recovery
        )
        all_questions = [bold_question(text) for role, text in turns if role == "Assistant"]
        standalone_follow_up = any(
            question and any(term in question.lower() for term in ("affiliat", "which organization should own", "role", "social profile"))
            for question in all_questions
        )
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
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 1
        )
        identities = (
            "Copperline Enterprise (Copperline Systems)",
            "Taylor Kim (Copperline Systems)",
            "Nora Patel (Copperline Systems › Copperline Enterprise)",
        )
        return [
            result(artifact_ok, "Checked contract files, root/suborganization artifacts, root and suborganization member ownership, emails, main, and one history entry."),
            result(alternating and menu_ok, f"Checked exact menu explanation, question, representative organization-aware choices, and turn alternation ({alternating})."),
            result(has_proposal and leads == [INTAKE_QUESTION, ROOT_NAME_RECOVERY] and intake_has_bullets(window[0]) and composed_recovery, f"Intake window leads={leads!r}; composed recovery={composed_recovery}; proposal followed={has_proposal}."),
            result(not standalone_follow_up and shape[0], f"Checked for no standalone owner/affiliation/role/optional-field question; {shape[1]}"),
            result(len(proposals) == 1 and SETUP_FILES_PHRASE in proposal and "Copperline Systems" in proposal and all(identity in proposal for identity in identities) and not fenced(assistant), "Checked the proposal for the organization, setup-files phrase, every identity, and no fences."),
            result(completion_request_check(output, "Define the ideal customer profile for Copperline Systems."), "Checked the exact recognized ICP request, saved display name, and saved-context statement."),
        ]
    if name == "create-unrecognized-workflow-fallback":
        repo = root / "pine-harbor"
        org = repo / "ORG.md"
        member = repo / "members/iris-wong/MEMBER.md"
        artifact_ok = (
            has_contract(repo)
            and org.is_file()
            and org.read_text().startswith("# Pine Harbor")
            and member.is_file()
            and "- Email: iris@pine-harbor.example" in member.read_text()
            and root_members_only(repo)
            and no_legacy_layout(repo)
            and git(repo, "branch", "--show-current") == "main"
            and int(git(repo, "rev-list", "--count", "HEAD") or 0) >= 1
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
    if name == "batch-add-members":
        repo = root / "ember-health"
        casey = repo / "members/casey-lee/MEMBER.md"
        fixture_casey = REPO_ROOT / "evals/gtm-workspace/fixtures/batch-add-members/home/.gtm/ember-health/members/casey-lee/MEMBER.md"
        members = {
            "Priya Nair": (repo / "members/priya-nair/MEMBER.md", "priya@ember-health.example", "Head of Marketing"),
            "Tom Adeyemi": (repo / "members/tom-adeyemi/MEMBER.md", "tom@ember-health.example", "Customer Success Lead"),
            "Jordan Reyes": (repo / "members/jordan-reyes/MEMBER.md", "jordan@ember-health.example", None),
        }
        identities = [f"{name} (Ember Health)" for name in members]
        files_ok = all(
            path.is_file()
            and path.read_text().startswith(f"# {name}")
            and f"- Email: {email}" in path.read_text()
            and (role is None or f"- Role: {role}" in path.read_text())
            for name, (path, email, role) in members.items()
        )
        expected_paths = sorted(path.relative_to(repo).as_posix() for path, _, _ in members.values())
        questions = [bold_question(text) for role, text in turns if role == "Assistant" and bold_question(text)]
        language = banned_language(run_dir)
        return [
            result(not any(question and question != SAVE_OPENER.strip("*") for question in questions), f"Checked that no question was asked before the proposal; questions={questions!r}."),
            result(len(proposals) == 1 and context_line_under_opener(proposal, "Ember Health") and all(identity in proposal for identity in identities) and "priya@ember-health.example" in proposal and not fenced(assistant), "Checked one proposal with the context line, every member identity with email, and no fences."),
            result(files_ok and casey.is_file() and casey.read_bytes() == fixture_casey.read_bytes(), "Checked the three canonical member files, emails, roles, and Casey's unchanged bytes."),
            result(git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 2 and sorted(changed_paths(repo)) == expected_paths and not git(repo, "status", "--porcelain"), "Checked exactly one commit beyond the seed changing exactly the three member paths."),
            result(all(identity in assistant_turns(run_dir)[-1] for identity in identities) and closes_saved(run_dir) and language[0] and shape[0], f"Checked the three-identity `Saved.` close; {language[1]}; {shape[1]}"),
        ]
    if name == "hosted-native-approval-update":
        repo = root / "northwind-gtm"
        member = repo / "members/rae-santos/MEMBER.md"
        text = member.read_text() if member.is_file() else ""
        records = approvals(snapshot)
        summary = records[0].get("summary", "") if len(records) == 1 and isinstance(records[0].get("summary"), str) else ""
        lines = [line.strip() for line in summary.splitlines() if line.strip()]
        identity = "Rae Santos (Northwind Gear)"
        numbered_save_block = re.search(r"(?m)^1\.\s*(?:Save|Accept)", assistant) is not None
        commands = executor_commands(run_dir)
        pushed = any(re.search(r"\bgit\b.*\bpush\b", command, re.I | re.S) for command in commands)
        language = banned_language(run_dir)
        return [
            result(len(records) == 1 and bool(summary.strip()), f"Checked the stand-in control log for exactly one record with a summary; records={len(records)}."),
            result(bool(lines) and lines[0] == "For Northwind Gear:" and lines[-1] == SAVE_CLOSING, f"Checked the summary's first and last lines: {lines[:1]!r} … {lines[-1:]!r}."),
            result(identity in summary and re.search(r"was Head of Sales.{0,20}now VP Sales", summary, re.S) is not None and "linkedin" in summary.lower() and plain_text(summary), "Checked identity, `was X, now Y`, link, and plain-text shape of the summary."),
            result(SAVE_OPENER not in assistant and "Accept and save" not in assistant and "Would you like to save" not in assistant and not numbered_save_block, "Checked that no proposal message or numbered accept block appeared in the transcript."),
            result("- Email: rae@northwind-gear.example" in text and "- Role: VP Sales" in text and "Head of Sales" not in text and "https://www.linkedin.com/in/rae-santos-example" in text and git(repo, "branch", "--show-current") == "main" and int(git(repo, "rev-list", "--count", "HEAD") or 0) == 3 and not git(repo, "status", "--porcelain") and changed_paths(repo) == ["members/rae-santos/MEMBER.md"], "Checked the file written through the control and one clean scoped commit."),
            result(identity in assistant_turns(run_dir)[-1] and closes_saved(run_dir) and "apply_gtm_workspace_changes" not in assistant and not pushed and language[0], f"Checked the identity plus `Saved.` close without path, commit, push, or tool name; {language[1]}"),
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
