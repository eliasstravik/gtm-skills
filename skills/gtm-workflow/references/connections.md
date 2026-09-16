# Connections and standalone setup

Connections belongs to the workflow workspace. Its trusted application ships outside `templates/`, installs under the user's `~/.gtm/components/` directory, and runs on its own origin. The root navigation is Workflows / Connections. Public sharing keeps its existing Diagram, Runs and Data surface.

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

With GitHub and Vercel CLI sessions signed in, run:

```sh
node scripts/setup.mjs --deploy --workspace /path/to/gtm-acme --team acme --github-owner acme --json
```

The same command supports standalone workspaces and optional agent wiring. It publishes only an unchanged scaffold that it created; staged user work or changed scaffold files require explicit publication first. Existing authored workflows and repository changes are preserved. An existing runtime needs the current Connections route before deployment setup.

Setup binds a workflow project, a separate non-Git-connected Connections project, and the existing isolated share companion. It provisions the databases and protected transport through the CLI/API. The administration database is separate from workflow data. No public share grant is created. Local provider values stay local; enter Production keys in the protected Production form.

A current team OWNER runs provisioning. Ordinary hosted use requires Sign in with Vercel and a fresh full team membership check on every request. OWNER and MEMBER may write; DEVELOPER, VIEWER and BILLING may read. Other, unconfirmed and removed memberships are denied. Machine credentials provide runtime reads and never authorize human administration.

Each team owns an identity app and a private classic integration. Setup checks supported CLI capabilities and prepares the remaining dashboard steps. Follow the exact stage result rather than inventing a registration command. Keep the local callback listener running. Use the authenticated local password form for registration secrets; the installation callback validates the same CLI owner and only the fixed workflow project before the owner CLI writes the administration Secret. The hosted app has no bootstrap endpoint.

After registration, setup resumes deployment automatically. Sign in on the resulting Connections origin, open **Setup verification**, and download the safe verification file. It proves the current owner session, installation, manager deployment and serving workflow deployment; it contains no credentials. Finish within five minutes:

```sh
node scripts/setup.mjs --deploy --workspace /path/to/gtm-acme --team acme --github-owner acme --verification /path/to/connections-verification.json --json
```

Exit 0 means verified ready; exit 2 names one remaining human step; exit 1 identifies a failure. A failed deployment resumes without rewriting saved credentials. An uncertain Secret write requires explicit reapplication of the staged grant in the local setup form. Expired bootstrap credentials are removed; any installation requiring revocation is reported separately. Verified completion deletes temporary registration credentials from the OS store.

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

Add, replace and disconnect are write-only. Production edits save a Vercel Secret and await the next ordinary deployment. Local edits await a deliberate runner restart. Neither mode automatically deploys, executes a workflow, cancels in-flight work or revokes a provider credential. Uncertain saves remain unresolved; refresh and explicitly replace them before continuing. “Deployment refreshed after save” describes deployment timing, not proof of which key value ran.

## Upgrades

Upgrade the runtime while preserving authored workflows, tables, migrations, database contents and custom dependencies. Merge `.env.*` and generated-asset ignore entries. Then run shared setup with `--upgrade` to install another immutable component and explicitly select the published workflow source. Ordinary retries retain their source commit. The component's source commit and content digest are verified before deployment; installed skill copies carry release provenance even without a Git checkout.

Run Doctor for the selected target after an upgrade. A successful build or saved registration is not production readiness: complete the live sign-in and serving-deployment verification. Provider keys are not required to onboard an empty workspace.
