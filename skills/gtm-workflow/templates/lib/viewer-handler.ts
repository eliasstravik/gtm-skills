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
  readBusinessCounts,
} from "./viewer-reader";
import { grants, ViewerError } from "./viewer-grants";
import { rawClient } from "./db";
import { publicDisplay } from "./viewer-display";
import { bearerOk } from "./sign";
import { DataInputError, type DataPage } from "./data-api";
import { exportCsv } from "./viewer-csv";
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
      !["createGrant", "replaceGrant", "revokeGrant"].includes(operation)
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
              let latestRun;
              let history = "available";
              try {
                const latestUrl = new URL(req.url);
                latestUrl.search = "latest=1";
                for (let page = 0; page < 10; page++) {
                  const result = await readRuns(entry, latestUrl);
                  latestRun = result.data[0];
                  if (latestRun || !result.hasMore) break;
                  if (!result.cursor || page === 9) {
                    history = "unavailable";
                    break;
                  }
                  latestUrl.searchParams.set("cursor", result.cursor);
                }
              } catch {
                history = "unavailable";
              }
              let counts;
              try {
                counts = await readBusinessCounts(entry);
              } catch {}
              return {
                id,
                slug,
                title,
                description,
                latestRun,
                history,
                counts,
              };
            }),
          )),
        );
      return reply({
        workflows,
        environment: deploymentScope().environment,
        workspace: process.env.GTM_VIEWER_LABEL ?? "GTM workspace",
      });
    }
    const entry = entryFor(url.searchParams.get("workflow") ?? "");
    let grant;
    if (shared) {
      if (
        ![
          "meta",
          "workflow",
          "runs",
          "run",
          "events",
          "data",
          "export",
        ].includes(operation)
      )
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
      case "run":
      case "events":
        return reply(await readRun(entry, url, recipient));
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
      case "replaceGrant":
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
          let created;
          if (operation === "replaceGrant") {
            const tx = await client.transaction("write");
            try {
              const transactional = grants(tx, {
                ...deploymentScope(),
                workflowId: entry.id,
              });
              created = await transactional.create(body, currentPolicy(entry));
              await transactional.revoke(String(body.id ?? ""));
              await tx.commit();
            } catch (error) {
              await tx.rollback();
              throw error;
            } finally {
              tx.close();
            }
          } else created = await api.create(body, currentPolicy(entry));
          const { grant, token } = created;
          const link = new URL("/share", process.env.GTM_VIEWER_SHARE_ORIGIN);
          link.searchParams.set("workflow", entry.id);
          link.searchParams.set(
            "view",
            ["logic", "runs", "data"].find((v) =>
              grant.views.includes(v as any),
            )!,
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
