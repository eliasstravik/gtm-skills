# Interactions: gtm-agent

Contents: [Readiness](#readiness) · [Deploy](#deploy) · [Deploy, asked from the hosted agent](#deploy-asked-from-the-hosted-agent) · [Doctor](#doctor) · [Upgrade](#upgrade)

## Readiness

**Setup:** A coding agent on a laptop where the GitHub CLI is signed in and the Vercel CLI is not. The user is trying the skills locally.

**Human:** Can I set up the Slack GTM agent? What exactly would I need? Don't deploy or create anything.

**Agent:** Not yet, one thing is missing on this computer: the Vercel CLI is not signed in (`vercel login`). GitHub is ready. Setup needs a Vercel Pro team, the Slack workspace where the bot will live, and about ten minutes. It creates the agent and its Slack app, a private workspace repository, and a workflow project with its database. Browser steps along the way: a fine-grained GitHub token for the workspace repository, approving the Slack app, and, the first time the team uses Neon, accepting Neon's terms. Nothing was created. Say "deploy it" when ready.

## Deploy

**Setup:** A coding agent on a laptop where the GitHub and Vercel CLIs are signed in; the Vercel account has one team, acme. No GTM Agent exists yet.

**Human:** Get gtm-agent running for Acme in Slack.

**Agent:** Setting up GTM Agent for Acme on the selected Vercel team now: the agent, its Slack app, the workspace repository, and a workflow project with its database; about ten minutes. Two browser steps may remain: the Slack install page, and, only if this team has never used Neon, accepting Neon's terms.

Open the Slack installation page: choose the Acme workspace and approve the app. The setup then synchronizes the selected permissions and events in Vercel and Slack and verifies the installed permissions.

**Human:** Done.

**Agent:** GTM Agent is live for Acme. In Slack, invite gtm-agent-acme to the GTM channel, then say:

@gtm-agent-acme set up our GTM workspace

Workflow notifications need a channel: supply its id from the bottom of the channel's About tab.

**Files:** none in the workspace (the runtime under `workflows/` was pushed to gtm-acme; the agent copy lives in gtm-agent-acme)

## Deploy, asked from the hosted agent

**Setup:** The hosted agent in Slack; no workflow project is connected.

**Human:** Connect the workflow project.

**Agent:** That's done from a computer, not from here: a teammate with the GitHub and Vercel CLIs signed in tells their coding agent "take the Acme workflows live and connect the agent", and it creates the project and its database and connects this agent to it. Nothing to paste anywhere.

## Doctor

**Setup:** GTM Agent for Acme was deployed by hand before this skill; DMs to the bot go unanswered.

**Human:** Check the Acme deployment.

**Agent:** Checked. Two things to fix: the Slack app doesn't receive direct messages (Slack lacks the `message.im` event and `im:history` permission; synchronizing its configuration and reapproving the app fixes this), and the workflow project skips builds for some pushes (an old project setting; workflow setup resets it). Fixing both now.

**Agent:** Done. The workflow project builds every push again, and the Slack configuration is ready. Completing the authorized app reapproval and checking the saved manifest and installed permissions.

## Upgrade

**Setup:** The Acme agent copy is three template releases behind.

**Human:** Upgrade our GTM agent.

**Agent:** Bringing gtm-agent-acme up to the current template and deploying it; about two minutes.

Live: GTM Agent for Acme is on the current template. All checks pass.
