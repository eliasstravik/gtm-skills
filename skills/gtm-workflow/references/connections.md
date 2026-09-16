# Connections and standalone setup

Connections belongs to the workflow workspace. Production runs at `/connections` inside the existing private workflow project. Local mode uses the trusted OS-keychain manager installed under `~/.gtm/components/`. The root navigation is Workflows / Connections. Public sharing contains neither the Connections page nor its management API.

## Local setup and discovery

Run these commands from the installed `gtm-workflow` skill directory, with an absolute workspace path:

```sh
node scripts/setup.mjs --local --workspace /path/to/gtm-acme --json
node scripts/connections.mjs open --workspace /path/to/gtm-acme --target local
node scripts/connections.mjs list --workspace /path/to/gtm-acme --target local --json
node scripts/doctor.mjs --workspace /path/to/gtm-acme --target local --json
```

Setup can create an empty workspace with zero workflows. It installs the reviewed component, prepares the local database, and builds inspection assets. Opening Connections or running `npm run viewer` does not start workflows. `npm run dev` deliberately starts the execution runner with the current saved credentials; restart it to apply subsequent changes.

Local provider values live in the OS credential store. macOS uses Keychain and Linux explicitly uses Secret Service. A locked or missing store requires its normal OS setup or unlock. Local state and credentials are bound to the canonical workspace path and current OS user. Another clone gets another identity. Windows local IPC remains unavailable until the Windows validation is complete.

The trusted command opens a one-use authorization link through the OS. The browser removes its fragment immediately and retains only an expiring local session capability for navigation. A copied base URL grants no access. Sign out clears that capability. Run setup and the browser on the same desktop computer; a forwarded or tunneled local origin is refused.

Existing `.env` and `.env.local` credentials remain external configuration. Precedence is the inherited environment, then `.env.local`, then `.env`; managed values and disconnect tombstones apply last. Disconnect does not erase an external copy. Inspection, builds and migrations receive a filtered environment. Submitted or stored provider values never belong in chat, CLI arguments, screenshots, source files or diagnostic output.

## Production setup without an agent

Use the existing workflow project with Vercel Authentication protecting all deployments. Run from the installed skill directory:

```sh
node scripts/setup.mjs --deploy --workspace /path/to/gtm-acme --team acme --workflow-project gtm-acme-workflows --json
```

Setup creates no projects, databases, identity applications or integrations. It saves a project-scoped Vercel API token as the Production Secret `GTM_CONNECTIONS_VERCEL_TOKEN` and three nonsecret bindings: `GTM_CONNECTIONS_ENABLED`, `GTM_CONNECTIONS_TEAM_ID`, and `GTM_CONNECTIONS_ORIGIN`. Deploy the current runtime, then open `/connections` through the normal private Workflows URL. Local provider keys stay local.

Vercel CLI OAuth sessions may reject token creation. In that case, use the signed-in Vercel account's Tokens page, select the team and **only the workflow project**, create the token, and save it directly as that project's Production Secret `GTM_CONNECTIONS_VERCEL_TOKEN`. Resume setup. Never use an account-wide or team-wide runtime token, and never paste a token in chat, arguments or source files.

Anyone admitted through a native private Vercel browser session may manage connections, including Viewers. There is no additional login, registration or administrator list. Existing agent bearer credentials retain read-only connection discovery. Automation bypasses, workload identity and workflow share grants cannot authorize connection management. Deployment-wide Vercel share links must be removed before enabling this feature.

The application checks the native session cookie's expected shape, then sends only that cookie to a fixed protected probe URL for Vercel to validate. A separate anonymous probe must be denied. Decoding a cookie alone grants no access. Mutation requests also require same-origin browser provenance and a session-bound CSRF token. A changed native cookie format or unavailable protection check fails closed. This cookie-format dependency must be verified against live Vercel during upgrades.

The project-scoped API token lives in the workflow runtime. Code deployed to that project is trusted with this token, just as it is trusted with provider credentials. Review authored code before deploying it. Keep the share companion isolated and exclude connection management from its build.

Setup reports `deployment_required`; Doctor reports `browser_verification_required` when configuration is present. Neither claims live readiness from environment metadata alone. Verify signed-in access, synthetic connection CRUD, automation denial, and public-share exclusion on the serving deployment.

## Inventory and changes

Before authoring a provider step or running a workflow, read `connections list --json` for its target, or the protected `GET /api/connections` runtime route. The hosted agent uses its existing machine transport. Inventory contains names, presence, declared usage and serving identity; it never returns a key or proves provider validity. Legacy protected `/api/link` key names remain compatible.

Known services and undeclared nonempty provider `*_API_KEY` names appear even in an empty workspace. System, infrastructure and public variables are excluded. A gateway call declares the gateway connection and may name the downstream provider in its usage metadata; it does not request a second direct-provider credential. AI Gateway platform identity is separate from an optional API key.

Declare static usage on the registry entry:

```ts
viewer: {
  // Preserve the existing viewer.id and businessGraph.
  connections: [{ connection: "monid", provider: "Blitz" }],
}
```

Omitted usage metadata means usage is incomplete, not that the connection is unused. Include a direct provider separately only when code actually calls it directly. Existing nested Claude/Codex subscription execution uses a filtered child environment; declared authenticated MCP access goes through a per-invocation adapter that injects upstream credentials outside the model process.

Add, replace and disconnect are write-only. Production edits save a Vercel Secret and await the next ordinary deployment. Local edits await a deliberate runner restart. Neither mode automatically deploys, executes a workflow, cancels in-flight work or revokes a provider credential. If a save response is lost, do not retry automatically. Refresh the metadata and explicitly enter a replacement if needed. Production uses metadata version checks before writes; Vercel does not provide an atomic compare-and-swap, so simultaneous administrators should coordinate changes. The UI says saved, not verified active. Shared, integration-owned, duplicate and multi-target variables remain read-only and link to Vercel settings.

## Upgrades

Upgrade the runtime while preserving authored workflows, tables, migrations, database contents and custom dependencies. Merge `.env.*` and generated-asset ignore entries. Copy template-owned `connections-ui/` together with the server and build changes. Run shared setup with `--upgrade` for the local component. Installed local components retain release provenance even without a Git checkout. Production Connections ships with the reviewed workflow runtime.

Run Doctor for the selected target after an upgrade. A successful build or saved registration is not production readiness: complete the live sign-in and serving-deployment verification. Provider keys are not required to onboard an empty workspace.
