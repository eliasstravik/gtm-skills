#!/usr/bin/env python3
"""Check that a GTM Context Repository has the expected scaffold shape."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
from typing import Any

from gtm_validation_common import ValidationProblem, YamlLoadError, is_kebab_id, load_yaml_file


REQUIRED_FILES = ["AGENTS.md", "CLAUDE.md", "gtm.yaml", "organization.md", ".gitignore"]
REQUIRED_DIRS = ["business-units", "teams", "people", "workspaces"]
REQUIRED_GITIGNORE_RULES = [
    ".gtm.local.json",
    ".gtm.local.yaml",
    ".local/",
    "CLAUDE.local.md",
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "outputs/",
    "research/",
    "tmp/",
    "*.tmp",
    "*.log",
    ".DS_Store",
]
ENTITY_COLLECTIONS = ["business_units", "teams", "people", "workspaces"]
FORBIDDEN_ACTIVE_STATE_KEYS = {
    "active_project",
    "active_person",
    "active_workspace",
    "current_project",
    "current_person",
    "current_workspace",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo", type=Path, help="GTM Context Repository path to check")
    parser.add_argument("--quiet", action="store_true", help="print only failures")
    args = parser.parse_args(argv)

    repo = args.repo.resolve()
    problems = check_scaffold(repo)
    if problems:
        print(f"GTM scaffold check failed for {repo}:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem.format(repo)}", file=sys.stderr)
        return 1
    if not args.quiet:
        print(f"GTM scaffold OK: {repo}")
    return 0


def check_scaffold(repo: Path) -> list[ValidationProblem]:
    problems: list[ValidationProblem] = []
    if not repo.exists():
        return [ValidationProblem(repo, "path does not exist")]
    if not repo.is_dir():
        return [ValidationProblem(repo, "path is not a directory")]

    for relative in REQUIRED_FILES:
        _require_file(repo, relative, problems)
    for relative in REQUIRED_DIRS:
        _require_dir(repo, relative, problems)

    _check_claude_shim(repo, problems)
    _check_gitignore(repo, problems)

    gtm_yaml_path = repo / "gtm.yaml"
    try:
        data = load_yaml_file(gtm_yaml_path)
    except YamlLoadError as exc:
        problems.append(ValidationProblem(gtm_yaml_path, str(exc)))
        return problems

    if not isinstance(data, dict):
        problems.append(ValidationProblem(gtm_yaml_path, "gtm.yaml must be a mapping"))
        return problems

    _check_no_nulls(gtm_yaml_path, data, problems)
    _check_no_active_state(gtm_yaml_path, data, problems)
    _check_gtm_yaml(repo, gtm_yaml_path, data, problems)
    return problems


def _require_file(repo: Path, relative: str, problems: list[ValidationProblem]) -> None:
    path = repo / relative
    if not path.is_file():
        problems.append(ValidationProblem(path, "required scaffold file is missing"))


def _require_dir(repo: Path, relative: str, problems: list[ValidationProblem]) -> None:
    path = repo / relative
    if not path.is_dir():
        problems.append(ValidationProblem(path, "required scaffold directory is missing"))


def _check_claude_shim(repo: Path, problems: list[ValidationProblem]) -> None:
    path = repo / "CLAUDE.md"
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        problems.append(ValidationProblem(path, f"could not read file: {exc}"))
        return
    if "@AGENTS.md" not in text:
        problems.append(ValidationProblem(path, "CLAUDE.md must import AGENTS.md with '@AGENTS.md'"))


def _check_gitignore(repo: Path, problems: list[ValidationProblem]) -> None:
    path = repo / ".gitignore"
    if not path.is_file():
        return
    try:
        lines = {
            line.strip()
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
    except OSError as exc:
        problems.append(ValidationProblem(path, f"could not read file: {exc}"))
        return
    for rule in REQUIRED_GITIGNORE_RULES:
        if rule not in lines:
            problems.append(ValidationProblem(path, f"missing required ignore rule '{rule}'"))


def _check_gtm_yaml(repo: Path, path: Path, data: dict[str, Any], problems: list[ValidationProblem]) -> None:
    if data.get("version") != 1:
        problems.append(ValidationProblem(path, "version must be 1"))

    organization = data.get("organization")
    if not isinstance(organization, dict):
        problems.append(ValidationProblem(path, "organization must be a mapping"))
    else:
        _require_string(path, organization, "organization.id", problems)
        _require_string(path, organization, "organization.display_name", problems)
        org_id = organization.get("id")
        if isinstance(org_id, str) and not is_kebab_id(org_id):
            problems.append(ValidationProblem(path, "organization.id must be lowercase kebab-case"))

    default_workspace = data.get("default_workspace")
    if not isinstance(default_workspace, str) or not default_workspace:
        problems.append(ValidationProblem(path, "default_workspace must be a non-empty string"))

    collections: dict[str, dict[str, Any]] = {}
    for collection_name in ENTITY_COLLECTIONS:
        collection = data.get(collection_name)
        if not isinstance(collection, dict):
            problems.append(ValidationProblem(path, f"{collection_name} must be a map keyed by stable IDs"))
            collections[collection_name] = {}
            continue
        collections[collection_name] = collection
        for key, entry in collection.items():
            if not isinstance(key, str) or not is_kebab_id(key):
                problems.append(ValidationProblem(path, f"{collection_name} key '{key}' must be lowercase kebab-case"))
            if not isinstance(entry, dict):
                problems.append(ValidationProblem(path, f"{collection_name}.{key} must be a mapping"))

    _check_business_units(repo, path, collections["business_units"], problems)
    _check_teams(repo, path, collections["teams"], collections["business_units"], problems)
    _check_people(repo, path, collections["people"], collections["teams"], collections["workspaces"], problems)
    _check_workspaces(
        repo,
        path,
        collections["workspaces"],
        collections["business_units"],
        collections["teams"],
        default_workspace,
        problems,
    )


def _check_business_units(
    repo: Path, path: Path, business_units: dict[str, Any], problems: list[ValidationProblem]
) -> None:
    for unit_id, entry in business_units.items():
        if not isinstance(entry, dict):
            continue
        _require_string(path, entry, f"business_units.{unit_id}.display_name", problems)
        unit_path = _require_string(path, entry, f"business_units.{unit_id}.path", problems)
        if unit_path:
            _require_relative_existing_file(repo, path, unit_path, f"business_units.{unit_id}.path", problems)


def _check_teams(
    repo: Path,
    path: Path,
    teams: dict[str, Any],
    business_units: dict[str, Any],
    problems: list[ValidationProblem],
) -> None:
    for team_id, entry in teams.items():
        if not isinstance(entry, dict):
            continue
        _require_string(path, entry, f"teams.{team_id}.display_name", problems)
        team_path = _require_string(path, entry, f"teams.{team_id}.path", problems)
        if team_path:
            _require_relative_existing_file(repo, path, team_path, f"teams.{team_id}.path", problems)
        unit = entry.get("business_unit")
        if unit is not None and unit not in business_units:
            problems.append(ValidationProblem(path, f"teams.{team_id}.business_unit references unknown business unit '{unit}'"))


def _check_people(
    repo: Path,
    path: Path,
    people: dict[str, Any],
    teams: dict[str, Any],
    workspaces: dict[str, Any],
    problems: list[ValidationProblem],
) -> None:
    if not people:
        problems.append(ValidationProblem(path, "people must include at least one Person"))
    for person_id, entry in people.items():
        if not isinstance(entry, dict):
            continue
        _require_string(path, entry, f"people.{person_id}.display_name", problems)
        _require_string(path, entry, f"people.{person_id}.role", problems)
        person_path = _require_string(path, entry, f"people.{person_id}.path", problems)
        if person_path:
            _require_relative_existing_file(repo, path, person_path, f"people.{person_id}.path", problems)
        default_workspace = _require_string(path, entry, f"people.{person_id}.default_workspace", problems)
        if default_workspace and default_workspace not in workspaces:
            problems.append(
                ValidationProblem(
                    path,
                    f"people.{person_id}.default_workspace references unknown workspace '{default_workspace}'",
                )
            )
        team = entry.get("team")
        if team is not None and team not in teams:
            problems.append(ValidationProblem(path, f"people.{person_id}.team references unknown team '{team}'"))


def _check_workspaces(
    repo: Path,
    path: Path,
    workspaces: dict[str, Any],
    business_units: dict[str, Any],
    teams: dict[str, Any],
    default_workspace: Any,
    problems: list[ValidationProblem],
) -> None:
    if not workspaces:
        problems.append(ValidationProblem(path, "workspaces must include at least one GTM Workspace"))
    if isinstance(default_workspace, str) and default_workspace not in workspaces:
        problems.append(ValidationProblem(path, f"default_workspace '{default_workspace}' is not defined in workspaces"))

    for workspace_id, entry in workspaces.items():
        if not isinstance(entry, dict):
            continue
        _require_string(path, entry, f"workspaces.{workspace_id}.display_name", problems)
        workspace_path = _require_string(path, entry, f"workspaces.{workspace_id}.path", problems)
        if workspace_path:
            workspace_dir = _require_relative_existing_dir(repo, path, workspace_path, f"workspaces.{workspace_id}.path", problems)
            if workspace_dir is not None and not (workspace_dir / "context.md").is_file():
                problems.append(
                    ValidationProblem(workspace_dir / "context.md", f"workspace '{workspace_id}' is missing context.md")
                )
        unit = entry.get("business_unit")
        if unit is not None and unit not in business_units:
            problems.append(
                ValidationProblem(path, f"workspaces.{workspace_id}.business_unit references unknown business unit '{unit}'")
            )
        team = entry.get("team")
        if team is not None and team not in teams:
            problems.append(ValidationProblem(path, f"workspaces.{workspace_id}.team references unknown team '{team}'"))


def _require_string(
    path: Path, mapping: dict[str, Any], dotted_key: str, problems: list[ValidationProblem]
) -> str | None:
    key = dotted_key.split(".")[-1]
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        problems.append(ValidationProblem(path, f"{dotted_key} must be a non-empty string"))
        return None
    return value


def _require_relative_existing_file(
    repo: Path, yaml_path: Path, relative: str, dotted_key: str, problems: list[ValidationProblem]
) -> Path | None:
    resolved = _safe_relative_path(repo, yaml_path, relative, dotted_key, problems)
    if resolved is None:
        return None
    if not resolved.is_file():
        problems.append(ValidationProblem(resolved, f"{dotted_key} references a missing file"))
        return None
    return resolved


def _require_relative_existing_dir(
    repo: Path, yaml_path: Path, relative: str, dotted_key: str, problems: list[ValidationProblem]
) -> Path | None:
    resolved = _safe_relative_path(repo, yaml_path, relative, dotted_key, problems)
    if resolved is None:
        return None
    if not resolved.is_dir():
        problems.append(ValidationProblem(resolved, f"{dotted_key} references a missing directory"))
        return None
    return resolved


def _safe_relative_path(
    repo: Path, yaml_path: Path, relative: str, dotted_key: str, problems: list[ValidationProblem]
) -> Path | None:
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        problems.append(ValidationProblem(yaml_path, f"{dotted_key} must be a safe relative path"))
        return None
    return repo / candidate


def _check_no_nulls(path: Path, value: Any, problems: list[ValidationProblem], trail: str = "gtm.yaml") -> None:
    if value is None:
        problems.append(ValidationProblem(path, f"{trail} contains null; omit unknown optional fields instead"))
        return
    if isinstance(value, dict):
        for key, child in value.items():
            _check_no_nulls(path, child, problems, f"{trail}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _check_no_nulls(path, child, problems, f"{trail}[{index}]")


def _check_no_active_state(path: Path, data: dict[str, Any], problems: list[ValidationProblem]) -> None:
    for key in sorted(FORBIDDEN_ACTIVE_STATE_KEYS & set(data)):
        problems.append(ValidationProblem(path, f"{key} is Local GTM State and must not be committed in gtm.yaml"))


if __name__ == "__main__":
    raise SystemExit(main())
