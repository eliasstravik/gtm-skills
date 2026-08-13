#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parent
template = Path("/Users/eliasstravik/.agents/skills/skill-creator/assets/eval_review.html").read_text()
eval_data = json.loads((root / "trigger-eval.json").read_text())
description = "Triggers when the user invokes `/gtm-context` or asks to create, import, update, delete, validate, or repair a GTM context repo or folder, including adding teammates or suborganizations. Not for defining ICPs or personas, or for tasks that merely use an existing context without changing or validating it."
html = template.replace("__EVAL_DATA_PLACEHOLDER__", json.dumps(eval_data))
html = html.replace("__SKILL_NAME_PLACEHOLDER__", "gtm-context")
html = html.replace("__SKILL_DESCRIPTION_PLACEHOLDER__", description)
(root / "trigger-eval-review.html").write_text(html)
