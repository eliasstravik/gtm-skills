# Open workflow tools

Open the local UI unless the user names Vercel or names a workflow whose header says `Runs: on Vercel`. If the request could mean either location, ask:

```text
**Which Workflows UI should I open?**

1. On this computer (Recommended)
2. On Vercel

Reply with a number, or type your answer.
```

## Local open

1. Resolve the GTM workspace and its root `workflows/` project.
2. Refuse to start or reuse Nitro while `workflows/.env.local` exists. Explain that Nitro would load it after `.env` and point local runs at the cloud database.
3. Reuse a healthy owned Nitro server or a healthy `nitro dev` listener whose working directory is this workspace's `workflows/`. Otherwise start one background `npm run dev` there and record its PID, command, working directory, and purpose in the conversation.
4. Open `http://127.0.0.1:3000/_workflow`.
5. Call the embedded UI manifest RPC with the request recorded below. Require every expected qualified workflow in the response and confirm each source appears as `workflows/<slug>.ts` or `workflows/<suborg-path>/<slug>.ts`.
6. Run `npx workflow inspect runs` against the same `.workflow-data/` and confirm run history is readable.
7. Unless `GTM_SANDBOX=1`, run `npm run db:studio`, report its URL, and name the workflow result table. Studio is a viewer and is local only.
8. Report both URLs and whether the server remains running. State that open started no workflow and made no paid call.

<!-- TEMPORARY: waits on workflow@5.0.0: replace the internal manifest request when a public manifest command is available. -->
The embedded UI sends `POST /_workflow/api/rpc` with `Content-Type: application/cbor`. Its CBOR body encodes `{"method":"fetchWorkflowsManifest","params":{"worldEnv":{}}}`.

## Private remote access

When the user asks for private remote access, hand the running Nitro origin to the `tailscale` skill and share its `/_workflow` path. Use the existing embedded UI.

## Deployed open

1. Read `gtm.vercel.team` and `gtm.vercel.project` from `workflows/package.json`.
2. If either value is absent, report that the project is not deployed and stop. When the user named a workflow, also require its header to say `Runs: on Vercel`; otherwise report that the workflow is not deployed and stop.
3. Run `./node_modules/.bin/workflow inspect runs --backend vercel --project <project> --team <team> --url` with both recorded values.
4. Open the printed URL. If it cannot be opened, say `In the Vercel project, open Observability, then Workflows.`
5. For table inspection, use the Turso dashboard or run `npm run db:studio:cloud` on the user's computer. Ignored `.env.turso` contains `TURSO_DATABASE_URL`, write-only `TURSO_AUTH_TOKEN` for migrations, and `TURSO_READ_ONLY_AUTH_TOKEN` for Studio and `gtm query --cloud`; inspection refuses to reuse the write token.

## Sandbox inspection

When `GTM_SANDBOX=1`, open no port and offer no Studio command. The sandbox holds a read-only database credential and starts no local server, so hosted run state comes from the trusted status action. Relay these commands for database facts:

```text
npm run gtm -- query --sql "select * from <table> limit 20" --format markdown
npm run gtm -- query --sql "select run_key, status, completed, failed, cost_usd from workflow_runs order by started_at desc limit 20" --format markdown
```

## Process ownership

- Reuse only a listener whose working directory is this workspace's `workflows/`.
- Record the PID, command, working directory, and purpose for every server this session starts.
- Stop and confirm exit only for server PIDs this session started. Leave matching servers from other sessions and unrelated processes running.
- On cancellation, stop only a server this session started.
- CLI-agent subprocesses belong to Nitro's process group and end on their own or at `timeoutMs`. `npm run gtm -- cancel <runKey> --wait` polls `cancelling` until the runtime confirms terminal cancellation; an adapter using the library signal may stop sooner.

## Empty workflow recovery

For `Runs visible, Workflows empty`:

<!-- TEMPORARY: waits on workflow@5.0.0: remove the legacy data-directory override after local state resolves without it. -->
1. Confirm the `dev` script sets `WORKFLOW_EMBEDDED_DATA_DIR` to `node_modules/.nitro/workflow`.
2. Confirm `node_modules/.nitro/workflow/manifest.json` lists the expected workflows with their `workflows/` definition paths.
3. Restart the owned Nitro process.
4. Repeat the manifest RPC check.

## Limits

Open does not deploy, run, spend, migrate, or propose a save. It adds no custom UI, dashboard, or proxy. Add a process manager only when the user asks for survival across sessions or reboots.
