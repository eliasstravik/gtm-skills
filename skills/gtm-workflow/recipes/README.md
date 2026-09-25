# Recipes

Recipes are ready-made workflow blueprints: capabilities that could have been skills of their own but are delivered as saved workflows built by `gtm-workflow`, which still owns their lifecycle. When creating or changing a workflow, follow the matching recipe's `README.md`; running an unchanged workflow needs no recipe. General runtime guidance stays in [references](../references/). If something is delivered as a saved workflow, it is a recipe here, not a skill. Skills are for work that is not a saved workflow (workspace, ICPs, personas, one-off fit checks). Why: every skill's description is loaded on every turn in every agent; a recipe costs nothing until it is used. Promote a recipe to its own skill only when `gtm-workflow` demonstrably fails to route to it.

| Recipe | Builds | Requests like |
| --- | --- | --- |
| [enrich-network](enrich-network/README.md) | Connections or followers enriched into people and their current companies, linked in both directions | "enrich my network", "enrich my connections or followers and their employers" |

To add a recipe, create `recipes/<name>/README.md`, add its row here, and add a trigger phrase to `gtm-workflow`'s description only if routing would miss it.
