#!/usr/bin/env node
// Read-only unless --apply is provided. Produces a provider manifest when --manifest and --out are given.
import { readFileSync, writeFileSync } from "node:fs";
import { api, connectors, fail, parseArgs } from "./lib.mjs";
import { connectorPatch, connectorUrl, manifestForConnector, manifestIssues } from "./slack-config.mjs";
const args = parseArgs(process.argv.slice(2), { flags: ["apply"] });
if (!args.team || !args.connector) fail("usage: configure-slack.mjs --team <team> --connector <uid> [--apply] [--manifest <Slack-export.json> --out <updated.json>]");
let connector = connectors(args.team).find(c => c.uid === args.connector || c.id === args.connector);
if (!connector) fail("Slack connector not found.");
connector = api(args.team, "GET", `/v1/connect/connectors/${connector.id}`);
const patch = connectorPatch(connector);
console.log(JSON.stringify({ connector: connector.uid, changes: patch }, null, 2));
if (args.apply && Object.keys(patch).length) {
  const result = api(args.team, "PATCH", `/v2/connect/connectors/${connector.id}`, patch);
  connector = result.connector;
  console.log(JSON.stringify({ reinstallNeeded: result.reinstallNeeded ?? false, serviceSync: result.serviceSync?.status ?? "unknown", syncErrors: (result.serviceSync?.errors ?? []).map(e => e.message) }));
}
if (args.manifest) {
  const manifest = JSON.parse(readFileSync(args.manifest, "utf8"));
  console.log(JSON.stringify({ providerIssues: manifestIssues(manifest, connector) }));
  if (args.out) {
    writeFileSync(args.out, JSON.stringify(manifestForConnector(manifest, connector), null, 2) + "\n", { mode: 0o600 });
    console.log(`Prepared Slack App Manifest: ${args.out}`);
  }
}
console.log(`Connector: ${connectorUrl(args.team, connector.id)}`);
console.log(`Slack manifest: https://app.slack.com/app-settings/${connector.data.slackTeam.id}/${connector.data.appId}/app-manifest`);
console.log("Save the prepared manifest in Slack, then use the connector installation's Reinstall action and Allow. Export the saved manifest again for Doctor. A Vercel-only update is not proof that Slack has synchronized.");
