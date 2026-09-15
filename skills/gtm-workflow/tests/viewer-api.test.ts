import { test } from "node:test";
import assert from "node:assert/strict";
import { viewerApi } from "../templates/lib/viewer-handler";
import { migrateViewer } from "../templates/lib/viewer-grants";
import { client, runId, entry } from "./api-fixture";
process.env.VERCEL = "1";
process.env.VERCEL_PROJECT_ID = "fixture";
process.env.VERCEL_ENV = "production";
process.env.GTM_VIEWER_PROTECTED = "1";
process.env.GTM_VIEWER_SHARE_ORIGIN = "https://share.example";
process.env.GTM_RUN_SECRET = "fixture-credential";
await migrateViewer(client);
await client.execute(
  "CREATE TABLE people (key TEXT PRIMARY KEY, name TEXT, secret TEXT)",
);
await client.execute(
  "INSERT INTO people VALUES ('a', 'Ada Example', 'PRIVATE')",
);
const req = (op: string, token?: string, body?: unknown, extra = "") =>
  new Request(
    `https://private.example/api/viewer?v=1&workflow=stable&op=${op}${extra}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        "x-gtm-viewer-project": "fixture",
        ...(token ? { "x-gtm-share-token": token } : {}),
        ...(body
          ? {
              authorization: "Bearer fixture-credential",
              "content-type": "application/json",
            }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
test("UI and authenticated service adapters enforce scope on every read including CSV", async () => {
  for (let mask = 1; mask < 8; mask++) {
    const views = ["logic", "runs", "data"].filter((_, i) => mask & (1 << i));
    const created = await viewerApi(
      req("createGrant", undefined, { views }),
      false,
      true,
    );
    assert.equal(created.status, 200);
    const { url, grant } = await created.json();
    const token = new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;
    const meta = await viewerApi(req("meta", token), true);
    assert.equal(meta.status, 200);
    const projection = await meta.json();
    assert.equal(Boolean(projection.workflow.graph), views.includes("logic"));
    assert.equal(projection.shareEnabled, false);
    assert.ok(!JSON.stringify(projection).includes("PRIVATE"));
    for (const [op, view] of [
      ["workflow", "logic"],
      ["runs", "runs"],
      ["run", "runs"],
      ["events", "runs"],
      ["data", "data"],
      ["export", "data"],
    ]) {
      const response = await viewerApi(
        req(op, token, undefined, `&run=${runId}`),
        true,
      );
      assert.equal(
        response.status,
        views.includes(view) ? 200 : 403,
        `${views}: ${op}`,
      );
      const text = await response.text();
      assert.ok(!text.includes("PRIVATE"));
      if (op === "run" && views.includes("runs"))
        assert.equal(JSON.parse(text).summary.count, 40);
    }
    for (const op of [
      "list",
      "grants",
      "createGrant",
      "replaceGrant",
      "revokeGrant",
    ])
      assert.equal((await viewerApi(req(op, token), true)).status, 404);
    assert.equal(
      (
        await viewerApi(
          req("data", token, undefined, "&field=secret&value=PRIVATE"),
          true,
        )
      ).status,
      views.includes("data") ? 400 : 403,
    );
    assert.equal(
      (await viewerApi(req("meta", token, undefined, "&workflow=other"), true))
        .status,
      200,
    ); // first URL value remains scoped
    const wrong = req("meta", token);
    const wrongUrl = new URL(wrong.url);
    wrongUrl.searchParams.set("workflow", "other");
    assert.equal(
      (await viewerApi(new Request(wrongUrl, wrong), true)).status,
      404,
    );
    const replaced = await viewerApi(
      req("replaceGrant", undefined, { id: "missing", views }),
      false,
      true,
    );
    assert.equal(replaced.status, 404);
    assert.equal((await viewerApi(req("meta", token), true)).status, 200);
    await viewerApi(
      req("revokeGrant", undefined, { id: grant.id }),
      false,
      true,
    );
    assert.equal((await viewerApi(req("meta", token), true)).status, 410);
  }
});
test("browser mutations, missing service credentials, local sharing and mismatched environments deny", async () => {
  assert.equal(
    (await viewerApi(req("createGrant", undefined, { views: ["runs"] })))
      .status,
    403,
  );
  assert.equal((await viewerApi(req("meta"), false, true)).status, 401);
  const request = req("meta", "A".repeat(43));
  request.headers.set("x-gtm-viewer-project", "other");
  assert.equal((await viewerApi(request, true)).status, 403);
  delete process.env.VERCEL;
  assert.equal(
    (
      await viewerApi(
        req("createGrant", undefined, { views: ["runs"] }),
        false,
        true,
      )
    ).status,
    401,
  );
  process.env.VERCEL = "1";
});
