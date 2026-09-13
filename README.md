# gtm-skills

Five agent skills that let a GTM teammate keep one organization's go-to-market context in a git-backed Markdown workspace and act on it through their coding agent. The agent qualifies prospects against that context in conversation and builds, runs, schedules, and deploys saved GTM workflows on Vercel Workflow, with SQLite locally and Turso hosted.

## Install

```sh
npx skills add eliasstravik/gtm-skills -g
```

This installs the skills globally for Claude Code, Codex, Cursor, OpenCode, and any other skills.sh host. Always install `gtm-workspace`; the other four depend on it.

## The five skills

| Skill | Owns |
| --- | --- |
| `gtm-workspace` | The workspace itself: the organization record, members, and workspace health |
| `gtm-icp` | Ideal customer profiles: the companies the organization sells to |
| `gtm-persona` | Personas: the people the organization sells to |
| `gtm-qualify-prospects` | In-conversation fit checks of supplied people or companies |
| `gtm-workflow` | Saved workflows: code, tables, runs, schedules, and deploys |

MIT licensed. Provider, model, Vercel, and Turso usage may cost money under the limits you choose.
