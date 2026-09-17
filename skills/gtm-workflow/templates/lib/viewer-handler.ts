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
  readBusinessData,
} from "./viewer-reader";
import {
  grants,
  ViewerError,
  policyVersion,
  decodeGrant,
} from "./viewer-grants";
import { activeLink, recoverLink, saveLink, shareUrl } from "./viewer-sharing";
import { destinations } from "./viewer-destinations";
import { rawClient } from "./db";
import { publicDisplay } from "./viewer-display";
import { bearerOk } from "./sign";
import { DataInputError, type DataPage } from "./data-api";
import { exportCsv } from "./viewer-csv";
import { connectionsOrigin } from "./viewer-link";
import { readWorkspaceData } from "./workspace-data";
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
export async function viewerApi(req: Request, shared = false, service = false) {
  try {
    if (service && (!process.env.VERCEL || !bearerOk(req)))
      throw new ViewerError(
        401,
        "unauthorized",
        "Authenticated hosted service access required.",
      );
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
    const preview =
      !shared && url.searchParams.has("preview")
        ? url.searchParams.get("preview")!.split(",")
        : undefined;
    if (
      preview &&
      (!preview.length ||
        preview.some((v) => !["logic", "runs", "data"].includes(v)) ||
        new Set(preview).size !== preview.length)
    )
      throw new ViewerError(
        400,
        "invalid_scope",
        "Choose at least one permitted view.",
      );
    const recipient = shared || Boolean(preview);
    if (preview) {
      const needed =
        operation === "workflow"
          ? "logic"
          : ["run", "runs", "events"].includes(operation)
            ? "runs"
            : ["data", "export"].includes(operation)
              ? "data"
              : undefined;
      if (operation !== "meta" && (!needed || !preview.includes(needed)))
        throw new ViewerError(
          403,
          "view_denied",
          "This view is not in the preview.",
        );
    }
    if (
      req.method !== "GET" &&
      !["saveLink", "revokeGrant"].includes(operation)
    )
      throw new ViewerError(405, "method_denied", "Read-only endpoint.");
    if (shared && req.method !== "GET")
      throw new ViewerError(405, "method_denied", "Read-only endpoint.");
    if (!shared && operation === "list") {
      const workflows = registry.map(({ id, slug, title, description }) => ({
        id,
        slug,
        title,
        description,
      }));
      return reply({
        workflows,
        environment: deploymentScope().environment,
        workspace: process.env.GTM_VIEWER_LABEL ?? "GTM workspace",
        connectionsUrl: connectionsOrigin(),
        destinations: destinations(),
      });
    }
    if (!url.searchParams.has("workflow") && ["data", "export"].includes(operation)) {
      if (recipient)
        throw new ViewerError(403, "view_denied", "Workspace data requires private access.");
      const read = async (page: URL) => {
        const client = rawClient();
        try { return await readWorkspaceData(client, page); }
        finally { client.close(); }
      };
      if (operation === "data") return reply(await read(url));
      return await exportCsv(url, async (page) => {
        const result = await read(page);
        if ("unavailable" in result)
          throw new ViewerError(404, "data_unavailable", result.unavailable);
        return result;
      }, async () => privateAccess(req), req.signal);
    }
    const entry = entryFor(url.searchParams.get("workflow") ?? "");
    let grant;
    if (shared) {
      if (!["meta", "workflow", "runs", "data", "export"].includes(operation))
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
          operation === "runs" || operation === "run" || operation === "events"
            ? "runs"
            : operation === "data" || operation === "export"
              ? "data"
              : operation === "meta"
                ? undefined
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
      case "meta":
      case "workflow": {
        const csrf = shared ? undefined : csrfCookie();
        return reply(
          {
            workflow: publicDisplay(
              entry,
              !recipient ||
                Boolean((preview ?? grant?.views)?.includes("logic")),
              !recipient,
            ),
            views: preview ?? grant?.views ?? ["logic", "runs", "data"],
            environment: deploymentScope().environment,
            workspace: process.env.GTM_VIEWER_LABEL ?? "GTM workspace",
            csrf: csrf?.value,
            shareEnabled:
              !recipient &&
              Boolean(
                process.env.VERCEL && process.env.GTM_VIEWER_SHARE_ORIGIN,
              ),
            dataShareEnabled: Boolean(currentPolicy(entry)),
            ...(!recipient
              ? {
                  destinations: destinations(entry),
                  hosted: Boolean(process.env.VERCEL),
                  dataScope: entry.sharePolicy?.tables.map((t) => ({
                    name: t.name,
                    columns: t.columns,
                    row: t.row,
                  })),
                }
              : {}),
            expiresAt: grant?.expiresAt,
          },
          200,
          csrf ? { "set-cookie": csrf.cookie } : {},
        );
      }
      case "runs":
        return reply(await readRuns(entry, url, recipient));
      case "data":
        return reply(await readBusinessData(entry, url, recipient));
      case "export":
        return await exportCsv(
          url,
          async (page) => {
            const result = await readBusinessData(entry, page, recipient);
            if ("unavailable" in result)
              throw new ViewerError(
                404,
                "data_unavailable",
                result.unavailable,
              );
            return result as DataPage;
          },
          async () =>
            shared
              ? authorizeShare(
                  entry,
                  req.headers.get("x-gtm-share-token") ?? "",
                  "data",
                )
              : privateAccess(req),
          req.signal,
        );
      case "grants": {
        const client = rawClient();
        try {
          const row = await activeLink(client, {
            ...deploymentScope(),
            workflowId: entry.id,
          });
          let url = "",
            linkError = "";
          if (row) {
            try {
              url = recoverLink(row);
            } catch (error) {
              if (!(error instanceof ViewerError)) throw error;
              // Keep the grant visible so its owner can still turn sharing off.
              linkError = error.message;
            }
          }
          return reply({
            grant: row ? decodeGrant(row) : null,
            url,
            linkError,
            policy: policyVersion(currentPolicy(entry)),
            dataScope: currentPolicy(entry)?.tables.map(
              ({ name, columns, row }) => ({ name, columns, row }),
            ),
          });
        } finally {
          client.close();
        }
      }
      case "saveLink":
      case "revokeGrant": {
        if (req.method !== "POST")
          throw new ViewerError(405, "method_denied", "POST required.");
        if (!service) requireMutation(req);
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
          const link = shareUrl(entry.id);
          const { grant, token } = await saveLink(
            client,
            { ...deploymentScope(), workflowId: entry.id },
            body,
            currentPolicy(entry),
          );
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
    if (error instanceof DataInputError)
      return reply(
        { error: { code: "invalid_query", message: error.message } },
        400,
      );
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
