#!/usr/bin/env python3
"""Enforce the repository's installable-skill seam."""

from __future__ import annotations

import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = REPO_ROOT / "skills"
EVALS_ROOT = REPO_ROOT / "evals"
NAME_LINE = re.compile(r"^name:\s*([^#]+?)\s*$", re.MULTILINE)


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def main() -> int:
    errors: list[str] = []
    skill_dirs = sorted(path for path in SKILLS_ROOT.iterdir() if path.is_dir())
    skill_names = {path.name for path in skill_dirs}

    if not skill_dirs:
        fail(errors, "skills/ contains no skill directories")

    for skill_dir in skill_dirs:
        if skill_dir.name.endswith("-workspace"):
            fail(errors, f"development workspace is inside skills/: {skill_dir.relative_to(REPO_ROOT)}")
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.is_file():
            fail(errors, f"missing SKILL.md: {skill_dir.relative_to(REPO_ROOT)}")
            continue
        match = NAME_LINE.search(skill_md.read_text())
        if not match:
            fail(errors, f"missing name frontmatter: {skill_md.relative_to(REPO_ROOT)}")
        elif match.group(1).strip("'\"") != skill_dir.name:
            fail(
                errors,
                f"frontmatter name does not match directory: {skill_md.relative_to(REPO_ROOT)}",
            )
        for forbidden in ("evals", "tests"):
            if (skill_dir / forbidden).exists():
                fail(errors, f"development directory inside shipping skill: {skill_dir.name}/{forbidden}")

    expected_skill_files = {path / "SKILL.md" for path in skill_dirs}
    actual_skill_files = set(REPO_ROOT.rglob("SKILL.md"))
    for unexpected in sorted(actual_skill_files - expected_skill_files):
        fail(errors, f"discoverable SKILL.md outside a skill root: {unexpected.relative_to(REPO_ROOT)}")

    if EVALS_ROOT.exists():
        for eval_dir in sorted(path for path in EVALS_ROOT.iterdir() if path.is_dir()):
            if eval_dir.name.startswith("_"):
                continue
            if eval_dir.name not in skill_names:
                fail(errors, f"eval directory has no matching skill: {eval_dir.relative_to(REPO_ROOT)}")
            if not (eval_dir / "evals.json").is_file():
                fail(errors, f"eval directory is missing evals.json: {eval_dir.relative_to(REPO_ROOT)}")

    if errors:
        print("Repository layout is invalid:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Repository layout is valid: {len(skill_dirs)} installable skill(s), evals outside skills/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
