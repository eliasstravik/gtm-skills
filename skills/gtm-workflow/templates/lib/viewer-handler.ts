import { CONTRACT_VERSION } from "./viewer-contract";
import {
  privateAccess,
  requireMutation,
  csrfCookie,
  viewerHeaders,
  boundedJson,
  deploymentScope,
} from "./viewer-access";
import {
  entryFor,
  registry,
  currentPolicy,
  authorizeShare,
  readRuns,
  readRun,
  readBusinessData,
} from "./viewer-reader";
import { grants, ViewerError } from "./viewer-grants";
import { rawClient } from "./db";
const reply = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(
    { version: CONTRACT_VERSION, ...(data as object) },
    { status, headers: { ...viewerHeaders, ...headers } },
  );
const failures = new Map<string, { count: number; until: number }>();
export async function viewerApi(req: Request, shared = false) {
  try {
    if (!shared) privateAccess(req);
    if (
      shared &&
      (process.env.GTM_VIEWER_PROTECTED !== "1" ||
        req.headers.get("x-gtm-viewer-project") !== deploymentScope().workspace)
    )
      throw new ViewerError(
        403,
        "scope_mismatch",
        "Sharing deployment identity mismatch.",
      );
    const url = new URL(req.url);
    if (url.searchParams.get("v") !== String(CONTRACT_VERSION))
      throw new ViewerError(
        409,
        "contract_mismatch",
        "Update the viewer and sharing deployment together.",
      );
    const operation = url.searchParams.get("op") ?? "workflow";
    if (
      req.method !== "GET" &&
      !["createGrant", "revokeGrant"].includes(operation)
    )
      throw new ViewerError(405, "method_denied", "Read-only endpoint.");
    if (shared && req.method !== "GET")
      throw new ViewerError(405, "method_denied", "Read-only endpoint.");
    if (!shared && operation === "list") {
      const workflows = [];
      for (let i = 0; i < registry.length; i += 4)
        workflows.push(
          ...(await Promise.all(
            registry.slice(i, i + 4).map(async (entry) => {
              const { id, slug, title, description } = entry;
              let latestStatus;
              try {
                latestStatus = (await readRuns(entry, new URL(req.url))).data[0]
                  ?.status;
              } catch {}
              return { id, slug, title, description, latestStatus };
            }),
          )),
        );
      return reply({ workflows, environment: deploymentScope().environment });
    }
    const entry = entryFor(url.searchParams.get("workflow") ?? "");
    let grant;
    if (shared) {
      if (!["workflow", "runs", "run", "data"].includes(operation))
        throw new ViewerError(404, "not_found", "View unavailable.");
      const key =
        req.headers.get("x-vercel-forwarded-for") ??
        req.headers.get("x-forwarded-for") ??
        "unknown";
      const limit = failures.get(key);
      if (limit && limit.until > Date.now() && limit.count >= 30)
        throw new ViewerError(
          429,
          "rate_limit",
          "Too many invalid links. Try again later.",
        );
      try {
        grant = await authorizeShare(
          entry,
          req.headers.get("x-gtm-share-token") ?? "",
          operation === "runs" || operation === "run"
            ? "runs"
            : operation === "data"
              ? "data"
              : "logic",
        );
      } catch (error) {
        if (failures.size > 1000) failures.clear();
        failures.set(key, {
          count: limit && limit.until > Date.now() ? limit.count + 1 : 1,
          until: Date.now() + 60000,
        });
        throw error;
      }
    }
    switch (operation) {
      case "workflow": {
        const csrf = shared ? undefined : csrfCookie();
        const { id, slug, title, description, graph, revision } = entry;
        return reply(
          {
            workflow: { id, slug, title, description, graph, revision },
            views: grant?.views ?? ["logic", "runs", "data"],
            environment: deploymentScope().environment,
            csrf: csrf?.value,
            shareEnabled:
              !shared &&
              Boolean(
                process.env.VERCEL && process.env.GTM_VIEWER_SHARE_ORIGIN,
              ),
            dataShareEnabled: Boolean(currentPolicy(entry)),
            expiresAt: grant?.expiresAt,
          },
          200,
          csrf ? { "set-cookie": csrf.cookie } : {},
        );
      }
      case "runs":
        return reply(await readRuns(entry, url, shared));
      case "run":
        return reply(await readRun(entry, url, shared));
      case "data":
        return reply(await readBusinessData(entry, url, shared));
      case "grants": {
        const client = rawClient();
        try {
          return reply({
            grants: await grants(client, {
              ...deploymentScope(),
              workflowId: entry.id,
            }).list(),
          });
        } finally {
          client.close();
        }
      }
      case "createGrant":
      case "revokeGrant": {
        if (req.method !== "POST")
          throw new ViewerError(405, "method_denied", "POST required.");
        requireMutation(req);
        if (!process.env.VERCEL || !process.env.GTM_VIEWER_SHARE_ORIGIN)
          throw new ViewerError(
            409,
            "sharing_disabled",
            "Open the hosted private viewer to share.",
          );
        const body = await boundedJson(req);
        const client = rawClient();
        try {
          const api = grants(client, {
            ...deploymentScope(),
            workflowId: entry.id,
          });
          if (operation === "revokeGrant") {
            await api.revoke(String(body.id ?? ""));
            return reply({ revoked: true });
          }
          const { grant, token } = await api.create(body, currentPolicy(entry));
          const link = new URL("/share", process.env.GTM_VIEWER_SHARE_ORIGIN);
          link.searchParams.set("workflow", entry.id);
          link.hash = new URLSearchParams({ token }).toString();
          return reply({ grant, url: link.href });
        } finally {
          client.close();
        }
      }
      default:
        throw new ViewerError(404, "not_found", "View not found.");
    }
  } catch (error) {
    if (error instanceof ViewerError)
      return reply(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    return reply(
      {
        error: {
          code: "unavailable",
          message: "This view is temporarily unavailable.",
        },
      },
      503,
    );
  }
}
