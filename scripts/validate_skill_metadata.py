#!/usr/bin/env python3
"""Validate GTM skill frontmatter metadata against the project taxonomy."""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys
from typing import Any

from gtm_validation_common import (
    ValidationProblem,
    YamlLoadError,
    is_kebab_id,
    load_yaml_file,
    load_yaml_text,
)


NAME_RE = re.compile(r"^gtm-[a-z0-9]+(?:-[a-z0-9]+)*$")
REQUIRED_METADATA_FIELDS = {
    "function_tags",
    "role_tags",
    "requires_context",
    "composes",
    "output_mode",
    "supports",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="repository root to validate")
    parser.add_argument(
        "--taxonomy",
        type=Path,
        default=None,
        help="taxonomy YAML path; defaults to <repo>/docs/taxonomy.yaml",
    )
    parser.add_argument("--quiet", action="store_true", help="print only failures")
    args = parser.parse_args(argv)

    repo = args.repo.resolve()
    taxonomy_path = (args.taxonomy or repo / "docs" / "taxonomy.yaml").resolve()

    problems: list[ValidationProblem] = []
    taxonomy = _load_taxonomy(taxonomy_path, problems)
    skill_files = sorted((repo / "skills").glob("*/SKILL.md"))

    available_skill_names = {
        path.parent.name
        for path in skill_files
        if path.parent.is_dir() and path.parent.name.startswith("gtm-")
    }
    for skill_file in skill_files:
        problems.extend(_validate_skill_file(skill_file, repo, taxonomy, available_skill_names))

    if problems:
        print("Skill metadata validation failed:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem.format(repo)}", file=sys.stderr)
        return 1

    if not args.quiet:
        if skill_files:
            print(f"Validated {len(skill_files)} skill metadata file(s).")
        else:
            print(f"No skill metadata files found under {repo / 'skills'}; nothing to validate.")
    return 0


def _load_taxonomy(path: Path, problems: list[ValidationProblem]) -> dict[str, Any]:
    try:
        taxonomy = load_yaml_file(path)
    except YamlLoadError as exc:
        problems.append(ValidationProblem(path, str(exc)))
        return {}

    if not isinstance(taxonomy, dict):
        problems.append(ValidationProblem(path, "taxonomy must be a mapping"))
        return {}

    required = ["function_tags", "role_tags", "requires_context", "output_mode", "supports"]
    for field in required:
        if field not in taxonomy:
            problems.append(ValidationProblem(path, f"taxonomy missing required key '{field}'"))
    return taxonomy


def _validate_skill_file(
    path: Path, repo: Path, taxonomy: dict[str, Any], available_skill_names: set[str]
) -> list[ValidationProblem]:
    problems: list[ValidationProblem] = []
    try:
        frontmatter_text = _extract_frontmatter(path)
        data = load_yaml_text(frontmatter_text, path)
    except (OSError, ValueError, YamlLoadError) as exc:
        return [ValidationProblem(path, str(exc))]

    if not isinstance(data, dict):
        return [ValidationProblem(path, "frontmatter must be a mapping")]

    skill_name = _string_field(data, "name", path, problems)
    description = _string_field(data, "description", path, problems)
    if description is not None and not description.strip():
        problems.append(ValidationProblem(path, "description must be non-empty"))

    if skill_name is not None:
        if not NAME_RE.fullmatch(skill_name):
            problems.append(
                ValidationProblem(
                    path,
                    "name must be lowercase kebab-case, start with 'gtm-', and contain only letters, numbers, and hyphens",
                )
            )
        if skill_name != path.parent.name:
            problems.append(ValidationProblem(path, f"name '{skill_name}' must match folder '{path.parent.name}'"))

    metadata = data.get("metadata")
    if not isinstance(metadata, dict):
        problems.append(ValidationProblem(path, "metadata must be present and must be a mapping"))
        return problems

    missing = sorted(REQUIRED_METADATA_FIELDS - set(metadata))
    for field in missing:
        problems.append(ValidationProblem(path, f"metadata missing required field '{field}'"))

    _validate_list_field(
        metadata,
        "function_tags",
        _taxonomy_list(taxonomy, "function_tags"),
        path,
        problems,
        require_non_empty=True,
    )
    _validate_list_field(
        metadata,
        "role_tags",
        _taxonomy_list(taxonomy, "role_tags"),
        path,
        problems,
        require_non_empty=True,
    )
    _validate_list_field(
        metadata,
        "requires_context",
        sorted(_taxonomy_map(taxonomy, "requires_context")),
        path,
        problems,
        require_non_empty=False,
    )
    _validate_composes(metadata, path, problems, available_skill_names, skill_name)
    _validate_output_mode(metadata, path, taxonomy, problems)
    _validate_list_field(
        metadata,
        "supports",
        _taxonomy_list(taxonomy, "supports"),
        path,
        problems,
        require_non_empty=True,
    )
    return problems


def _extract_frontmatter(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("SKILL.md must start with YAML frontmatter delimiter '---'")
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "\n".join(lines[1:index])
    raise ValueError("SKILL.md frontmatter is missing closing delimiter '---'")


def _string_field(
    data: dict[str, Any], field: str, path: Path, problems: list[ValidationProblem]
) -> str | None:
    value = data.get(field)
    if not isinstance(value, str):
        problems.append(ValidationProblem(path, f"'{field}' is required and must be a string"))
        return None
    return value


def _taxonomy_list(taxonomy: dict[str, Any], field: str) -> list[str]:
    value = taxonomy.get(field)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _taxonomy_map(taxonomy: dict[str, Any], field: str) -> dict[str, Any]:
    value = taxonomy.get(field)
    return value if isinstance(value, dict) else {}


def _validate_list_field(
    metadata: dict[str, Any],
    field: str,
    allowed_values: list[str],
    path: Path,
    problems: list[ValidationProblem],
    *,
    require_non_empty: bool,
) -> None:
    if field not in metadata:
        return
    value = metadata[field]
    if not isinstance(value, list):
        problems.append(ValidationProblem(path, f"metadata.{field} must be a list"))
        return
    if require_non_empty and not value:
        problems.append(ValidationProblem(path, f"metadata.{field} must include at least one value"))
    allowed = set(allowed_values)
    for item in value:
        if not isinstance(item, str):
            problems.append(ValidationProblem(path, f"metadata.{field} values must be strings"))
            continue
        if item not in allowed:
            problems.append(
                ValidationProblem(
                    path,
                    f"metadata.{field} contains unknown value '{item}' (allowed: {', '.join(allowed_values)})",
                )
            )


def _validate_composes(
    metadata: dict[str, Any],
    path: Path,
    problems: list[ValidationProblem],
    available_skill_names: set[str],
    skill_name: str | None,
) -> None:
    if "composes" not in metadata:
        return
    value = metadata["composes"]
    if not isinstance(value, list):
        problems.append(ValidationProblem(path, "metadata.composes must be a list"))
        return
    for item in value:
        if not isinstance(item, str):
            problems.append(ValidationProblem(path, "metadata.composes values must be strings"))
            continue
        if not is_kebab_id(item) or not item.startswith("gtm-"):
            problems.append(ValidationProblem(path, f"metadata.composes value '{item}' must be a gtm-* skill name"))
            continue
        if item == skill_name:
            problems.append(ValidationProblem(path, "metadata.composes must not reference the current skill"))
        if item not in available_skill_names:
            problems.append(ValidationProblem(path, f"metadata.composes value '{item}' has no skills/{item}/SKILL.md"))


def _validate_output_mode(
    metadata: dict[str, Any], path: Path, taxonomy: dict[str, Any], problems: list[ValidationProblem]
) -> None:
    if "output_mode" not in metadata:
        return
    value = metadata["output_mode"]
    allowed = _taxonomy_list(taxonomy, "output_mode")
    if not isinstance(value, str):
        problems.append(ValidationProblem(path, "metadata.output_mode must be a string"))
        return
    if value not in set(allowed):
        problems.append(
            ValidationProblem(
                path,
                f"metadata.output_mode contains unknown value '{value}' (allowed: {', '.join(allowed)})",
            )
        )


if __name__ == "__main__":
    raise SystemExit(main())
