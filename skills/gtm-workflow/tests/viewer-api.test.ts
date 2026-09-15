import { test } from "node:test";
import assert from "node:assert/strict";
import { viewerApi } from "../templates/lib/viewer-handler";
import { migrateViewer } from "../templates/lib/viewer-grants";
import { client, runId, entry, fixtureRuns, run } from "./api-fixture";
Object.assign(process.env, {
  VERCEL: "1",
  VERCEL_PROJECT_ID: "fixture",
  VERCEL_ENV: "production",
  GTM_VIEWER_PROTECTED: "1",
  GTM_VIEWER_SHARE_ORIGIN: "https://share.example",
  GTM_RUN_SECRET: "fixture-credential",
  GTM_VIEWER_LINK_KEY: "ab".repeat(32),
});
await migrateViewer(client);
await client.execute(
  "CREATE TABLE people (key TEXT PRIMARY KEY, name TEXT, secret TEXT)",
);
await client.execute(
  "INSERT INTO people VALUES ('a', 'Ada Example', 'PRIVATE')",
);
const req = (op: string, token?: string, body?: unknown, extra = "") =>
  new Request(
    `https://private.example/api/viewer?v=2&workflow=stable&op=${op}${extra}`,
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
test("all seven scopes enforce direct API reads and CSV, while canonical links omit a tab", async () => {
  for (let mask = 1; mask < 8; mask++) {
    const views = ["logic", "runs", "data"].filter((_, i) => mask & (1 << i));
    const current = await (await viewerApi(req("grants"))).json();
    const created = await viewerApi(
      req("saveLink", undefined, { views, policy: current.policy }),
      false,
      true,
    );
    assert.equal(created.status, 200);
    const { url, grant } = await created.json();
    assert.equal(new URL(url).searchParams.has("view"), false);
    const token = new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;
    const projection = await (await viewerApi(req("meta", token), true)).json();
    assert.equal(
      Boolean(projection.workflow.businessGraph),
      views.includes("logic"),
    );
    assert.equal(projection.shareEnabled, false);
    assert.equal(projection.destinations, undefined);
    assert.ok(!JSON.stringify(projection).includes("PRIVATE"));
    for (const [op, view] of [
      ["workflow", "logic"],
      ["runs", "runs"],
      ["data", "data"],
      ["export", "data"],
    ]) {
      const response = await viewerApi(req(op, token), true);
      assert.equal(
        response.status,
        views.includes(view) ? 200 : 403,
        `${views}: ${op}`,
      );
      assert.ok(!(await response.text()).includes("PRIVATE"));
    }
    for (const op of [
      "list",
      "grants",
      "saveLink",
      "revokeGrant",
      "run",
      "events",
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
    const wrong = req("meta", token),
      wrongUrl = new URL(wrong.url);
    wrongUrl.searchParams.set("workflow", "other");
    assert.equal(
      (await viewerApi(new Request(wrongUrl, wrong), true)).status,
      404,
    );
    await viewerApi(
      req("revokeGrant", undefined, { id: grant.id }),
      false,
      true,
    );
    assert.equal((await viewerApi(req("meta", token), true)).status, 410);
  }
});
test("browser mutation needs CSRF and both contract and environment identity must match", async () => {
  assert.equal(
    (await viewerApi(req("saveLink", undefined, { views: ["runs"] }))).status,
    403,
  );
  assert.equal((await viewerApi(req("meta"), false, true)).status, 401);
  const request = req("meta", "A".repeat(43));
  request.headers.set("x-gtm-viewer-project", "other");
  assert.equal((await viewerApi(request, true)).status, 403);
  const old = new URL(req("meta").url);
  old.searchParams.set("v", "1");
  assert.equal((await viewerApi(new Request(old))).status, 409);
});
test("list needs no run hydration; sparse run pages reach later top-level matches", async () => {
  const list = await (await viewerApi(req("list"))).json();
  assert.deepEqual(
    Object.keys(list.workflows[0]).sort(),
    ["description", "id", "slug", "title"].sort(),
  );
  const originals = [...fixtureRuns];
  fixtureRuns.splice(
    0,
    fixtureRuns.length,
    ...Array.from({ length: 210 }, (_, i) => ({
      ...run,
      runId: "wrun_" + String(i).padStart(26, "0"),
      attributes: { ...run.attributes, "gtm.viewer.parent": runId },
    })),
    run,
  );
  try {
    const first = await (await viewerApi(req("runs"))).json();
    assert.equal(first.data.length, 0);
    assert.equal(first.hasMore, true);
    const next = await (
      await viewerApi(
        req("runs", undefined, undefined, "&cursor=" + first.cursor),
      )
    ).json();
    assert.equal(next.data.length, 1);
    assert.equal(next.data[0].id, runId);
    assert.equal(next.hasMore, false);
    assert.equal(next.data[0].attributes, undefined);
    assert.equal(next.data[0].input, undefined);
  } finally {
    fixtureRuns.splice(0, fixtureRuns.length, ...originals);
  }
});
test("stale Data policy preserves Diagram and requires explicit current-policy save", async () => {
  const current = await (await viewerApi(req("grants"))).json();
  const created = await (
    await viewerApi(
      req("saveLink", undefined, {
        views: ["logic", "data"],
        policy: current.policy,
      }),
      false,
      true,
    )
  ).json();
  const token = new URLSearchParams(new URL(created.url).hash.slice(1)).get(
    "token",
  )!;
  entry.sharePolicy.version = "2";
  assert.equal((await viewerApi(req("meta", token), true)).status, 200);
  assert.equal((await viewerApi(req("workflow", token), true)).status, 200);
  assert.equal((await viewerApi(req("data", token), true)).status, 403);
  assert.equal(
    (
      await viewerApi(
        req("saveLink", undefined, {
          views: ["logic", "data"],
          policy: current.policy,
          save: true,
        }),
        false,
        true,
      )
    ).status,
    409,
  );
  const revised = await (await viewerApi(req("grants"))).json();
  const saved = await (
    await viewerApi(
      req("saveLink", undefined, {
        views: ["logic", "data"],
        policy: revised.policy,
        save: true,
      }),
      false,
      true,
    )
  ).json();
  assert.equal(saved.url, created.url);
  assert.equal((await viewerApi(req("data", token), true)).status, 200);
});
