# Updates

Every gtm skill carries the release it belongs to as `metadata.version` in its frontmatter. The first gtm skill used in a conversation checks once whether a newer release is out; later gtm skills in the same conversation skip it, whatever the result was.

## Check

Before the job, run `node scripts/check-update.mjs` from the gtm-workspace skill's folder. It takes a few seconds at most and prints one line:

- `current`, `unknown` (offline, slow, or unreadable) or `skipped`: say nothing about it and carry on with the job.
- `update_available` with `installed`, `latest` and `command`: ask through the native question tool, **GTM Skills {latest} is out (this computer has {installed}). Install it?**, with **Install now (Recommended)** and **Not now**. This is the one offer every skill makes although installs otherwise proceed directly. Not now: carry on with the job and do not ask again in this conversation.
- `update_available` with `hosted: true` (the Slack agent): nothing installs here, because the agent's skills change only when the agent is upgraded. Say once, at the end of the reply: "GTM Skills {latest} is out; this agent runs {installed}. A teammate updates it by asking their coding agent to upgrade the GTM agent." Then carry on.

## Install

Say "Updating GTM Skills now; about a minute." and run the `command` from the check (`npx skills add eliasstravik/gtm-skills -g -y` for a global install; the same without `-g` for one inside a project). When it fails, show its last lines and give the command for the user to run in a terminal. Afterwards:

1. Re-read the updated SKILL.md of every gtm skill this conversation uses; the files on disk are new, the copies in this conversation are not.
2. Say whether a restart is needed: a host that reloads skills by itself (Claude Code) needs nothing; any other host picks up the new skills in a new conversation or after restarting the agent app.
3. Run Doctor on the workspace (gtm-workspace Doctor, which runs gtm-workflow's `scripts/doctor.mjs --workspace <path>` when the workspace has `workflows/`), and, when the organization has a GTM Agent, gtm-agent Doctor. Report problems in business terms with their fixes; when all is well, say "Updated to {latest}; everything checks out." and return to the original job.

## Migrate

When gtm-workflow's Doctor returns a `migration`, the workspace was made by an older release and must be brought forward before its workflows run on the new skills. Explain it in two plain sentences (what is old, what moving it forward changes for the user), list the steps below for its `kind`, and ask **Migrate the workspace now?** with **Migrate now (Recommended)** and **Not now**. Migrate only after that answer; Not now leaves everything as it is, and workflow runs wait until it is done. Every step is one commit; when the workspace has a remote, pull first and push at the end. Close with Doctor again.

| `kind` | What it means | Steps the agent lists and does |
| --- | --- | --- |
| `template` | The workflow engine in `workflows/` is an older version (`from`) than the installed skills (`to`). Workflows, tables and results all stay. | Update the engine files to `to` with gtm-workflow's Upgrade job; rebuild and check it locally; when the workspace is live on Vercel, push, which deploys production and applies its database changes. |
| `earlier_database` | `workflows/` still keeps its results in the database used before the current Postgres one (it has `db/tables/cache.ts`). The current skills cannot run it. | Save the current results: copy `workflows/data/` to `~/.gtm/.backup/<slug>-<date>/` outside the repository; set the old `workflows/` aside (git history keeps it); set up the current engine with gtm-workflow's shared setup `--local`; rebuild each old workflow and its table on it from the old code, keeping names and keys; load the saved results into the new local tables where the columns still match, so nothing is paid for twice; when the workspace was live, take it live again with setup `--deploy`, which adds a new Neon database. Production starts with empty tables; the old hosted database stays untouched until the user removes it. |
| `previous_runtime` | `workflows/` is the first engine (it has `scripts/gtm.ts`), from before the current skills. | As `earlier_database`, without loading old results unless the user points to them. |
| `skills_behind` | The workspace is newer than the installed skills. | No migration: install the update first, as above. |

## Releasing

A release changes `metadata.version` in all six SKILL.md files and `version` in `skills/gtm-workflow/templates/package.json` to the same number; the gtm-workspace tests fail when they differ. Users are offered the release once it is on `main`; the Slack agent offers it once the agent template pins it.
