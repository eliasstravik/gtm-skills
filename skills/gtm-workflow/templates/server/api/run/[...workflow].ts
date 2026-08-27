// gtm-lib v8
import { createHash, randomBytes } from "node:crypto";
import { defineEventHandler } from "nitro/h3";
import { start } from "workflow/api";
import {
  findLiveRun,
  insertRun,
  reconcileRun,
  updateRunPlain,
} from "../../../lib/db";

export default defineEventHandler(async (event) => {
  const requestedMethod = event.req.method;
  if (requestedMethod !== "GET" && requestedMethod !== "POST") {
    return new Response("method not allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }
  const method: "GET" | "POST" = requestedMethod;

  const authorization = event.req.headers.get("authorization");
  const acceptedSecrets = [
    process.env.GTM_RUN_SECRET,
    ...(method === "GET" ? [process.env.CRON_SECRET] : []),
  ].filter(Boolean);
  if (!acceptedSecrets.some((secret) => authorization === `Bearer ${secret}`)) {
    return error(401, "unauthorized", "A valid bearer is required.");
  }

  const expectedHead = event.req.headers.get("x-gtm-workspace-head");
  const deployedHead = process.env.VERCEL_GIT_COMMIT_SHA;
  if (
    method === "POST" &&
    expectedHead !== null &&
    (!deployedHead || expectedHead !== deployedHead)
  ) {
    return error(
      409,
      "deployment_not_ready",
      "Production is not serving the requested workspace commit.",
    );
  }

  const workflowPath = event.context.params?.workflow;
  if (!workflowPath) return error(400, "invalid_workflow", "workflow path required");
  const basename = workflowPath.split("/").at(-1)!;
  const functionName = basename.replace(/-([a-z0-9])/g, (_, character) =>
    character.toUpperCase(),
  );
  const workflowId = `workflow//./workflows/${workflowPath}//${functionName}`;
  const body = method === "POST" ? await event.req.json() : null;
  const requestUrl = new URL(event.req.url);
  const checkpointValue = requestUrl.searchParams.get("checkpoint");
  const checkpoint = checkpointValue === null ? null : Number(checkpointValue);
  if (
    checkpointValue !== null &&
    (!Number.isSafeInteger(checkpoint) || checkpoint! < 1 || method === "GET")
  ) {
    return error(400, "invalid_checkpoint", "checkpoint must be a positive POST integer");
  }

  const input = stableJson(body);
  const inputHash = createHash("sha256").update(input).digest("hex");
  const runKey = randomBytes(16).toString("hex");
  const row = {
    runKey,
    runId: null,
    workflow: basename,
    path: workflowPath,
    method,
    input,
    inputHash,
    status: "running" as const,
    checkpoint,
    startedAt: Date.now(),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await insertRun(row);
      break;
    } catch (caught) {
      const existing = await findLiveRun(workflowPath, inputHash);
      if (!existing) throw caught;
      const reconciled = await reconcileRun(existing.runKey);
      if (reconciled.finishedAt !== null && attempt === 0) continue;
      return error(
        409,
        "run_in_progress",
        `${basename} is already running as ${existing.runKey}; wait, or cancel it and run gtm runs get ${existing.runKey} to clear`,
        { runKey: existing.runKey, runId: existing.runId },
      );
    }
  }

  const meta = { runKey, slug: basename, checkpoint };
  try {
    const run =
      method === "GET"
        ? await start({ workflowId }, [null, meta])
        : await start({ workflowId }, [body, meta]);
    await updateRunPlain(runKey, { runId: run.runId });
    return Response.json({ runId: run.runId, runKey, workflow: workflowPath });
  } catch (caught) {
    await updateRunPlain(runKey, {
      status: "failed",
      error: message(caught),
      finishedAt: Date.now(),
    });
    throw caught;
  }
});

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function error(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

function message(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
