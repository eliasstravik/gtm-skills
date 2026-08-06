# Skill Issue checklist — gtm-account-research

- [x] Requirements, decisions, legacy behavior, assertions, and a preserved baseline failure were read.
- [x] Every required behavior and preserved failure has a checkable assertion; contractual assertions are critical.
- [x] Recipe is the single core primitive because evidence gathering, interpretation, prioritization, rendering, and close depend on order.
- [x] The saved bare core contains only an H1 and Recipe and stays within 20 body lines.
- [x] Fresh controlled with/without runs and a blind forced comparison tested the saved bare-core snapshot.
- [x] Details retain only instructions traceable to bare-core failures and remain within 80 lines; the body remains within 100 lines.
- [x] No approval or review pause was introduced.
- [x] The dormant ambiguity question contract directly renders one bold question, numbered choices, option 1 recommended, and the exact reply line; `AskUserQuestion` is forbidden.
- [x] Context, evidence, and output depth are externalized through one-level Calls with explicit triggers and fallbacks.
- [x] Frontmatter starts `Triggers when` and excludes segmentation, scoring, lead research, persona or ICP authoring, CRM writes, and context setup.
- [x] Full treatment passes every critical assertion, uses the selected description verbatim, and keeps all eval evidence outside the shipping skill.
