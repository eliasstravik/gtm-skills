import { test } from "node:test";
import assert from "node:assert/strict";
import {
  trustShare,
  protectionHealthy,
  shareConfigurationHealthy,
} from "../scripts/viewer-config.mjs";
test("sharing trust adds only production-to-production access and preserves existing rules", () => {
  const previous = {
    projects: { existing: { customAllow: [] } },
    oidcProviders: { external: [] },
  };
  const result = trustShare(previous, "share");
  assert.deepEqual(result.projects.existing, previous.projects.existing);
  assert.deepEqual(result.oidcProviders, previous.oidcProviders);
  assert.deepEqual(result.projects.share.customAllow, [
    { from: { slugs: ["production"] }, to: { slugs: ["production"] } },
  ]);
});
test("health requires native authentication on All Deployments", () => {
  assert.ok(protectionHealthy({ ssoProtection: { deploymentType: "all" } }));
  for (const ssoProtection of [
    null,
    { deploymentType: "preview" },
    { deploymentType: "prod_deployment_urls_and_all_previews" },
  ])
    assert.equal(protectionHealthy({ ssoProtection }), false);
});
test("sharing health rejects cross-team wiring and wider trust", () => {
  const share = {
    id: "share",
    accountId: "team",
    rootDirectory: "workflows",
    buildCommand: "npm run build:share",
  };
  const privateProject = {
    accountId: "team",
    trustedSources: trustShare(undefined, "share"),
  };
  assert.ok(shareConfigurationHealthy(privateProject, share));
  assert.equal(
    shareConfigurationHealthy(privateProject, {
      ...share,
      accountId: "another-team",
    }),
    false,
  );
  assert.equal(
    shareConfigurationHealthy(
      { ...privateProject, trustedSources: { projects: { share: {} } } },
      share,
    ),
    false,
  );
});
