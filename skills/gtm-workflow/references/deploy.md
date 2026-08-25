# Deploy GTM workflows to Vercel

Use this flow only after accepted workflow bytes say `Runs: on Vercel`. Run every command from inside the workspace's `workflows/` directory.

## Contents

- [Deployment gate](#deployment-gate)
- [CLI check](#cli-check)
- [Gateway key check](#gateway-key-check)
- [Link and sync](#link-and-sync)
- [Deploy and record](#deploy-and-record)
- [Verify](#verify)
- [Live state](#live-state)

## Deployment gate

If the user has not already authorized deployment, ask:

```text
**Would you like to put this workflow live on Vercel now?**

1. Deploy and verify it (Recommended)
2. Keep it saved but not live
3. Cancel

Reply with a number, or type your answer.
```

Option 2 closes with the exact saved-versus-live state and how to return to deploy. Option 3 cancels deployment only; it does not undo the accepted local history.

## CLI check

1. Confirm `vercel` is on `PATH`.
2. Run `vercel whoami`.
3. If either check fails, say: `Install the Vercel CLI, then run vercel login.`
4. Wait for the user, then recheck both conditions. `vercel login` is the one deployment command the user runs themselves.

Do not link a project before both checks pass.

## Gateway key check

Before linking, scan managed flow files for `agent()` calls. If any flow calls it and ignored `.env` lacks a non-empty `AI_GATEWAY_API_KEY`, use this exact order:

```text
**Is a budgeted Gateway key saved in workflows/.env now?**

Research on Vercel runs through a Vercel AI Gateway key with a spending budget. Create the key with a spending budget in the [Vercel AI Gateway dashboard](https://vercel.com/ai-gateway) and paste it directly into `workflows/.env` without sharing it in conversation.

1. Yes, continue (Recommended)
2. Cancel deployment

Reply with a number, or type your answer.
```

Wait for confirmation and verify only that the variable has a non-empty value. Never read the value into conversation, a prompt, a tracked file, or captured command output.

## Link and sync

1. On every deployment, run `vercel link --yes --project <org-slug>-workflows`. The local `.vercel/` link is ignored, so linking is not assumed to persist.
2. Read variable names from `.env.example`. For each name with a non-empty value in `.env` that is absent from `vercel env ls`, pipe its value from `.env` through the shell to `vercel env add <name> production`. Disable shell tracing and do not print the value.
3. Sync `GTM_AGENT_BACKEND` only when its value is `api`. A CLI backend cannot run on Vercel.
4. Set `CRON_SECRET` to the same value as `GTM_RUN_SECRET`, transferred through the shell.
5. When the user says a value changed, remove that production variable with `vercel env rm`, then add it again from `.env`. Rotating `GTM_RUN_SECRET` also removes and rewrites `CRON_SECRET`.

Secret sync runs on every deployment before build. Never use command substitution or logging that exposes a value.

## Deploy and record

1. Run `vercel deploy --prod --yes`.
2. Stop on a failed build or deployment. Do not describe the workflow as live.
3. Read the linked team and project plus the production URL from Vercel's non-secret output.
4. Record them under `package.json`:

```json
{
  "gtm": {
    "vercel": {
      "team": "<team>",
      "project": "<project>",
      "url": "<production-url>"
    }
  }
}
```

5. Inspect the exact `package.json` change and save it to history on `main`.

Deployments are CLI-only. Do not configure a Git-connected deployment or a separate Root Directory.

## Verify

1. Build a safe three-row body accepted for the workflow being deployed.
2. POST it to the production run route with the bearer read from `.env` inside the shell. This proves the Gateway path when the workflow calls `agent()`.
3. Poll the production result route for at most ten minutes. Require a completed result with the expected `completed` and `failed` lists. If still running, report that inspect can retrieve it later.
4. Run remote inspect with `./node_modules/.bin/workflow inspect --backend vercel --project <project> --team <team>`.
5. For a scheduled flow, run `vercel crons run /api/run/<path>` and confirm a new Workflow run starts. Vercel supplies `CRON_SECRET` as the bearer. If cron invocation is unavailable, call the GET run route from the shell with `GTM_RUN_SECRET`.

## Live state

`Live` means the production deployment succeeded, the workflow starts through the recorded URL, and the verification run reached its expected result state. A saved workflow that has not passed this flow is local, not live.

Webhooks and other trigger systems call the same GET or POST run route. The user obtains the bearer by opening `workflows/.env` and configures it in the caller. Never print or relay that secret.

On Vercel Hobby, cron accepts only once-daily schedules and may fire within the specified hour. Cron has no automatic retry and may double-fire; the delivery payload's run ID and UTC date key support receiver deduplication.
