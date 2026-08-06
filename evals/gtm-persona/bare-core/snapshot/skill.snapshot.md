---
name: gtm-persona
description: Triggers when a user asks to create, update, delete, or doctor a buyer or stakeholder persona in a connected GTM context. Not for ICPs, segmentation, scoring, research, or managing the context repository itself.
---

# GTM Persona

## Switch

| Condition | Action |
| --- | --- |
| No clear verb is present | Guide the user to choose create, update, delete, or doctor; retain ownership of the selected flow |
| Create is requested | Resolve the context repo and owner node, ground a freeform persona draft in that node's organization facts and local personas, preview it, then save the accepted file to history |
| Update is requested | Resolve the node and visible persona, gather the change, preview complete before/after content, then save the accepted update to history |
| Delete is requested | Resolve the node and visible persona, preview ownership and downstream consequences, then delete the accepted target with history recovery guidance |
| Doctor is requested | Inspect persona placement, slugs, H1s, substance, and husks repo-wide; preview repairs, then save accepted repairs as one history entry |
