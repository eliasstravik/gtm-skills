# Slack configuration and verification

The supported GTM profile lives in `scripts/slack-config.mjs`: 14 bot scopes, five events, no user scopes, commands, shortcuts, or advanced assistant view. Interactivity stays enabled for Eve's native approvals and questions. The profile supports existing group DMs; it does not grant creation of new group DMs or a user directory.

## Configure an existing connector

1. Read the current connector. Run `node scripts/configure-slack.mjs --team <team> --connector <uid>` to show the proposed change. The Scopes and Events links in Vercel are summaries, not editors.
2. Within the user's authorized scope, run the same command with `--apply`. It uses `PATCH /v2/connect/connectors/{id}` and prints `reinstallNeeded` and `serviceSync`. `required` is not a successful provider sync.
3. Open the exact Slack App Manifest URL printed by the script and export JSON. Prepare the change with `--manifest <export.json> --out <updated.json>`. This preserves app identity, callback URLs, branding, and unrelated settings while applying the selected profile.
4. Paste the prepared JSON into Slack's App Manifest editor and save. Reload and export the saved manifest again. Verify the selected bot scopes/events, empty user scopes, and both request URLs pointing to `https://connect.vercel.com/trigger/<connector-id>`.
5. In the Vercel connector's Installations row, choose Reinstall and complete Slack's Allow flow. Use an authorized authenticated browser when available; ask the user only for a login or approval the agent cannot complete within existing authorization.
6. Deploy the current agent. Run Doctor with `--slack-manifest <fresh-saved-export.json>`. Doctor checks all selected scopes/events, the provider manifest, installation timestamp, trigger destination, and the actual installed token's grants through the protected agent diagnostic route. It runs the diagnostic helper with `vercel env run -e production --project <agent>`, using the project OIDC credential without pulling production secrets. If environment access or provider proof is unavailable, report the check as unverified rather than healthy.

A manifest export proves the saved configuration at export time, not future changes. Keep operator exports outside tracked repositories. Never print the app's secrets, OAuth token, or environment values.

## Behavior

- Public/private channels: mention the bot to start a thread; it follows replies in its own threads and workflow ask/handoff threads.
- One-to-one DMs: a human message starts a turn.
- Existing group DMs: mention the bot to start; it follows its own threads. Ordinary chatter stays silent.
- Files: Eve stages incoming attachments. Authored tools fetch accessible existing files and upload generated sandbox files, up to 25 MB.
- `chat:write.public` permits public-channel posting without joining. It does not grant receipt of replies there. Invite the bot before interactive workflow ask/handoff notifications. Private conversations always require the bot to be invited.
- Use `slack_context` for here/me, channel lookup for names, and an @mention for a DM recipient. No additional user scope is needed.

## Smoke checks

Use an authorized test conversation. Verify public/private mentions, one-to-one DMs, group-DM mentions and ordinary-chatter silence, workflow thread replies, a small CSV download and upload, a long reply, and an approval/question form. Confirm one response per message and the correct thread. Keep ordinary teammate channels free of test messages unless the user requested tests there.
