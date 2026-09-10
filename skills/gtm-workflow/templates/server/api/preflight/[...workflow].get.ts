// gtm-lib v22
import { defineEventHandler } from "nitro/h3";
import { useStorage } from "nitro/storage";
import { executeReadOnly } from "../../../lib/db";
import { preflightWorkflow } from "../../../lib/preflight";
import { workflowModel } from "../../../lib/model";

export default defineEventHandler(async (event) => {
  const headers = { "cache-control": "no-store" };
  if (!process.env.GTM_RUN_SECRET || event.req.headers.get("authorization") !== `Bearer ${process.env.GTM_RUN_SECRET}`) {
    return Response.json({ error: { code: "unauthorized", message: "A valid bearer is required." } }, { status: 401, headers });
  }
  const path = event.context.params?.workflow ?? "";
  if (!/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) {
    return Response.json({ error: { code: "invalid_workflow", message: "workflow path required" } }, { status: 400, headers });
  }
  const readSource = async (file: string) => {
    const [directory, ...parts] = file.split("/");
    const raw = await useStorage(`assets/${directory}`).getItemRaw(parts.join(":"));
    return raw == null ? null : typeof raw === "string" ? raw : Buffer.from(raw as Uint8Array).toString("utf8");
  };
  if (await readSource(`workflows/${path}.ts`) === null) {
    return Response.json({ error: { code: "not_found", message: "Unknown workflow" } }, { status: 404, headers });
  }
  const result = await preflightWorkflow(path, { readSource, tableExists: async (table) => {
    const rows = await executeReadOnly(`select name from sqlite_master where type = 'table' and name = '${table.replace(/'/g, "''")}' limit 1`);
    return rows.length > 0;
  } });
  return Response.json({ ...result, head: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    modelDefaults: { backend: process.env.GTM_AGENT_BACKEND || "api", model: workflowModel() } }, { status: result.ok ? 200 : 503, headers });
});
