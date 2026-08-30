#!/usr/bin/env python3
"""Check installable skill contracts in the two supported loader shapes."""

from __future__ import annotations

import re
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit


REPO_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = REPO_ROOT / "skills"
LOADER_ROOTS = (Path(".agents/skills"), Path(".claude/skills"))
CONTRACT_FIELDS = ("Reads", "Writes", "Outputs", "Approval", "Persists", "Handoff")
FRONTMATTER = re.compile(r"\A---\n(?P<body>.*?)\n---\n", re.DOTALL)
FIELD = re.compile(r"^(?P<key>[A-Za-z][A-Za-z0-9_-]*):\s*(?P<value>.+?)\s*$")
LINK = re.compile(r"!?\[[^\]]*\]\((?P<target>[^)]+)\)")
COMPANY_DATA_FIELDS = (
    "Business types",
    "Industries",
    "Subindustries",
    "Revenue streams",
    "Annual revenue",
    "Company size",
    "Company type",
    "Description",
    "Domain",
    "Employees",
    "Location",
    "Products and services",
    "Tech stack",
)
COMPANY_DATA_FILES = (
    Path("gtm-workspace/references/company-data.md"),
    Path("gtm-workspace/templates/AGENTS.md"),
    Path("gtm-workspace/templates/org.md"),
    Path("gtm-icp/templates/icp.md"),
)
PERSON_DATA_FIELDS = (
    "Full name",
    "Education",
    "Estimated followers",
    "Experience",
    "Languages",
    "Location",
    "Network size",
    "Professional profile",
)
PERSON_DATA_FILES = (
    Path("gtm-workspace/references/person-data.md"),
    Path("gtm-workspace/templates/AGENTS.md"),
    Path("gtm-workspace/templates/MEMBER.md"),
    Path("gtm-persona/templates/persona.md"),
)


def parse_frontmatter(skill_md: Path, errors: list[str]) -> dict[str, str]:
    text = skill_md.read_text()
    match = FRONTMATTER.match(text)
    if not match:
        errors.append(f"{skill_md}: missing or malformed frontmatter")
        return {}

    fields: dict[str, str] = {}
    for line in match.group("body").splitlines():
        parsed = FIELD.match(line)
        if parsed:
            fields[parsed.group("key")] = parsed.group("value").strip("'\"")
    if not fields.get("name"):
        errors.append(f"{skill_md}: frontmatter has no name")
    if not fields.get("description"):
        errors.append(f"{skill_md}: frontmatter has no description")
    return fields


def check_contract(skill_md: Path, errors: list[str]) -> None:
    text = skill_md.read_text()
    start = text.find("**Contract**")
    end = text.find("\n## Inputs")
    if start == -1 or end == -1 or start > end:
        errors.append(f"{skill_md}: Contract block must appear in Scope before Inputs")
        return

    block = text[start:end]
    found = tuple(
        match.group(1)
        for line in block.splitlines()
        if (match := re.match(r"^\|\s*([^|]+?)\s*\|", line))
        and match.group(1) not in {"Field", "---"}
    )
    if found != CONTRACT_FIELDS:
        errors.append(
            f"{skill_md}: Contract fields are {found!r}; expected {CONTRACT_FIELDS!r}"
        )


def check_links(skill_md: Path, errors: list[str]) -> None:
    for match in LINK.finditer(skill_md.read_text()):
        raw_target = match.group("target").strip()
        if raw_target.startswith("<") and raw_target.endswith(">"):
            raw_target = raw_target[1:-1]
        target = raw_target.split(maxsplit=1)[0]
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or target.startswith("#"):
            continue
        relative = unquote(parsed.path)
        if relative and not (skill_md.parent / relative).exists():
            errors.append(f"{skill_md}: unresolved reference {target}")


def check_skill(skill_dir: Path, errors: list[str]) -> None:
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        errors.append(f"{skill_dir}: missing SKILL.md")
        return
    fields = parse_frontmatter(skill_md, errors)
    if fields.get("name") != skill_dir.name:
        errors.append(
            f"{skill_md}: frontmatter name {fields.get('name')!r} does not match {skill_dir.name!r}"
        )
    check_contract(skill_md, errors)
    check_links(skill_md, errors)


def company_data_fields(path: Path) -> tuple[str, ...]:
    text = path.read_text()
    if path.name != "company-data.md":
        section = re.search(
            r"^## Company data(?: contract)?\n(?P<body>.*?)(?=^## |\Z)",
            text,
            re.DOTALL | re.MULTILINE,
        )
        if not section:
            return ()
        text = section.group("body")
    if path.name in {"org.md", "icp.md"}:
        matches = re.findall(r"^- \*\*(.+?):\*\*", text, re.MULTILINE)
    else:
        matches = re.findall(r"^\d+\. \*\*(.+?)\*\*(?::|$)", text, re.MULTILINE)
    return tuple(matches)


def check_company_data_contract(skills_root: Path, errors: list[str]) -> None:
    for relative in COMPANY_DATA_FILES:
        path = skills_root / relative
        if not path.is_file():
            errors.append(f"{path}: missing company-data contract file")
            continue
        fields = company_data_fields(path)
        if fields != COMPANY_DATA_FIELDS:
            errors.append(
                f"{path}: company-data fields are {fields!r}; expected {COMPANY_DATA_FIELDS!r}"
            )

    required_template_fragments = (
        "**Estimated:**",
        "**Lower bound:**",
        "**Upper bound:**",
        "**City:**",
        "**Country:**",
        "**Country code:**",
        "**Headquarters:**",
        "**Postal code:**",
        "**Region:**",
        "**State or province:**",
        "**Categories:**",
        "**Products:**",
        "**Vendors:**",
    )
    for relative in (Path("gtm-workspace/templates/org.md"), Path("gtm-icp/templates/icp.md")):
        path = skills_root / relative
        if not path.is_file():
            continue
        text = path.read_text()
        for fragment in required_template_fragments:
            if fragment not in text:
                errors.append(f"{path}: company-data template is missing {fragment}")
        if text.count("**Estimated:**") != 2:
            errors.append(f"{path}: annual revenue and employees must each track estimated status")

    pointer_checks = {
        Path("gtm-workspace/SKILL.md"): "references/company-data.md",
        Path("gtm-workspace/references/contract.md"): "(company-data.md)",
        Path("gtm-workspace/references/flows.md"): "company-data.md",
        Path("gtm-icp/SKILL.md"): "../gtm-workspace/references/company-data.md",
        Path("gtm-icp/references/contract.md"): "../../gtm-workspace/references/company-data.md",
        Path("gtm-icp/references/flows.md"): "company-data.md",
    }
    for relative, pointer in pointer_checks.items():
        path = skills_root / relative
        if not path.is_file() or pointer not in path.read_text():
            errors.append(f"{path}: missing company-data contract pointer {pointer!r}")


def person_data_fields(path: Path) -> tuple[str, ...]:
    text = path.read_text()
    if path.name != "person-data.md":
        section = re.search(
            r"^## Person data(?: contract)?\n(?P<body>.*?)(?=^## |\Z)",
            text,
            re.DOTALL | re.MULTILINE,
        )
        if not section:
            return ()
        text = section.group("body")
    if path.name.lower() in {"member.md", "persona.md"}:
        matches = re.findall(r"^- \*\*(.+?):\*\*", text, re.MULTILINE)
    else:
        matches = re.findall(r"^\d+\. \*\*(.+?)\*\*(?::|$)", text, re.MULTILINE)
    return tuple(matches)


def check_person_data_contract(skills_root: Path, errors: list[str]) -> None:
    for relative in PERSON_DATA_FILES:
        path = skills_root / relative
        if not path.is_file():
            errors.append(f"{path}: missing person-data contract file")
            continue
        fields = person_data_fields(path)
        if fields != PERSON_DATA_FIELDS:
            errors.append(
                f"{path}: person-data fields are {fields!r}; expected {PERSON_DATA_FIELDS!r}"
            )

    required_template_fragments = (
        "**Activities:**",
        "**Degree:**",
        "**Description:**",
        "**Field of study:**",
        "**School name:**",
        "**Company name:**",
        "**Employment type:**",
        "**Experience description:**",
        "**Current-role status:**",
        "**Job title:**",
        "**Display location:**",
        "**Seniority:**",
        "**Years of experience:**",
        "**About:**",
        "**Headline:**",
    )
    for relative in (
        Path("gtm-workspace/templates/MEMBER.md"),
        Path("gtm-persona/templates/persona.md"),
    ):
        path = skills_root / relative
        if not path.is_file():
            continue
        text = path.read_text()
        for fragment in required_template_fragments:
            if fragment not in text:
                errors.append(f"{path}: person-data template is missing {fragment}")
        for repeated in (
            "**End date:**",
            "**Start date:**",
            "**City:**",
            "**Country:**",
            "**Region:**",
            "**State:**",
        ):
            if text.count(repeated) != 2:
                errors.append(
                    f"{path}: education/experience or nested/top-level location must each include {repeated}"
                )

    member_template = skills_root / "gtm-workspace/templates/MEMBER.md"
    if member_template.is_file() and "- Email:" not in member_template.read_text():
        errors.append(f"{member_template}: member template is missing its Email identifier")
    persona_template = skills_root / "gtm-persona/templates/persona.md"
    if persona_template.is_file() and "Email" in persona_template.read_text():
        errors.append(f"{persona_template}: persona template must not include Email")

    pointer_checks = {
        Path("gtm-workspace/SKILL.md"): "references/person-data.md",
        Path("gtm-workspace/references/contract.md"): "(person-data.md)",
        Path("gtm-workspace/references/flows.md"): "person-data.md",
        Path("gtm-persona/SKILL.md"): "../gtm-workspace/references/person-data.md",
        Path("gtm-persona/references/contract.md"): "../../gtm-workspace/references/person-data.md",
        Path("gtm-persona/references/flows.md"): "person-data.md",
    }
    for relative, pointer in pointer_checks.items():
        path = skills_root / relative
        if not path.is_file() or pointer not in path.read_text():
            errors.append(f"{path}: missing person-data contract pointer {pointer!r}")


def main() -> int:
    errors: list[str] = []
    skill_dirs = sorted(path for path in SKILLS_ROOT.iterdir() if path.is_dir())
    if not skill_dirs:
        errors.append("skills/ contains no installable skills")

    for skill_dir in skill_dirs:
        check_skill(skill_dir, errors)
    check_company_data_contract(SKILLS_ROOT, errors)
    check_person_data_contract(SKILLS_ROOT, errors)

    with tempfile.TemporaryDirectory(prefix="gtm-skill-loaders-") as temporary:
        install_root = Path(temporary)
        for loader_root in LOADER_ROOTS:
            for skill_dir in skill_dirs:
                installed = install_root / loader_root / skill_dir.name
                shutil.copytree(skill_dir, installed)
            for skill_dir in skill_dirs:
                installed = install_root / loader_root / skill_dir.name
                check_skill(installed, errors)
            check_company_data_contract(install_root / loader_root, errors)
            check_person_data_contract(install_root / loader_root, errors)

    if errors:
        print("Skill compatibility check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"Skill compatibility is valid: {len(skill_dirs)} skills across "
        f"{len(LOADER_ROOTS)} offline loader shapes."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
