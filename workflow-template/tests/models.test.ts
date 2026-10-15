import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MODELS, defaultModel, gtmModel } from "../templates/lib/models";

test("the deployed default model follows the local subscription", () => {
  assert.equal(DEFAULT_MODELS.claude, "anthropic/claude-haiku-4.5");
  assert.equal(DEFAULT_MODELS.codex, "openai/gpt-6-luna");
  assert.equal(gtmModel({ GTM_AGENT_BACKEND: "claude" }), "anthropic/claude-haiku-4.5");
  assert.equal(gtmModel({ GTM_AGENT_BACKEND: " Claude " }), "anthropic/claude-haiku-4.5");
  assert.equal(gtmModel({ GTM_AGENT_BACKEND: "codex" }), "openai/gpt-6-luna");
  for (const other of [undefined, "", "gateway", "gemini"]) assert.equal(defaultModel(other), "openai/gpt-6-luna");
  assert.equal(gtmModel({}), "openai/gpt-6-luna");
  // On Vercel the backend variable is copied up by go-live; it still picks only the model there.
  assert.equal(gtmModel({ VERCEL: "1", GTM_AGENT_BACKEND: "claude" }), "anthropic/claude-haiku-4.5");
});

test("a model the user chose wins over the default, and an empty one counts as unset", () => {
  assert.equal(gtmModel({ GTM_AGENT_BACKEND: "claude", GTM_MODEL: "openai/gpt-6-sol" }), "openai/gpt-6-sol");
  assert.equal(gtmModel({ GTM_AGENT_BACKEND: "codex", GTM_MODEL: "anthropic/claude-sonnet-5" }), "anthropic/claude-sonnet-5");
  assert.equal(gtmModel({ GTM_AGENT_BACKEND: "claude", GTM_MODEL: "  " }), "anthropic/claude-haiku-4.5");
});

test("model ids live only in lib/models.ts", () => {
  const root = process.env.GTM_TEST_RUNTIME as string;
  const ids = /\b(?:openai|anthropic|google|xai)\/[a-z0-9][a-z0-9.-]*\b/;
  const offenders: string[] = [];
  for (const dir of ["lib", "workflows"]) {
    for (const name of readdirSync(join(root, dir), { recursive: true }) as string[]) {
      if (!/\.ts$/.test(name) || name === "models.ts") continue;
      const hit = ids.exec(readFileSync(join(root, dir, name), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""));
      if (hit) offenders.push(`${dir}/${name}: ${hit[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});
