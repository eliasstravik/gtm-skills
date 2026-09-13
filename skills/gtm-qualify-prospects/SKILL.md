---
name: gtm-qualify-prospects
description: Triggers when a user asks whether a named person or company, or a pasted list of them, fits the GTM workspace's personas or ICPs, with phrasings like "is this a fit", "check quillhr.com against our ICP", "score these leads", or "qualify this list". Owns in-conversation fit checks of supplied people or companies and writes nothing. Not for creating or editing ICPs or personas (gtm-icp, gtm-persona), the workspace itself (gtm-workspace), or recurring scoring of lists, which is a saved gtm-workflow.
---

# GTM Qualify Prospects

## Trigger

Apply this skill when a request asks how well supplied people or companies fit the workspace's personas or ICPs.

## Scope

Fit checks only: people against personas, companies against ICPs, never blended in one score; nothing is written to the workspace or anywhere else.

## Inputs

The people or companies as given; the workspace's `personas/*/PERSONA.md` and `icps/*/ICP.md`; free public pages such as a company's own site; paid data tools the host exposes, only after the gate in step 3.

## Roles

The user supplies the entities and approves any paid lookup; the agent scores.

## Procedure

Talk by the six rules in [interaction](../gtm-workspace/references/interaction.md); reproduce [the dialogues](references/interactions.md).

1. Sort the entities into people and companies; pick the persona or ICP to score against, asking with options when several fit and the request names none.
2. Gather evidence from the request and free public pages.
3. When a paid tool would fill missing criteria, ask once: what it fills, how many calls, and the provider's published price, as options with the lookup first and "score with what I have" second.
4. For each entity, write the reasoning first, commit to a band, then choose the score inside it: Excellent 85–100, Good 70–84, Fair 50–69, Not a fit 0–49. A matched disqualifier is Not a fit at 0. Missing evidence lowers confidence (High, Medium, Low), never the band.
5. One entity: labelled lines Verdict, Score, Confidence, Scored against, Reasoning. Several: one table per mode (Person or Company, Verdict, Score, Confidence), then one reasoning line per entity, then the footer `Fit only; recurring scoring belongs in a gtm-workflow.`

## Outputs

The verdicts in the reply; no files.

## Exceptions

Requires the `gtm-workspace` skill installed alongside this one; when `../gtm-workspace/SKILL.md` is missing, say: install it the same way this skill was installed, with `npx skills add eliasstravik/gtm-skills -s gtm-workspace -y` (add `-g` when this skill lives in the global skills directory), then retry. Asked to save results: say fit checks save nothing and offer a workflow. No persona or ICP exists for a mode: say so and offer to create one.

## QC

- Every person is scored only against a persona and every company only against an ICP.
- Every score sits inside its stated band; every disqualifier match is 0.
- No file changed.

## References

[interactions](references/interactions.md); from gtm-workspace: [interaction](../gtm-workspace/references/interaction.md), [contract](../gtm-workspace/references/contract.md), [company data](../gtm-workspace/references/company-data.md), [person data](../gtm-workspace/references/person-data.md).
