# Workflow viewer

## Open without execution

`npm run viewer` serves an existing local database on loopback. Opening Workflows starts no workflows, providers, migrations, schedules or inspectors. Workflows is a name-and-purpose list; a selected workflow has Diagram, Runs and Data. Runs lists metadata only. Detailed debugging and database administration use verified native destinations.

## Author the business diagram

Every registry entry has a permanent `viewer.id` UUID. Assign it with `npm run viewer:register` for a new workflow and preserve it through updates, renames and upgrades.

Create and Update author a literal `viewer.businessGraph` next to the workflow code, or in an imported literal metadata module. The shape is `BusinessGraph` in `lib/viewer-contract.ts`:

```ts
businessGraph: {
  nodes: [
    { id: "input", label: "New companies", kind: "input",
      explanation: "Use the companies submitted for this run." },
    { id: "qualify", label: "Meets our criteria?", kind: "decision",
      explanation: "Check the company's size and market against our ICP.",
      details: { provider: "Company lookup", caching: "Reuse results for one day." },
      source: { path: "workflows/qualify.ts", line: 12 } },
    { id: "save", label: "Save qualified companies", kind: "output",
      explanation: "Keep matching companies for the sales team." },
    { id: "skip", label: "Record non-matches", kind: "output",
      explanation: "Record why the company did not qualify." }
  ],
  edges: [
    { id: "a", source: "input", target: "qualify" },
    { id: "b", source: "qualify", target: "save", label: "Yes" },
    { id: "c", source: "qualify", target: "skip", label: "No" }
  ]
}
```

Use only branches and outputs that exist in the authored code. Read the workflow and any business-relevant helpers; do not generate the graph by hiding compiler nodes and reconnecting edges. Stable node IDs survive label changes. Kinds are input, action, decision and output. Every node needs a label and explanation; decision edges need meaningful labels. Optional owner details have only provider, caching and notes. Optional source paths must reference existing TypeScript files under workflows or lib, with valid line numbers.

Run `node scripts/build-viewer.mjs` before reporting Create, Update or Upgrade complete. It validates the graph and sources without importing execution code. Missing metadata fails the build. Review business truth against code separately; validation cannot prove it. Shared projections include business labels, edges and explanations only. The viewer never falls back to compiler graphs. Existing compiler metadata may still support execution tooling but does not control the diagram.

## Native destinations

The owner deployment supplies these optional verified settings:

- `GTM_VIEWER_REPOSITORY`: GitHub owner/repository. `GTM_VIEWER_REPOSITORY_ROOT`: runtime directory inside the repository, usually workflows. Source links require the exact `VERCEL_GIT_COMMIT_SHA`, or an explicitly provided `GTM_VIEWER_COMMIT`.
- `GTM_VIEWER_VERCEL_RUNS_URL`: verified Vercel project runs page including its environment query. The resolver adds the selected run ID.
- `GTM_VIEWER_DATABASE_URL`: verified database page on app.turso.tech.
- Local only: `GTM_VIEWER_INSPECTOR_URL` and `GTM_VIEWER_INSPECTOR_STORE=local`, only after confirming that inspector uses this runtime's local store. `GTM_VIEWER_DRIZZLE_URL` names the actual Drizzle instance.

Missing destinations omit the action. Local source falls back to Copy file path. Hosted/shared responses omit local paths; shared responses omit all owner destinations. Browsing never starts native tools.

## Private access and sharing

Keep native Vercel Authentication on All Deployments and set `GTM_VIEWER_PROTECTED=1` only after verifying it. Keep the existing agent's exact-origin gate and execution credentials. Browser mutations require Origin and CSRF; authenticated service mutations use the existing bearer and platform gate.

The separate share project uses `npm run build:share`, with only `GTM_VIEWER_PRIVATE_ORIGIN` and `GTM_VIEWER_PRIVATE_PROJECT_ID`. Configure its production deployment as a Trusted Source of its private project. The fixed GET proxy supplies short-lived OIDC identity. No database, provider, run, cron or link encryption key belongs on the share project.

Share starts with Diagram checked, independent of the owner's current tab. Runs and Data are optional; any nonempty available scope works. A workflow/environment has one reusable active link with no expiry. Copy recovers it across owner sessions. Save changes the scope atomically without changing the URL. Turn off immediately denies subsequent requests. Re-enable generates a new secret. Canonical URLs omit the tab and open the first allowed tab in Diagram, Runs, Data order.

Data requires `viewer.sharePolicy: DataPolicy` covering all displayed tables, columns, label/primary keys and relation through-tables. Row policy `{version: "all-v1"}` allows all rows; `{version: "team-v1", column: "team", equals: "sales"}` restricts rows. Data includes the permitted live dataset regardless of the owner's current filters. Keep the Share dialog to tab choices and link controls, without a table/column inventory or explanatory data-scope text. Policy changes pause Data only; Diagram/Runs stay available. Show a short changed-access notice and require an explicit save of the current policy hash. A second policy change rejects the save.

The service adapter is `/api/viewer/service?v=2&workflow=<id>&op=<operation>`. Read `grants` for the current grant, policy hash and data scope. POST `saveLink` with `{views, policy, save}`. Use `save: true` only for explicitly approved scope/policy changes; ordinary Copy recovers the saved link. POST `revokeGrant` with `{id}`. Return exactly the server URL.

## Encryption, upgrade and rollback

Provision `GTM_VIEWER_LINK_KEY` on the private owner deployment only, as 32 random bytes encoded in 64 hexadecimal characters. Back it up in the operator's secret manager before rollout. AES-256-GCM uses a fresh nonce and authenticates the version, workspace, environment, workflow and grant ID. Storage retains only the token hash and encrypted token; public authorization uses the hash. No plaintext in logs, local storage or metadata.

A missing or wrong key disables recovery; it never opens public access or silently replaces the token. Restore the original key, or explicitly revoke/recreate affected links. Planned key rotation must decrypt each active envelope with the old key, authenticate its scope, and re-encrypt with a fresh nonce under the new key before switching configuration. Keep both keys backed up through verification.

Upgrade the template runtime while preserving authored files, tables, migrations, workflow IDs, schedules, credentials and saved data. Author business graphs for all existing workflows by reading their code. Build, then explicitly run `node scripts/viewer-migrate.mjs`. The additive migration adds encrypted storage and a uniqueness constraint, then revokes legacy links only for registered workflows in the current workspace/environment. Old links stop working; owners must copy new links. Business tables and runs remain untouched.

Deploy matching private/share contract version 2 together. Mixed versions fail closed. Retain source revisions and previous deployment IDs. Roll back both applications together without dropping metadata or restoring revoked links.

## Read-only data

Data supports bounded server-side search, filter, sort and stable tie-break ordering. CSV includes the full filtered permitted dataset, checks authorization during streaming, escapes values and neutralizes spreadsheet formulas. Export cancellation stops the request. Record values may change during export; it is a live paginated read.

## Connections navigation

Deployed private Workflows and Connections share the existing Workflows origin. Local Connections uses a separate trusted manager. Use the shared [Connections setup](connections.md) for either environment. The share build has no Connections navigation, routes, source, configuration, or connection metadata. Opening either private page never starts workflow execution.
