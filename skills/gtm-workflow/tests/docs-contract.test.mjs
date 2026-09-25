// Viewer URLs in the skill's docs must carry the contract version the server checks, or agents get 409 on every call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const skill = fileURLToPath(new URL("..", import.meta.url));

test("every documented /api/viewer URL uses the current contract version", async () => {
  const [, version] = (await readFile(join(skill, "templates/lib/viewer-contract.ts"), "utf8")).match(/CONTRACT_VERSION = (\d+)/);
  const docs = ["SKILL.md", ...(await readdir(join(skill, "references"))).filter((name) => name.endsWith(".md")).map((name) => `references/${name}`)];
  let seen = 0;
  for (const doc of docs)
    for (const [url, v] of (await readFile(join(skill, doc), "utf8")).matchAll(/\/api\/viewer[\w/]*\?v=(\d+)/g)) {
      seen++;
      assert.equal(v, version, `${doc}: ${url}`);
    }
  assert.ok(seen > 0);
});
