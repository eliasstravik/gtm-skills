# Interactions: gtm-agent

Contents: [Deploy](#deploy) · [Deploy, asked from the hosted agent](#deploy-asked-from-the-hosted-agent) · [Doctor](#doctor) · [Upgrade](#upgrade)

## Deploy

**Setup:** A coding agent on a laptop where the GitHub and Vercel CLIs are signed in; the Vercel account has one team, acme. No GTM Agent exists yet.

**Human:** Get gtm-agent running for Acme in Slack.

**Agent:** Setting up GTM Agent for Acme on the selected Vercel team now: the agent, its Slack app, the workspace repository, and a workflow project with its database; about five minutes. Two manual steps remain: the Slack install page, and, if this team has not used Turso before, accepting its marketplace terms.

Open the Slack installation page: choose the Acme workspace and approve the app. The setup then synchronizes the selected permissions and events in Vercel and Slack and verifies the installed permissions.

**Human:** Done.

**Agent:** GTM Agent is live for Acme. In Slack, invite gtm-agent-acme to the GTM channel, then say:

@gtm-agent-acme set up our GTM workspace

Workflow notifications need a channel: supply its id from the bottom of the channel's About tab.

**Files:** none in the workspace (the runtime under `workflows/` was pushed to gtm-acme; the agent copy lives in gtm-agent-acme)

## Deploy, asked from the hosted agent

**Setup:** The hosted agent in Slack; no workflow project is connected.

**Human:** Connect the workflow project.

**Agent:** That's done from a computer, not from here: a teammate with the GitHub and Vercel CLIs signed in tells their coding agent "connect the workflow project for Acme", and it creates the project and its database and connects the agent to it. Nothing to paste anywhere.

## Doctor

**Setup:** GTM Agent for Acme was deployed by hand before this skill; DMs to the bot go unanswered.

**Human:** Check the Acme deployment.

**Agent:** Checked. Two things to fix: the Slack app doesn't receive direct messages (Slack lacks the `message.im` event and `im:history` permission; synchronizing its configuration and reapproving the app fixes this), and the workflow project builds on every push, workspace changes included (a project setting; the setting can be changed). Set the project setting now?

1. Yes, set it (Recommended)
2. Not now

**Human:** 1

**Agent:** Set. The Slack configuration is ready. Completing the authorized app reapproval and checking the saved manifest and installed permissions.

## Upgrade

**Setup:** The Acme agent copy is three template releases behind.

**Human:** Upgrade our GTM agent.

**Agent:** Bringing gtm-agent-acme up to the current template and deploying it; about two minutes.

Live: GTM Agent for Acme is on the current template. All checks pass.
