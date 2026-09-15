import { CONTRACT_VERSION } from "../../lib/viewer-contract";
import { defineHandler } from "nitro";
import { getVercelOidcToken } from "@vercel/oidc";
export default defineHandler(async (event) => {
  const headers = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
  };
  const error = (status: number, message: string) =>
    Response.json(
      { version: CONTRACT_VERSION, error: { message } },
      { status, headers },
    );
  const incoming = new URL(event.req.url);
  if (incoming.searchParams.get("v") !== String(CONTRACT_VERSION))
    return error(409, "Viewer version changed. Reload this page.");
  const op = incoming.searchParams.get("op") ?? "workflow";
  if (!["meta", "workflow", "runs", "data", "export"].includes(op))
    return error(404, "View unavailable.");
  const token = event.req.headers.get("x-gtm-share-token") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    return error(404, "Link unavailable.");
  const origin = process.env.GTM_VIEWER_PRIVATE_ORIGIN;
  const project = process.env.GTM_VIEWER_PRIVATE_PROJECT_ID;
  if (!origin || !project || process.env.VERCEL_ENV !== "production")
    return error(503, "Sharing is not configured.");
  let upstream: URL;
  try {
    upstream = new URL("/api/viewer/shared", origin);
    if (upstream.protocol !== "https:" || upstream.origin !== origin)
      throw Error();
  } catch {
    return error(503, "Sharing is not configured.");
  }
  for (const key of [
    "v",
    "workflow",
    "run",
    "cursor",
    "eventCursor",
    "status",
    "period",
    "table",
    "page",
    "key",
    "relatedTable",
    "relatedKey",
    "q",
    "field",
    "operator",
    "value",
    "sort",
    "order",
    "columns",
    "children",
  ]) {
    const value = incoming.searchParams.get(key);
    if (value !== null) {
      if (value.length > 512) return error(400, "Invalid request.");
      upstream.searchParams.set(key, value);
    }
  }
  upstream.searchParams.set("op", op);
  try {
    const oidc = await getVercelOidcToken();
    if (!oidc) return error(503, "Sharing is not configured.");
    const response = await fetch(upstream, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([
        event.req.signal,
        AbortSignal.timeout(op === "export" ? 300000 : 15000),
      ]),
      headers: {
        "x-vercel-trusted-oidc-idp-token": oidc,
        "x-gtm-share-token": token,
        "x-gtm-viewer-project": project,
      },
    });
    if (
      op === "export" &&
      response.ok &&
      response.headers.get("content-type")?.includes("text/csv")
    )
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...headers,
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            'attachment; filename="workflow-current-data.csv"',
          "x-export-started-at":
            response.headers.get("x-export-started-at") ?? "",
          "x-export-consistency": "live-paginated-read",
        },
      });
    if (!response.headers.get("content-type")?.includes("application/json"))
      return error(503, "The private viewer is unavailable.");
    const reader = response.body?.getReader();
    if (!reader) return error(503, "The private viewer is unavailable.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2 * 1024 * 1024) return error(413, "Result too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const body = Buffer.concat(chunks);
    if (JSON.parse(body.toString()).version !== CONTRACT_VERSION)
      return error(503, "The private viewer needs an update.");
    return new Response(body, {
      status: response.status,
      headers,
    });
  } catch {
    return error(503, "The private viewer is unavailable.");
  }
});
