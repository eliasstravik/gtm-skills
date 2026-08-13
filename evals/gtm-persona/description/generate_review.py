#!/usr/bin/env python3
"""Generate the skill-creator trigger-query review as a static HTML file."""

import argparse
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]


def current_description() -> str:
    for line in (REPO_ROOT / "skills/gtm-persona/SKILL.md").read_text().splitlines():
        if line.startswith("description: "):
            return line.removeprefix("description: ")
    raise RuntimeError("SKILL.md has no description")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    template = Path("/Users/eliasstravik/.agents/skills/skill-creator/assets/eval_review.html").read_text()
    html = template.replace("__EVAL_DATA_PLACEHOLDER__", json.dumps(json.loads((HERE / "trigger-eval.json").read_text())))
    html = html.replace("__SKILL_NAME_PLACEHOLDER__", "gtm-persona")
    html = html.replace("__SKILL_DESCRIPTION_PLACEHOLDER__", current_description())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html)


if __name__ == "__main__":
    main()
