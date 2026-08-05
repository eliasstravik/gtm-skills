# Skill Issue checklist: gtm-icp

- [x] Requirements, assertions, preserved failures, and old skill intent were read. The old file was treated as behavioral reference only; the preserved no-skill baseline passes 18/41 and fails every branch.
- [x] Every required behavior has a checkable assertion in `assertions.md` and `evals.json`; all are contractual.
- [x] Exactly one core primitive is used: Switch, because the manager retains ownership after choosing create, update, delete, or doctor.
- [x] The saved bare core is an H1 plus Switch and has 12 physical body lines, 9 nonblank.
- [x] Fresh controlled paired runs tested the bare-core snapshot. It passed 20/41 versus 19/41 without-skill.
- [x] A blind forced comparison tested the suborg-create case. The bare core lost 6.7 to 8.0 because it invented adjacent-context claims, weakened a disqualifier, crossed node visibility, and omitted interaction/context/label contracts.
- [x] Details contains 9 lines, all earned by snapshot failures: direct questions, numbered choices, context line, node-local reads, create destination, fact fidelity, complete previews, label/history close, and scoped persistence.
- [x] Skill Issue introduced no approval pause; the approved implementation plan governed the uninterrupted build loop.
- [x] Every question contract forbids `AskUserQuestion` and requires a direct bold question, context below, numbered options with option 1 `(Recommended)`, and the exact reply line.
- [x] Overflow is externalized one level through `references/context.md`, `references/flows.md`, and the optional draft template; every Call states trigger, outcome, and fallback.
- [x] The model-invoked description starts `Triggers when`, is third-person, covers create/define/refine/update/delete/doctor, and excludes every sibling workflow plus repo-level management.
- [x] The full treatment passes 41/41 critical assertions versus 18/41 without-skill; the applied description passes 60/60 GPT classifier runs; eval evidence stays outside the shipping skill.

## Form measurements

- Bare core: 12 physical body lines, 9 nonblank.
- Final SKILL.md: 30 physical body lines, 23 nonblank.
- Details: 9 nonblank lines, below the 80-line limit.
- Total body: below the 100-line limit.
- Shipping resources: one-level references and one draft template only.
