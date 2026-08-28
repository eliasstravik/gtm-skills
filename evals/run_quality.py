#!/usr/bin/env python3
"""Run deterministic routing, description, and temporary-workaround checks."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = REPO_ROOT / "skills"
CASES_PATH = Path(__file__).parent / "routing" / "cases.jsonl"
SKILL_NAMES = {"gtm-workflow", "gtm-workspace", "gtm-icp", "gtm-persona"}
MAX_DESCRIPTION_LENGTH = 1024
CORE_THRESHOLD = 0.95
FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
PROPER_NAME = re.compile(r"\b[A-Z][a-z]+(?:[A-Z][A-Za-z0-9]*)?\b")
ALLOWED_DESCRIPTION_NAMES = {"Triggers", "Not"}
TEMPORARY = re.compile(
    r"TEMPORARY: waits on (?P<package>[a-z0-9._/-]+)@(?P<version>[^\s:]+): "
    r"(?P<reason>.+?)(?=\s*-->|[\"'](?:,)?\s*$|$)"
)
TARGET_VERSION = re.compile(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?")

ACTION_FORMS = {
    "create": {"add", "build", "create", "define", "set up"},
    "update": {"change", "edit", "refine", "update"},
    "inspect": {"audit", "check", "inspect", "list", "open", "query", "validate", "view"},
    "delete": {"delete", "remove", "retire"},
    "run": {"execute", "run", "start"},
    "approve": {"approve", "resume"},
    "schedule": {"schedule"},
    "trigger": {"trigger"},
    "deploy": {"deploy", "host", "publish"},
    "doctor": {"doctor", "repair"},
    "import": {"import"},
    "migrate": {"migrate"},
}

DOMAIN_PATTERNS = {
    "gtm-workflow": (r"\bsaved (?:gtm )?(?:workflow|automation)s?\b", r"\bworkflow run\b", r"\bworkflow\b"),
    "gtm-workspace": (r"\bgtm workspace\b", r"\bworkspace (?:repo|repository|folder|layout)\b"),
    "gtm-icp": (r"\bideal[ -]customer profile\b", r"\bicps?\b", r"\bideal[ -]customer definitions?\b"),
    "gtm-persona": (r"\bbuyer persona\b", r"\bstakeholder persona\b", r"\bpersona(?:s| library)?\b"),
}


@dataclass(frozen=True)
class SkillDescription:
    name: str
    description: str
    positive: str
    exclusion: str
    actions: frozenset[str]


def frontmatter_value(source: str, key: str) -> str | None:
    match = FRONTMATTER.match(source)
    if not match:
        return None
    lines = match.group(1).splitlines()
    for index, line in enumerate(lines):
        prefix = f"{key}:"
        if not line.startswith(prefix):
            continue
        value = line[len(prefix) :].strip()
        if value not in {">", ">-", "|", "|-"}:
            return value.strip("'\"")
        continuation: list[str] = []
        for following in lines[index + 1 :]:
            if following and not following[0].isspace():
                break
            continuation.append(following.strip())
        return " ".join(part for part in continuation if part)
    return None


def canonical_actions(text: str) -> frozenset[str]:
    lowered = text.lower()
    return frozenset(
        action
        for action, forms in ACTION_FORMS.items()
        if any(re.search(rf"\b{re.escape(form)}(?:s|d|ed|ing)?\b", lowered) for form in forms)
    )


def lint_description(label: Path | str, description: str) -> list[str]:
    errors: list[str] = []
    if len(description) > MAX_DESCRIPTION_LENGTH:
        errors.append(
            f"{label}: description is {len(description)} characters; limit is {MAX_DESCRIPTION_LENGTH}"
        )
    if not re.search(r"\bTriggers when\b", description, re.IGNORECASE):
        errors.append(f"{label}: description needs a positive 'Triggers when' clause")
    if not re.search(r"\bNot for\b", description, re.IGNORECASE):
        errors.append(f"{label}: description needs an explicit 'Not for' exclusion clause")
    possible_products = sorted(set(PROPER_NAME.findall(description)) - ALLOWED_DESCRIPTION_NAMES)
    if possible_products:
        errors.append(
            f"{label}: possible third-party product name(s): {', '.join(possible_products)}"
        )
    return errors


def load_descriptions() -> tuple[dict[str, SkillDescription], list[str]]:
    descriptions: dict[str, SkillDescription] = {}
    errors: list[str] = []
    for skill_file in sorted(SKILLS_ROOT.glob("*/SKILL.md")):
        source = skill_file.read_text()
        name = frontmatter_value(source, "name")
        description = frontmatter_value(source, "description")
        label = skill_file.relative_to(REPO_ROOT)
        if not name:
            errors.append(f"{label}: missing frontmatter name")
            continue
        if not description:
            errors.append(f"{label}: missing frontmatter description")
            continue
        errors.extend(lint_description(label, description))
        exclusion_match = re.search(r"\bNot for\b", description, re.IGNORECASE)
        if not exclusion_match:
            positive, exclusion = description, ""
        else:
            positive = description[: exclusion_match.start()].strip()
            exclusion = description[exclusion_match.end() :].strip()
        descriptions[name] = SkillDescription(
            name=name,
            description=description,
            positive=positive,
            exclusion=exclusion,
            actions=canonical_actions(positive),
        )
    missing = SKILL_NAMES - descriptions.keys()
    if missing:
        errors.append(f"missing routed skill descriptions: {', '.join(sorted(missing))}")
    return descriptions, errors


def has_pattern(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def excluded(skill: SkillDescription, prompt: str) -> bool:
    exclusion = skill.exclusion.lower()
    if skill.name == "gtm-workflow":
        if "workspace itself" in exclusion and re.search(
            r"\b(?:create|delete|repair|doctor|import|migrate|validate)\s+"
            r"(?:a |an |the |our )?(?:new |old |local )?gtm workspace\b|"
            r"\b(?:repair|doctor|validate)\s+(?:the |our )?(?:gtm )?workspace\b",
            prompt,
        ):
            return True
        if "icp or persona lifecycle" in exclusion and (
            has_pattern(prompt, DOMAIN_PATTERNS["gtm-icp"])
            or has_pattern(prompt, DOMAIN_PATTERNS["gtm-persona"])
        ):
            return True
        if "other workflow engines" in exclusion and re.search(
            r"\b(?:another|different|other) workflow engine\b|\bcompare workflow engines\b|"
            r"\boutside the saved gtm workflow\b",
            prompt,
        ):
            return True
        if "one-off calls" in exclusion and re.search(
            r"\bone[- ]off\b|\bdo not save\b|\bdon't save\b|\bnot saved\b",
            prompt,
        ):
            return True
    elif skill.name == "gtm-workspace":
        if "defining icps or personas" in exclusion and re.search(
            r"\b(?:create|define|refine|update|delete|doctor|repair)\b.{0,50}"
            r"\b(?:icp|ideal[ -]customer profile|buyer persona|stakeholder persona|persona)\b",
            prompt,
        ):
            return True
        if "merely use an existing workspace" in exclusion and has_pattern(
            prompt, DOMAIN_PATTERNS["gtm-workflow"]
        ):
            return True
    elif skill.name == "gtm-icp":
        if (
            "personas" in exclusion
            and has_pattern(prompt, DOMAIN_PATTERNS["gtm-persona"])
            and not has_pattern(prompt, DOMAIN_PATTERNS["gtm-icp"])
        ):
            return True
        if "workspace repository itself" in exclusion and has_pattern(
            prompt, DOMAIN_PATTERNS["gtm-workspace"]
        ) and not has_pattern(prompt, DOMAIN_PATTERNS["gtm-icp"]):
            return True
    elif skill.name == "gtm-persona":
        if (
            "icps" in exclusion
            and has_pattern(prompt, DOMAIN_PATTERNS["gtm-icp"])
            and not has_pattern(prompt, DOMAIN_PATTERNS["gtm-persona"])
        ):
            return True
        if "general persona advice" in exclusion and re.search(
            r"\bexplain what\b|\bbrainstorm\b", prompt
        ):
            return True
        if "workspace repository itself" in exclusion and has_pattern(
            prompt, DOMAIN_PATTERNS["gtm-workspace"]
        ) and not has_pattern(prompt, DOMAIN_PATTERNS["gtm-persona"]):
            return True
    return False


def route(prompt: str, descriptions: dict[str, SkillDescription]) -> str:
    lowered = prompt.lower()
    prompt_actions = canonical_actions(lowered)
    guided = bool(re.search(r"\bhelp me manage\b|\bwalk me through\b|\bnot sure whether\b|\bdo not know whether\b", lowered))
    scores: dict[str, int] = {}
    for name in sorted(SKILL_NAMES):
        skill = descriptions[name]
        if excluded(skill, lowered):
            continue
        domain_matches = sum(
            bool(re.search(pattern, lowered)) for pattern in DOMAIN_PATTERNS[name]
        )
        action_matches = len(prompt_actions & skill.actions)
        if domain_matches == 0 or (action_matches == 0 and not guided):
            continue
        scores[name] = domain_matches * 10 + action_matches
    if not scores:
        return "none"
    return max(scores, key=lambda name: (scores[name], name))


def load_cases() -> list[dict[str, str]]:
    cases: list[dict[str, str]] = []
    for line_number, line in enumerate(CASES_PATH.read_text().splitlines(), start=1):
        if not line.strip():
            continue
        try:
            case = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(f"{CASES_PATH}:{line_number}: {error}") from error
        if set(case) != {"prompt", "expected", "tier"}:
            raise ValueError(f"{CASES_PATH}:{line_number}: expected prompt, expected, and tier")
        if case["expected"] not in SKILL_NAMES | {"none"}:
            raise ValueError(f"{CASES_PATH}:{line_number}: invalid expected route")
        if case["tier"] not in {"core", "hard"}:
            raise ValueError(f"{CASES_PATH}:{line_number}: invalid tier")
        cases.append(case)
    return cases


def run_routing(descriptions: dict[str, SkillDescription]) -> bool:
    cases = load_cases()
    passed = True
    for tier in ("core", "hard"):
        tier_cases = [case for case in cases if case["tier"] == tier]
        failures = []
        for case in tier_cases:
            actual = route(case["prompt"], descriptions)
            if actual != case["expected"]:
                failures.append((case["prompt"], case["expected"], actual))
        correct = len(tier_cases) - len(failures)
        rate = correct / len(tier_cases) if tier_cases else 0.0
        threshold = f", threshold {CORE_THRESHOLD:.0%}" if tier == "core" else ", reporting only"
        print(f"routing {tier}: {correct}/{len(tier_cases)} ({rate:.1%}{threshold})")
        for prompt, expected, actual in failures:
            print(f"  expected {expected}, got {actual}: {prompt}")
        if tier == "core" and rate < CORE_THRESHOLD:
            passed = False
    return passed


def temporary_markers() -> tuple[list[tuple[Path, int, str, str, str]], list[str]]:
    markers: list[tuple[Path, int, str, str, str]] = []
    errors: list[str] = []
    root = SKILLS_ROOT / "gtm-workflow"
    for path in sorted(candidate for candidate in root.rglob("*") if candidate.is_file()):
        if path.name == "package-lock.json":
            continue
        try:
            lines = path.read_text().splitlines()
        except UnicodeDecodeError:
            continue
        for line_number, line in enumerate(lines, start=1):
            if "TEMPORARY" not in line:
                continue
            match = TEMPORARY.search(line)
            if not match:
                errors.append(
                    f"{path.relative_to(REPO_ROOT)}:{line_number}: malformed TEMPORARY marker"
                )
                continue
            if not TARGET_VERSION.fullmatch(match.group("version")):
                errors.append(
                    f"{path.relative_to(REPO_ROOT)}:{line_number}: TEMPORARY target needs a concrete version"
                )
                continue
            markers.append(
                (
                    path.relative_to(REPO_ROOT),
                    line_number,
                    match.group("package"),
                    match.group("version"),
                    match.group("reason").strip(),
                )
            )
    if not markers:
        errors.append("no TEMPORARY markers found under skills/gtm-workflow")
    return markers, errors


def print_temporary(markers: list[tuple[Path, int, str, str, str]]) -> None:
    for path, line_number, package, version, reason in markers:
        print(f"{package}@{version}\t{path}:{line_number}\t{reason}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--temporary",
        action="store_true",
        help="list pinned-runtime workaround markers and exit",
    )
    args = parser.parse_args()

    markers, temporary_errors = temporary_markers()
    if args.temporary:
        print_temporary(markers)
        for error in temporary_errors:
            print(f"error: {error}", file=sys.stderr)
        return int(bool(temporary_errors))

    descriptions, description_errors = load_descriptions()
    for error in description_errors:
        print(f"description lint: {error}")
    descriptions_ok = not description_errors
    if descriptions_ok:
        print(f"description lint: {len(descriptions)} skill descriptions passed")
    routing_ok = run_routing(descriptions) if SKILL_NAMES <= descriptions.keys() else False
    for error in temporary_errors:
        print(f"temporary lint: {error}")
    temporary_ok = not temporary_errors
    if temporary_ok:
        print(f"temporary lint: {len(markers)} marker(s) passed")
    return 0 if descriptions_ok and routing_ok and temporary_ok else 1


if __name__ == "__main__":
    sys.exit(main())
