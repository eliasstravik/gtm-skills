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


def main() -> int:
    errors: list[str] = []
    skill_dirs = sorted(path for path in SKILLS_ROOT.iterdir() if path.is_dir())
    if not skill_dirs:
        errors.append("skills/ contains no installable skills")

    for skill_dir in skill_dirs:
        check_skill(skill_dir, errors)

    with tempfile.TemporaryDirectory(prefix="gtm-skill-loaders-") as temporary:
        install_root = Path(temporary)
        for loader_root in LOADER_ROOTS:
            for skill_dir in skill_dirs:
                installed = install_root / loader_root / skill_dir.name
                shutil.copytree(skill_dir, installed)
                check_skill(installed, errors)

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
