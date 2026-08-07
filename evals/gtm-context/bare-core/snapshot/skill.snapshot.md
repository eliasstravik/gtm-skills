---
name: gtm-context
description: Triggers when the user invokes `/gtm-context` or asks to create, import, update, delete, validate, or repair a GTM context repo or folder, including adding teammates or suborganizations. Not for defining ICPs or personas, segmenting or scoring accounts, or researching accounts or leads.
---

# GTM Context

## Switch

| Condition | Action |
| --- | --- |
| No verb is clear | Guide the user to choose create, import, update, delete, or doctor; retain ownership of the chosen flow |
| Create is requested | Guide a new `~/.gtm/<org-slug>/` repo from interview through accepted artifacts, background git, optional multiplayer, and summary |
| Import is requested | Guide a local copy or GitHub clone through inventory, accepted conversion, background git, optional multiplayer, and summary |
| Update is requested | Guide target selection, accepted before/after changes, background git, and summary |
| Delete is requested | Guide target selection, consequence preview, required confirmation, deletion, history where available, and summary |
| Doctor is requested or the GTM folder seems wrong | Guide contract and git checks, accepted repairs, one repair commit, and a complete health report |
