#!/usr/bin/env python3
"""Generate the skill-creator trigger-eval review page."""

import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
template = Path("/Users/eliasstravik/.agents/skills/skill-creator/assets/eval_review.html").read_text()
eval_data = json.loads((HERE / "trigger-eval.json").read_text())
description = json.loads((HERE / "candidates.json").read_text())["candidates"][1]["description"]
html = template.replace("__EVAL_DATA_PLACEHOLDER__", json.dumps(eval_data))
html = html.replace("__SKILL_NAME_PLACEHOLDER__", "gtm-account-segmentation")
html = html.replace("__SKILL_DESCRIPTION_PLACEHOLDER__", description)
(HERE / "trigger-eval-review.html").write_text(html)
