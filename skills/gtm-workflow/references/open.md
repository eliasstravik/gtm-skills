# Open the Workflows UI

Open the local UI unless the user names Vercel or names a workflow whose header says `Runs: on Vercel`. If the request could mean either location, ask:

```text
**Which Workflows UI should I open?**

1. On this computer (Recommended)
2. On Vercel

Reply with a number, or type your answer.
```

## Local open

1. Resolve the GTM workspace and its root `workflows/` project.
2. Reuse a healthy owned Nitro server or a healthy `nitro dev` listener whose working directory is this workspace's `workflows/`. Otherwise start one background `npm run dev` there and record its PID, command, working directory, and purpose in the conversation.
3. Open `http://127.0.0.1:<port>/_workflow`.
4. Call the embedded UI manifest RPC with the request recorded below. Require every expected qualified workflow in the response and confirm each source appears as `workflows/<slug>.ts` or `workflows/<suborg-path>/<slug>.ts`.
5. Run `./node_modules/.bin/workflow inspect runs` against the same `.workflow-data/` and confirm run history is readable.
6. Report the URL and whether the server remains running. State that open started no workflow and used no research allowance.

The embedded UI sends `POST /_workflow/api/rpc` with `Content-Type: application/cbor`. Its CBOR body encodes `{"method":"fetchWorkflowsManifest","params":{"worldEnv":{}}}`.

## Private remote access

When the user asks for private remote access, hand the running Nitro origin to the `tailscale` skill and share its `/_workflow` path. Use the existing embedded UI.

## Deployed open

1. Read `gtm.vercel.team` and `gtm.vercel.project` from `workflows/package.json`.
2. If either value is absent, report that the project is not deployed and stop. When the user named a workflow, also require its header to say `Runs: on Vercel`; otherwise report that the workflow is not deployed and stop.
3. Run `./node_modules/.bin/workflow inspect runs --backend vercel --project <project> --team <team> --url` with both recorded values.
4. Open the printed URL. If it cannot be opened, say `In the Vercel project, open Observability, then Workflows.`

## Process ownership

- Reuse only a listener whose working directory is this workspace's `workflows/`.
- Record the PID, command, working directory, and purpose for every server this session starts.
- Stop and confirm exit only for server PIDs this session started. Leave matching servers from other sessions and unrelated processes running.
- On cancellation, stop only a server this session started.
- CLI-agent subprocesses belong to Nitro's process group and end on their own or at `timeoutMs`. Cancelling a run with `./node_modules/.bin/workflow cancel` takes effect at the next step boundary.

## Empty workflow recovery

For `Runs visible, Workflows empty`:

1. Confirm the `dev` script sets `WORKFLOW_EMBEDDED_DATA_DIR` to `node_modules/.nitro/workflow`.
2. Confirm `node_modules/.nitro/workflow/manifest.json` lists the expected workflows with their `workflows/` definition paths.
3. Restart the owned Nitro process.
4. Repeat the manifest RPC check.

## Limits

Open does not deploy, run, spend, or propose a save. It does not start another dashboard or a proxy. Add a process manager or persistent service only when the user asks for survival across sessions or reboots.
