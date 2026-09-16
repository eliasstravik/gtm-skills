import test from "node:test";
import assert from "node:assert/strict";
import { configurationValue } from "../setup/cli.mjs";
import { writeSetupConfiguration } from "../setup/configuration.mjs";
test("setup reads only explicit Config bindings and never calls a Secret value endpoint", async () => {
  const calls = [];
  let row = { id: "env", key: "GTM_VIEWER_PROTECTED", visibility: "config", type: "encrypted", target: ["production"], updatedAt: 1, value: "ciphertext" };
  const api = async (_method, path) => { calls.push(path); return path.includes("/v10/") ? { envs: [row] } : { ...row, value: "1" }; };
  assert.equal(await configurationValue(api, "project", row.key), "1");
  assert.equal(calls[1], "/v1/projects/project/env/env");
  calls.length = 0;
  await assert.rejects(configurationValue(api, "project", "BLITZ_API_KEY"), /secret_read_denied/);
  assert.equal(calls.length, 0);
  row = { ...row, visibility: "secret", type: "sensitive" };
  await assert.rejects(configurationValue(api, "project", row.key), /configuration_value_unverified/);
  assert.equal(calls.length, 1);
});
test("existing routing Config is verified and adopted without modifying its value or type", async () => {
  const data = new Map(), journal = { get: async (key) => data.get(key), set: async (key, value) => data.set(key, value) };
  const row = { id: "env", key: "GTM_VIEWER_PROTECTED", visibility: "config", type: "encrypted", target: ["production"], updatedAt: 1, value: "1" };
  const api = async (method, path) => { assert.equal(method, "GET"); return path.includes("/v10/") ? { envs: [{ ...row, value: "ciphertext" }] } : row; };
  const options = { api, journal, projectId: "project", key: row.key, value: "1", secret: false };
  assert.equal((await writeSetupConfiguration(options)).reused, true);
  assert.equal((await writeSetupConfiguration(options)).reused, true);
  row.updatedAt = 2;
  await assert.rejects(writeSetupConfiguration(options), /setup_configuration_changed/);
});
