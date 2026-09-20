import { test, after } from "node:test";
import assert from "node:assert/strict";
import { viewerApi } from "../templates/lib/viewer-handler";
import { closeDb, db } from "../templates/lib/db";
import { testDatabase } from "./db";
import { csrfCookie } from "../templates/lib/viewer-access";
import { runId, entry, fixtureRuns, run } from "./api-fixture";
Object.assign(process.env, {
  VERCEL: "1",
  VERCEL_PROJECT_ID: "fixture",
  VERCEL_ENV: "production",
  GTM_VIEWER_PROTECTED: "1",
  GTM_VIEWER_SHARE_ORIGIN: "https://share.example",
  GTM_RUN_SECRET: "fixture-credential",
  GTM_VIEWER_LINK_KEY: "ab".repeat(32),
});
// The real lib/db.ts on a migrated test database; only the table registry and the workflow runtime are stand-ins.
await testDatabase();
const client = db();
after(closeDb);
await client.execute(
  "CREATE TABLE fixture_people (key TEXT PRIMARY KEY, name TEXT, secret TEXT)",
);
await client.execute(
  "INSERT INTO fixture_people VALUES ('a', 'Ada Example', 'PRIVATE')",
);
test("workspace data and export are private, independent of workflow registration", async () => {
  await client.execute("CREATE TABLE unregistered (id INTEGER, name TEXT)");
  await client.execute("INSERT INTO unregistered VALUES (1, 'Independent')");
  const request = (op: string, extra = "", host = "private.example") => new Request(
    `https://${host}/api/viewer?v=3&op=${op}&table=unregistered${extra}`,
    { headers: { host, "x-gtm-viewer-project": "fixture" } },
  );
  const result = await viewerApi(request("data"));
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.total, 1);
  assert.ok(data.tabs.some((t: any) => t.label === "unregistered"));
  assert.ok((await (await viewerApi(request("export"))).text()).includes("Independent"));
  for (const op of ["data", "export"]) {
    assert.equal((await viewerApi(request(op), true)).status, 403);
    assert.equal((await viewerApi(request(op, "&preview=data"))).status, 403);
    assert.equal((await viewerApi(request(op, "&workflow=stable"))).status, 400);
  }
  const hosted = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    assert.equal((await viewerApi(request("data"))).status, 403);
    assert.equal((await viewerApi(request("data", "", "localhost"))).status, 200);
  } finally { process.env.VERCEL = hosted; }
});
const req = (op: string, token?: string, body?: unknown, extra = "") =>
  new Request(
    `https://private.example/api/viewer?v=3&workflow=stable&op=${op}${extra}`,
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
test("opening sharing recovers the link without enabling it, and recovery failure still allows revocation", async () => {
  const initial = await (await viewerApi(req("grants"))).json();
  assert.equal(initial.grant, null);
  assert.equal(initial.url, "");
  const created = await (
    await viewerApi(
      req("saveLink", undefined, { views: ["logic"] }),
      false,
      true,
    )
  ).json();
  const before = await client.execute("SELECT * FROM gtm.gtm_viewer_grants");
  const recoveredResponse = await viewerApi(req("grants"));
  assert.match(recoveredResponse.headers.get("cache-control")!, /no-store/);
  const recovered = await recoveredResponse.json();
  assert.equal(recovered.url, created.url);
  assert.equal(recovered.grant.id, created.grant.id);
  assert.deepEqual(
    (await client.execute("SELECT * FROM gtm.gtm_viewer_grants")).rows,
    before.rows,
  );
  const key = process.env.GTM_VIEWER_LINK_KEY;
  try {
    process.env.GTM_VIEWER_LINK_KEY = "cd".repeat(32);
    const unavailable = await (await viewerApi(req("grants"))).json();
    assert.equal(unavailable.grant.id, created.grant.id);
    assert.equal(unavailable.url, "");
    assert.match(unavailable.linkError, /cannot be recovered/);
    assert.equal(
      (
        await viewerApi(
          req("revokeGrant", undefined, { id: unavailable.grant.id }),
          false,
          true,
        )
      ).status,
      200,
    );
    const disabled = await (await viewerApi(req("grants"))).json();
    assert.equal(disabled.grant, null);
    assert.equal(disabled.url, "");
  } finally {
    process.env.GTM_VIEWER_LINK_KEY = key;
  }
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
test("local workflows do not advertise sharing and reject enabling it", async () => {
  const vercel = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const url = "http://localhost:3939/api/viewer?v=3&workflow=stable";
    const meta = await (
      await viewerApi(
        new Request(url + "&op=meta", {
          headers: { host: "localhost:3939" },
        }),
      )
    ).json();
    assert.equal(meta.hosted, false);
    assert.equal(meta.shareEnabled, false);
    const csrf = csrfCookie();
    const response = await viewerApi(
      new Request(url + "&op=saveLink", {
        method: "POST",
        headers: {
          host: "localhost:3939",
          origin: "http://localhost:3939",
          cookie: csrf.cookie,
          "x-gtm-csrf": csrf.value,
          "content-type": "application/json",
        },
        body: JSON.stringify({ views: ["logic"] }),
      }),
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "sharing_disabled");
  } finally {
    process.env.VERCEL = vercel;
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
  entry.sharePolicy.tables[0].row.version = "2";
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

test("shared profile API scopes details, nested projections and both export formats", async () => {
  const { people, companies } = await import(
    "../templates/lib/profiles/schema"
  );
  const { profileView } = await import("../templates/lib/profiles/view");
  const { tables } = await import("./api-fixture");
  Object.assign(tables, { people, companies });
  Object.assign(entry, profileView("stable"));
  for (const [key, workflow] of [
    ["a", "stable"],
    ["b", "foreign"],
  ]) {
    await client.insert(people).values({
      key,
      created_at: new Date("2026-09-16"),
      updated_at: new Date("2026-09-16"),
      full_name: key === "a" ? "Ada, Example" : "FOREIGN PERSON",
      sources_json: [{ workflow_id: workflow, network_owner: "PRIVATE" }],
      experiences_json: [
        {
          title: "Founder",
          company_key: "c",
          company_name: "Shared Co",
          current_status: "current",
          original: { secret: "PRIVATE" },
        },
      ],
      raw_responses_json: { secret: "PRIVATE" },
    });
  }
  await client.insert(companies).values({ key: "c", created_at: new Date("2026-09-16"), updated_at: new Date("2026-09-16"), name: "Shared Co" });
  const current = await (await viewerApi(req("grants"))).json();
  const created = await viewerApi(
    req("saveLink", undefined, {
      views: ["data"],
      policy: current.policy,
      save: true,
    }),
    false,
    true,
  );
  assert.equal(created.status, 200);
  const { url } = await created.json(),
    token = new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;
  for (const extra of [
    "&table=people",
    "&table=people&key=a",
    "&table=people&relatedTable=companies&relatedKey=c",
    "&table=companies",
  ]) {
    const response = await viewerApi(
      req("data", token, undefined, extra),
      true,
    );
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(!body.includes("PRIVATE"));
    assert.ok(!body.includes("FOREIGN PERSON"));
  }
  assert.equal(
    (
      await (
        await viewerApi(
          req("data", token, undefined, "&table=people&key=b"),
          true,
        )
      ).json()
    ).total,
    0,
  );
  for (const op of ["data", "export"])
    for (const col of ["raw_responses_json", "sources_json", "provenance_json"])
      assert.equal(
        (
          await viewerApi(
            req(op, token, undefined, "&table=people&columns=" + col),
            true,
          )
        ).status,
        400,
      );
  const json = await viewerApi(
    req("export", token, undefined, "&table=people&format=json"),
    true,
  );
  assert.equal(json.status, 200);
  assert.match(json.headers.get("content-type")!, /application\/json/);
  const rows = await json.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].experiences_json[0].title, "Founder");
  assert.equal(rows[0].experiences_json[0].original, undefined);
  const csv = await (
    await viewerApi(req("export", token, undefined, "&table=people"), true)
  ).text();
  assert.ok(csv.includes('"Ada, Example"'));
  assert.ok(csv.includes('""title""'));
  assert.ok(!csv.includes("FOREIGN PERSON"));
  entry.sharePolicy.version = "unsupported";
  assert.equal((await viewerApi(req("data", token), true)).status, 403);
});
test("private link discovery exposes only the fixed Connections origin and share mode omits it", async () => {
  const { viewerLink } = await import("../templates/lib/viewer-link");
  const request = new Request("https://private.example/api/link");
  const previous = process.env.GTM_CONNECTIONS_ORIGIN;
  try {
    process.env.GTM_CONNECTIONS_ORIGIN = "https://connections.example";
    assert.equal(viewerLink(request).connectionsUrl, "https://connections.example");
    for (const value of ["http://connections.example", "https://connections.example/path", "https://user:pass@connections.example", "https://connections.example/#capability"]) {
      process.env.GTM_CONNECTIONS_ORIGIN = value;
      assert.equal(viewerLink(request).connectionsUrl, undefined);
    }
    process.env.GTM_CONNECTIONS_ORIGIN = "https://connections.example";
    process.env.GTM_VIEWER_MODE = "share";
    assert.equal(viewerLink(request).connectionsUrl, undefined);
  } finally {
    delete process.env.GTM_VIEWER_MODE;
    if (previous === undefined) delete process.env.GTM_CONNECTIONS_ORIGIN;
    else process.env.GTM_CONNECTIONS_ORIGIN = previous;
  }
});
