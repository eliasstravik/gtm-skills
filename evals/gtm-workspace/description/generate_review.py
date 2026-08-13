#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parent
skill = root.parents[2] / "skills" / "gtm-workspace" / "SKILL.md"
template = Path("/Users/eliasstravik/.agents/skills/skill-creator/assets/eval_review.html").read_text()
eval_data = json.loads((root / "trigger-eval.json").read_text())
description = next(
    line.removeprefix("description: ")
    for line in skill.read_text().splitlines()
    if line.startswith("description: ")
)
html = template.replace("__EVAL_DATA_PLACEHOLDER__", json.dumps(eval_data))
html = html.replace("__SKILL_NAME_PLACEHOLDER__", "gtm-workspace")
html = html.replace("__SKILL_DESCRIPTION_PLACEHOLDER__", description)
(root / "trigger-eval-review.html").write_text(html)
