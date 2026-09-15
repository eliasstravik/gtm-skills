# Workflow entry links

Use the authenticated link resolver's `viewerUrl`. `GET /api/link/<workflow-id-or-slug>` opens the workflow's Diagram. `GET /api/link` opens the list. Both return the deployed `commit`; verify that it includes the saved revision before showing a hosted link. Preserve immutable workflow IDs across renames.

After create/change, deploy, or upgrade, show the entry when it first becomes available in the thread or its address may have changed. Ordinary run replies do not repeat it. An explicit link request or “Open GTM Workflows UI” always returns it, including repeated requests.

On a personal computer, check the loopback viewer. Start only `npm run viewer` when needed, then verify its response. On a hosted agent, use the configured protected workflow origin and existing credential adapter. Report missing setup instead of guessing an address, posting localhost, deploying a missing host, or creating a public grant.

Slack uses the normal final-reply channel with one URL button labelled `Open GTM Workflows`, `style: "primary"`, and `action_id: "open_gtm_workflows"`. Its accessible text fallback includes the label and verified URL. Unrelated source links keep their own labels. Opening the button acknowledges the interaction and opens the URL; it does not run work.

Claude and Codex return `[Open GTM Workflows](verified-url)` directly, with no Block Kit JSON wrapper.

External sharing is explicit and separate. Agents call the hosted authenticated service route; browser sharing uses the protected viewer with Origin and CSRF checks. Both use the same grant validation and policy rules.
